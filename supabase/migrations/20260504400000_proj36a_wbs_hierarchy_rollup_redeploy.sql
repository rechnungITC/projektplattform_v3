-- =============================================================================
-- PROJ-36 Phase 36-α — WBS hierarchy + WBS-Code + Hybrid Roll-up (RE-DEPLOY)
-- =============================================================================
-- Re-deploy of commit f6089f8 (`feat(PROJ-36): backend phase 36-α`), which
-- was reverted in commit a98e4c8 before reaching production. Subsequently
-- the γ-frontend (commit 0b09c8c) was deployed assuming α was live, which
-- caused PostgREST 42703 errors in production (silenced by a swallow-all
-- error handler in `useWorkItems`). Hotfix 276d384 restored the backlog
-- by removing the columns from the SELECT; this migration restores the
-- schema so the columns are real again.
--
-- Compatibility with PROJ-9-R2 (deployed 20260503200000):
--   - R2 added `tg_work_items_cleanup_dependencies` AFTER DELETE on
--     work_items — separate trigger, separate purpose. Coexists.
--   - R2's `_tracked_audit_columns()` already includes wbs_code +
--     wbs_code_is_custom for work_items. This file's CREATE OR REPLACE
--     is byte-identical → no-op overwrite.
--   - No column or table conflict.
--
-- Idempotency: every DDL guarded with IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE. Safe to re-run on top of partial state if needed.
--
-- Additive migration. No schema replacement, no data destruction.
-- Rollback strategy: DROP COLUMN + DROP TRIGGER + DROP EXTENSION (only if no
-- other consumer). All new columns are nullable; existing reads are
-- unaffected.
--
-- What this builds:
--   1. ltree extension enabled (Postgres standard, default_version 1.3).
--   2. 6 new columns on work_items:
--        outline_path ltree, wbs_code text, wbs_code_is_custom boolean
--        derived_planned_start date, derived_planned_end date,
--        derived_estimate_hours numeric(10,2)
--   3. GIST index on outline_path for sub-tree queries (O(log n) ancestor /
--      descendant lookup).
--   4. UNIQUE constraint on (project_id, parent_id, wbs_code) — siblings
--      cannot collide; cross-sibling collisions allowed.
--   5. Three triggers:
--        - tg_work_items_36a_outline_path_self (BEFORE INSERT/UPDATE OF
--          parent_id, position): computes NEW.outline_path based on parent
--          + sibling row-number.
--        - tg_work_items_36a_outline_path_cascade (AFTER UPDATE WHEN path
--          changed): bulk-update descendant paths via subpath replacement.
--        - tg_work_items_36a_wbs_code_autogen (BEFORE INSERT/UPDATE):
--          generates wbs_code from outline_path when wbs_code_is_custom=false.
--        - tg_work_items_36a_rollup_recompute (AFTER INSERT/UPDATE/DELETE
--          WHEN cost-driver changed): walks ancestors via ltree-subpath and
--          recomputes derived_planned_start/end/estimate_hours.
--   6. Initial backfill for outline_path + wbs_code on all existing rows.
--   7. _tracked_audit_columns extended for the 3 user-editable new columns.
--
-- CIA-locked decisions (Tech Design § 4):
--   #1 Trigger-Roll-up (not MV) — mirror PROJ-22 pattern, <500 items/tenant.
--   #6 Audit-Whitelist additive — wbs_code, wbs_code_is_custom, parent_id
--      tracked. outline_path is derived; not user-edited; not tracked.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extension
-- ---------------------------------------------------------------------------
create extension if not exists ltree;

-- ---------------------------------------------------------------------------
-- 2. Schema additions
-- ---------------------------------------------------------------------------
alter table public.work_items
  add column if not exists outline_path ltree,
  add column if not exists wbs_code text,
  add column if not exists wbs_code_is_custom boolean not null default false,
  add column if not exists derived_planned_start date,
  add column if not exists derived_planned_end date,
  add column if not exists derived_estimate_hours numeric(10,2);

-- ---------------------------------------------------------------------------
-- 3. Constraints
-- ---------------------------------------------------------------------------
-- WBS-Code regex (matches Spec § B): alphanumeric + . _ - only, max 50.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_items'::regclass
      and conname = 'work_items_wbs_code_format'
  ) then
    alter table public.work_items
      add constraint work_items_wbs_code_format
      check (wbs_code is null or wbs_code ~ '^[A-Za-z0-9._-]{1,50}$');
  end if;
end $$;

-- Sibling-uniqueness: wbs_code unique within (project_id, parent_id).
-- Partial unique index treats NULL parent_id as a single bucket.
create unique index if not exists work_items_wbs_code_unique_per_sibling
  on public.work_items (project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), wbs_code)
  where wbs_code is not null;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
create index if not exists work_items_outline_path_gist
  on public.work_items using gist (outline_path);

create index if not exists work_items_outline_path_btree
  on public.work_items (outline_path);

-- ---------------------------------------------------------------------------
-- 5. Trigger: outline_path SELF (BEFORE INSERT / UPDATE OF parent_id, position)
-- ---------------------------------------------------------------------------
create or replace function public.tg_work_items_36a_outline_path_self_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_parent_path ltree;
  v_label int;
begin
  -- Top-level: label = sibling-rank within (project_id, parent_id is null).
  if NEW.parent_id is null then
    select coalesce(max(label_n)::int, 0) + 1
      into v_label
    from (
      select substring(text2ltree('a' || split_part(outline_path::text, '.', 1))::text from 2)::int as label_n
      from public.work_items
      where project_id = NEW.project_id
        and parent_id is null
        and id <> NEW.id
        and outline_path is not null
        and nlevel(outline_path) = 1
    ) sub;
    NEW.outline_path := text2ltree(v_label::text);
  else
    -- Child: parent.outline_path || (sibling-rank under that parent + 1).
    select outline_path into v_parent_path
    from public.work_items
    where id = NEW.parent_id;
    if v_parent_path is null then
      -- Parent has no path yet (race during multi-row insert?). Defer —
      -- AFTER cascade or backfill will fix it.
      NEW.outline_path := null;
      return NEW;
    end if;
    select coalesce(max(label_n)::int, 0) + 1
      into v_label
    from (
      select substring(subpath(outline_path, nlevel(v_parent_path), 1)::text from 1)::int as label_n
      from public.work_items
      where parent_id = NEW.parent_id
        and id <> NEW.id
        and outline_path is not null
        and nlevel(outline_path) = nlevel(v_parent_path) + 1
    ) sub;
    NEW.outline_path := v_parent_path || text2ltree(v_label::text);
  end if;
  return NEW;
end;
$$;

drop trigger if exists tg_work_items_36a_outline_path_self on public.work_items;
create trigger tg_work_items_36a_outline_path_self
  before insert or update of parent_id, position
  on public.work_items
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.tg_work_items_36a_outline_path_self_fn();

-- ---------------------------------------------------------------------------
-- 6. Trigger: outline_path CASCADE (AFTER UPDATE WHEN path changed)
-- ---------------------------------------------------------------------------
-- When a row's outline_path changes (e.g. parent moved), all descendants
-- need their paths rewritten with the new prefix. Bulk UPDATE; recursion is
-- prevented by pg_trigger_depth() guard on _self trigger.
create or replace function public.tg_work_items_36a_outline_path_cascade_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if OLD.outline_path is null or NEW.outline_path is null then
    return null;
  end if;
  if NEW.outline_path = OLD.outline_path then
    return null;
  end if;
  update public.work_items
  set outline_path = NEW.outline_path || subpath(outline_path, nlevel(OLD.outline_path))
  where outline_path <@ OLD.outline_path
    and id <> NEW.id;
  return null;
end;
$$;

drop trigger if exists tg_work_items_36a_outline_path_cascade on public.work_items;
create trigger tg_work_items_36a_outline_path_cascade
  after update of outline_path
  on public.work_items
  for each row
  when (pg_trigger_depth() = 1 and NEW.outline_path is distinct from OLD.outline_path)
  execute function public.tg_work_items_36a_outline_path_cascade_fn();

-- ---------------------------------------------------------------------------
-- 7. Trigger: wbs_code AUTOGEN (BEFORE INSERT / UPDATE)
-- ---------------------------------------------------------------------------
-- Auto-generates wbs_code from outline_path whenever wbs_code_is_custom is
-- false. Custom codes pass through untouched.
create or replace function public.tg_work_items_36a_wbs_code_autogen_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if NEW.wbs_code_is_custom = false and NEW.outline_path is not null then
    NEW.wbs_code := NEW.outline_path::text;
  end if;
  return NEW;
end;
$$;

drop trigger if exists tg_work_items_36a_wbs_code_autogen on public.work_items;
create trigger tg_work_items_36a_wbs_code_autogen
  before insert or update of outline_path, wbs_code_is_custom
  on public.work_items
  for each row
  execute function public.tg_work_items_36a_wbs_code_autogen_fn();

-- ---------------------------------------------------------------------------
-- 8. Trigger: ROLL-UP RECOMPUTE (AFTER INSERT / UPDATE / DELETE)
-- ---------------------------------------------------------------------------
-- Bottom-up walk via ltree subpath: every ancestor of the changed row is
-- recomputed. Cost-driver fields read from `attributes` JSONB:
--   - planned_start (date), planned_end (date), estimate_hours (numeric)
-- Roll-up math (Spec § C):
--   derived_planned_start = MIN(child.planned_start, child.derived_planned_start)
--   derived_planned_end   = MAX(child.planned_end,   child.derived_planned_end)
--   derived_estimate_hours = SUM(COALESCE(child.estimate_hours,0) +
--                                COALESCE(child.derived_estimate_hours,0))
-- Items with no children: derived_* := NULL.
create or replace function public.tg_work_items_36a_rollup_recompute_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_path ltree;
  v_ancestor record;
  v_min_start date;
  v_max_end date;
  v_sum_hours numeric(10,2);
begin
  -- Pick path: NEW for INSERT/UPDATE, OLD for DELETE.
  v_path := coalesce(NEW.outline_path, OLD.outline_path);
  if v_path is null then return null; end if;

  -- Walk ancestors top-down (ltree @> includes self; we exclude depth = nlevel).
  for v_ancestor in
    select id, outline_path
    from public.work_items
    where outline_path @> v_path
      and outline_path <> v_path  -- exclude self
    order by nlevel(outline_path) asc
  loop
    -- Aggregate over DIRECT children only (one ltree level deeper).
    select
      min(coalesce(
        nullif((c.attributes->>'planned_start'), '')::date,
        c.derived_planned_start
      )),
      max(coalesce(
        nullif((c.attributes->>'planned_end'), '')::date,
        c.derived_planned_end
      )),
      sum(coalesce(
        nullif((c.attributes->>'estimate_hours'), '')::numeric, 0
      ) + coalesce(c.derived_estimate_hours, 0))
    into v_min_start, v_max_end, v_sum_hours
    from public.work_items c
    where c.parent_id = v_ancestor.id
      and c.is_deleted = false;

    update public.work_items
    set derived_planned_start = v_min_start,
        derived_planned_end = v_max_end,
        derived_estimate_hours = nullif(v_sum_hours, 0)
    where id = v_ancestor.id;
  end loop;
  return null;
end;
$$;

drop trigger if exists tg_work_items_36a_rollup_recompute on public.work_items;
create trigger tg_work_items_36a_rollup_recompute
  after insert or update or delete
  on public.work_items
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.tg_work_items_36a_rollup_recompute_fn();

-- ---------------------------------------------------------------------------
-- 9. Backfill: outline_path + wbs_code for existing rows
-- ---------------------------------------------------------------------------
-- Recursive CTE: assigns each row a sibling-rank label, builds path top-down.
-- CIA-locked safety (Re-Deploy review § E2): depth bound at 32 prevents an
-- infinite loop on hypothetically cyclic parent_id chains. The
-- work_items_no_parent_cycle BEFORE-trigger forbids new cycles, but a
-- legacy/imported tenant could theoretically have one. 32 levels is
-- far beyond any realistic WBS depth (OpenProject caps at ~20).
--
-- Audit-trail note (Re-Deploy review § E5, decision: pragmatic-A): this
-- backfill UPDATEs `wbs_code`, which is in `_tracked_audit_columns()`.
-- The audit_changes_work_items trigger will write one audit_log_entry per
-- backfilled row with `actor_user_id = NULL` (auth.uid() is NULL in the
-- migration context). Tenants reading the audit log should treat
-- NULL-actor entries as system migration events. This is a one-off
-- migration; we accept the noise rather than introducing a skip-audit
-- mechanism.
do $$
declare
  v_count int;
begin
  with recursive
    ranked as (
      -- Top-level rows: rank within (project_id, parent_id IS NULL).
      select
        wi.id,
        wi.project_id,
        wi.parent_id,
        text2ltree(
          row_number() over (partition by wi.project_id order by wi.position nulls last, wi.created_at)::text
        ) as new_path,
        1 as depth
      from public.work_items wi
      where wi.parent_id is null
      union all
      -- Children: parent.path || sibling-rank. Depth-bounded to break
      -- a hypothetical cycle.
      select
        wi.id,
        wi.project_id,
        wi.parent_id,
        r.new_path || text2ltree(
          row_number() over (
            partition by wi.parent_id
            order by wi.position nulls last, wi.created_at
          )::text
        ),
        r.depth + 1
      from public.work_items wi
      join ranked r on r.id = wi.parent_id
      where r.depth < 32
    )
  update public.work_items wi
  set outline_path = r.new_path,
      wbs_code = r.new_path::text
  from ranked r
  where wi.id = r.id
    and wi.outline_path is null;

  get diagnostics v_count = row_count;
  raise notice 'PROJ-36-α backfill: % work_items received outline_path + wbs_code', v_count;

  -- Smoke-test: any row left without an outline_path is either an orphan
  -- (parent_id points to a missing row) or hit the depth bound. Surface
  -- it so the deploy-runner can investigate.
  select count(*) into v_count
  from public.work_items wi
  where wi.is_deleted = false
    and wi.outline_path is null;
  if v_count > 0 then
    raise warning 'PROJ-36-α backfill: % live work_items still have NULL outline_path (orphan parent_id or depth>32 cycle?)', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Audit-Whitelist extension
-- ---------------------------------------------------------------------------
-- Track wbs_code (manual override is a meaningful audit event), wbs_code_is_custom
-- (toggling it back regenerates the code — visible in audit), and parent_id
-- (already tracked but reconfirmed). outline_path is derived; not tracked.
-- derived_* are derived; not tracked.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      'is_approver',
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel'
    ]
    -- PROJ-36-α adds: wbs_code, wbs_code_is_custom (parent_id already tracked).
    when 'work_items' then array[
      'title','description','status','priority','responsible_user_id',
      'kind','sprint_id','parent_id','story_points',
      'wbs_code','wbs_code_is_custom'
    ]
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes']
    when 'work_item_resources' then array['effort_hours','role_key','start_date','end_date']
    when 'tenant_project_type_overrides' then array['display_name','description','rules','active','sort_order']
    when 'tenant_method_overrides' then array['display_name','description','rules','active','sort_order']
    when 'vendors' then array['name','vendor_number','category','status','contact_email','contact_phone','website','notes','tax_id']
    when 'vendor_project_assignments' then array['role','status','signed_at','signed_off_by','removed_at','removed_by']
    when 'vendor_evaluations' then array['rubric_key','score','comment','evaluated_at','evaluated_by']
    when 'vendor_documents' then array['kind','title','file_url','signed_at','signed_off_by','expires_at','metadata']
    when 'compliance_tags' then array['key','label','description','data_classes','required_for_kinds']
    when 'work_item_documents' then array['title','file_url','tag_keys','description']
    when 'budget_categories' then array['name','description','position']
    when 'budget_items' then array['name','description','category_id','planned_amount','planned_currency','position']
    when 'budget_postings' then array['budget_item_id','amount','currency','posted_at','description','source_type','source_ref','reverses_posting_id']
    when 'vendor_invoices' then array['vendor_id','invoice_number','total_amount','currency','invoice_date','due_date','status','document_id','metadata']
    when 'report_snapshots' then array[]::text[]
    when 'role_rates' then array['daily_rate','currency','valid_from','role_key']
    when 'work_item_cost_lines' then array['amount','currency','source_type','source_metadata','occurred_on']
    else array[]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- 11. Comment on new columns
-- ---------------------------------------------------------------------------
comment on column public.work_items.outline_path is
  'PROJ-36-α — ltree-encoded WBS path (e.g. "1.2.3"). Auto-maintained by tg_work_items_36a_outline_path_self.';
comment on column public.work_items.wbs_code is
  'PROJ-36-α — display WBS code (auto from outline_path or manual override). Sibling-unique within (project_id, parent_id).';
comment on column public.work_items.wbs_code_is_custom is
  'PROJ-36-α — true if wbs_code was manually overridden by user. Prevents auto-regeneration on outline_path change.';
comment on column public.work_items.derived_planned_start is
  'PROJ-36-α — earliest planned_start of any descendant (from JSONB attributes). NULL if no children.';
comment on column public.work_items.derived_planned_end is
  'PROJ-36-α — latest planned_end of any descendant. NULL if no children.';
comment on column public.work_items.derived_estimate_hours is
  'PROJ-36-α — sum of estimate_hours across descendants (own + their derived). NULL if no children.';
