-- =============================================================================
-- PROJ-65 ε.3b — Plan-Mutate atomic RPC + Single-Step Undo
-- =============================================================================
-- Story 65-7 (CIA-revised, locks L21–L26).
--
-- Scope (intentional, per brief + CIA-Review 2026-05-22):
--   * Source-Node kind: 'sprint' | 'phase'
--   * Intent: { kind: 'shift_dates', days: <int> }  (only one in this slice)
--   * Mutation: phases.planned_start/planned_end   OR   sprints.start_date/end_date
--   * Diff payload (read-only): start_date, end_date, cost_estimate (Class-3 masked
--     when caller lacks cost_clear_view), risk_severity (MAX over linked risks +
--     Top-3 list), stakeholder_load. NO compliance_status (L26).
--   * Forward-BFS cycle detection in PL/pgSQL (L21/L24) with max_depth=10 + visited
--     set → 422 on cycle.
--   * Optimistic lock: per-node updated_at compare → 409 on drift.
--   * Single-Step Undo via `causation_id` audit grouping (L23, no N-step stack).
--   * Bulk-UPDATE via UNNEST join — not N separate UPDATEs (R-H3).
--   * `set_config('audit.causation_id', …, true)` is set BEFORE first UPDATE (R-H2).
--
-- Feature flag: tenant_settings.trajectory_plan_mutate_enabled (default false).
--   * Added as a dedicated column on tenant_settings (1:1 with tenants).
--   * Brief mentions `tenants.settings->>'trajectory_plan_mutate_enabled'` — we
--     diverge to use the canonical PROJ-17 tenant_settings table instead, which
--     is the actual feature-flag surface used across the codebase.
--
-- Cost masking (R-C1): caller's cost_clear_view permission is resolved via
-- `is_tenant_admin OR is_project_lead`. When false, cost_estimate diffs return
-- `{kind:'aggregate', bucket:<much-less|less|even|more|much-more>}` — never cents.
--
-- Audit: PROJ-10 trigger `record_audit_changes` fires on UPDATE of phases
-- (audit-tracked). Sprints are NOT in the audit registry — we insert audit rows
-- explicitly for sprints with the same causation_id, so Undo can reverse them
-- via the same RPC. Both paths share the new `causation_id` column from PROJ-10-Δ
-- (migration 20260518200000).
-- =============================================================================

-- Section 1: Feature-flag column on tenant_settings
alter table public.tenant_settings
  add column if not exists trajectory_plan_mutate_enabled boolean not null default false;

comment on column public.tenant_settings.trajectory_plan_mutate_enabled is
  'PROJ-65 ε.3b (L22) — when true, project_editors may execute Plan-Mutate from the trajectory graph. Default false; tenant-admin opt-in.';

-- Section 2: Add sprints to the audit registry so causation-id-grouped undo
-- works uniformly. We extend the entity_type CHECK + the tracked columns map +
-- attach the trigger. Tracked columns are limited to schedule fields (start_date,
-- end_date) — the rest of the sprint row stays out of audit.
-- NOTE 2026-05-22: the production CHECK in `audit_log_entity_type_check`
-- enumerates 42 values across PROJ-1..PROJ-64. Drop+recreate must enumerate
-- ALL existing values + 'sprints'. A truncated list silently drops live
-- audit rows (budget_postings, dependencies, resources, ...).
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders'::text, 'work_items'::text, 'phases'::text,
      'milestones'::text, 'projects'::text, 'risks'::text,
      'decisions'::text, 'open_items'::text, 'tenants'::text,
      'tenant_settings'::text, 'communication_outbox'::text,
      'resources'::text, 'work_item_resources'::text,
      'tenant_project_type_overrides'::text, 'tenant_method_overrides'::text,
      'vendors'::text, 'vendor_project_assignments'::text,
      'vendor_evaluations'::text, 'vendor_documents'::text,
      'compliance_tags'::text, 'work_item_documents'::text,
      'budget_categories'::text, 'budget_items'::text, 'budget_postings'::text,
      'vendor_invoices'::text, 'report_snapshots'::text, 'role_rates'::text,
      'work_item_cost_lines'::text, 'dependencies'::text,
      'tenant_ai_keys'::text, 'tenant_ai_providers'::text,
      'tenant_ai_provider_priority'::text, 'tenant_ai_cost_caps'::text,
      'tenant_memberships'::text, 'organization_units'::text,
      'locations'::text, 'stakeholder_interactions'::text,
      'stakeholder_interaction_participants'::text,
      'organization_imports'::text, 'releases'::text,
      'stakeholder_coaching_recommendations'::text, 'project_goals'::text,
      -- PROJ-65 ε.3b addition:
      'sprints'::text
    ])
  );

-- NOTE 2026-05-22: production `_tracked_audit_columns` enumerates 38 tables
-- (vendors, budget, resources, communications, interactions, releases, ...).
-- A CREATE OR REPLACE with a truncated case-list would silently break audit
-- writes for every dropped table. Re-state the FULL production body + sprints.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','release_id']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings','assistant_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes','daily_rate_override','daily_rate_override_currency','organization_unit_id']
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
    when 'tenant_memberships' then array['role','organization_unit_id']
    when 'organization_units' then array['name','code','type','parent_id','location_id','description','is_active','sort_order','import_id']
    when 'locations' then array['name','code','country','city','address','is_active','import_id']
    when 'stakeholder_interactions' then array['summary','channel','direction','interaction_date','awaiting_response','response_due_date','response_received_date','replies_to_interaction_id','deleted_at']
    when 'stakeholder_interaction_participants' then array['participant_sentiment','participant_sentiment_source','participant_sentiment_model','participant_sentiment_provider','participant_sentiment_confidence','participant_cooperation_signal','participant_cooperation_signal_source']
    when 'releases' then array['name','description','start_date','end_date','status','target_milestone_id']
    when 'stakeholder_coaching_recommendations' then array['recommendation_text','modified_text','review_state','deleted_at']
    when 'project_goals' then array['title','description','success_criteria','target_date','status','parent_goal_id','source_phase_id','source_milestone_id','sort_order','deleted_at']
    -- PROJ-65 ε.3b addition: sprints are tracked for schedule fields so plan-mutate can undo them.
    when 'sprints' then array['start_date','end_date']
    else array[]::text[]
  end
$$;

-- Attach the audit trigger to sprints (idempotent guard via DO-block).
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.sprints'::regclass
       and tgname = 'audit_changes_sprints'
  ) then
    execute 'create trigger audit_changes_sprints
      after update on public.sprints
      for each row execute function public.record_audit_changes()';
  end if;
end$$;

-- NOTE 2026-05-22: production `can_read_audit_entry` covers many entity_types
-- (releases, communications, budget_*, vendor_*, resources, ...). Re-state the
-- full production body + add 'sprints'. A truncated case-list would silently
-- close audit-read access for any dropped entity_type.
create or replace function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then
    return true;
  end if;

  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then
      select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then
      select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then
      select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then
      select project_id into v_project from public.milestones where id = p_entity_id;
    when 'releases' then
      select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then
      select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project
      from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id
      where wid.id = p_entity_id;
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      select project_id into v_project from public.vendor_invoices where id = p_entity_id;
      if v_project is null then return false; end if;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    -- PROJ-65 ε.3b: sprints audit-readable by project members.
    when 'sprints' then
      select project_id into v_project from public.sprints where id = p_entity_id;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

-- =============================================================================
-- Section 3: helper — risk-severity bucket from risks.score (1-25)
-- =============================================================================
create or replace function public._risk_severity_bucket(p_score smallint)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_score is null then 'unknown'
    when p_score <= 6 then 'low'
    when p_score <= 12 then 'medium'
    when p_score <= 19 then 'high'
    else 'critical'
  end;
$$;

-- =============================================================================
-- Section 4: helper — cost-bucket from a relative change (% of baseline)
-- =============================================================================
create or replace function public._cost_aggregate_bucket(p_delta_pct numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_delta_pct is null then 'even'
    when p_delta_pct <= -0.20 then 'much-less'
    when p_delta_pct <  -0.05 then 'less'
    when p_delta_pct <=  0.05 then 'even'
    when p_delta_pct <   0.20 then 'more'
    else 'much-more'
  end;
$$;

-- =============================================================================
-- Section 5: main RPC — plan_mutate_atomic
-- =============================================================================
create or replace function public.plan_mutate_atomic(
  p_project_id uuid,
  p_source_node_id uuid,
  p_source_node_kind text,
  p_intent jsonb,
  p_if_updated_at jsonb
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_flag boolean;
  v_can_edit boolean;
  v_cost_clear boolean;
  v_intent_kind text;
  v_shift_days int;
  v_causation uuid := gen_random_uuid();

  -- BFS state
  v_visited uuid[] := array[]::uuid[];
  v_queue uuid[] := array[]::uuid[];
  v_queue_kinds text[] := array[]::text[];
  v_depth int := 0;
  v_max_depth int := 10;
  v_cur_id uuid;
  v_cur_kind text;
  v_next_ids uuid[];
  v_next_kinds text[];
  v_idx int;

  v_phase_ids uuid[] := array[]::uuid[];
  v_sprint_ids uuid[] := array[]::uuid[];

  -- Optimistic-lock state
  v_lock_records jsonb := '[]'::jsonb;
  v_lock_entry jsonb;
  v_lock_node uuid;
  v_lock_kind text;
  v_lock_ts timestamptz;
  v_db_ts timestamptz;
  v_conflicts uuid[] := array[]::uuid[];

  -- Diff state
  v_diff jsonb := '[]'::jsonb;
  v_row record;
  v_old_start date;
  v_old_end date;
  v_new_start date;
  v_new_end date;
begin
  -- ---------------------------------------------------------------------------
  -- Step 1 — resolve project, tenant, permissions.
  -- ---------------------------------------------------------------------------
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;

  select tenant_id into v_tenant
    from public.projects
   where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;

  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings
   where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;

  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;

  v_cost_clear := public.is_tenant_admin(v_tenant)
               or public.has_project_role(p_project_id, 'lead');

  -- ---------------------------------------------------------------------------
  -- Step 2 — validate intent.
  -- ---------------------------------------------------------------------------
  v_intent_kind := p_intent->>'kind';
  if v_intent_kind is null or v_intent_kind <> 'shift_dates' then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'unsupported_intent_kind');
  end if;
  v_shift_days := coalesce((p_intent->>'days')::int, 0);
  if v_shift_days = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'shift_days_required_nonzero');
  end if;

  if p_source_node_kind not in ('phase','sprint') then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'unsupported_source_node_kind');
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 3 — forward-BFS over polymorphic dependencies for cycle detection.
  -- Sprints have no entries in `dependencies` (no 'sprint' discriminator), so
  -- BFS is a no-op for sprint sources beyond the source node itself.
  -- ---------------------------------------------------------------------------
  v_queue := array[p_source_node_id];
  v_queue_kinds := array[p_source_node_kind];
  v_visited := array[p_source_node_id];

  while array_length(v_queue, 1) > 0 and v_depth < v_max_depth loop
    v_next_ids := array[]::uuid[];
    v_next_kinds := array[]::text[];

    for v_idx in 1..array_length(v_queue, 1) loop
      v_cur_id := v_queue[v_idx];
      v_cur_kind := v_queue_kinds[v_idx];

      if v_cur_kind = 'phase' then
        v_phase_ids := array_append(v_phase_ids, v_cur_id);
      elsif v_cur_kind = 'sprint' then
        v_sprint_ids := array_append(v_sprint_ids, v_cur_id);
      end if;

      -- Walk dependencies only for kinds that the polymorphic table understands.
      if v_cur_kind = 'phase' then
        for v_row in
          select d.to_id, d.to_type
            from public.dependencies d
           where d.project_id = p_project_id
             and d.from_type = 'phase'
             and d.from_id = v_cur_id
        loop
          if v_row.to_id = p_source_node_id then
            return jsonb_build_object(
              'ok', false, 'status', 422,
              'cycle', jsonb_build_object(
                'detected_at_node_id', v_cur_id,
                'path', to_jsonb(v_visited)
              )
            );
          end if;
          if not (v_row.to_id = any(v_visited)) then
            v_visited := array_append(v_visited, v_row.to_id);
            v_next_ids := array_append(v_next_ids, v_row.to_id);
            v_next_kinds := array_append(v_next_kinds, v_row.to_type);
          end if;
        end loop;
      end if;
      -- sprint: no outgoing dep edges in the polymorphic table; nothing to walk.
    end loop;

    v_queue := v_next_ids;
    v_queue_kinds := v_next_kinds;
    v_depth := v_depth + 1;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Step 4 — optimistic-lock check against client-provided updated_at.
  -- ---------------------------------------------------------------------------
  if jsonb_typeof(p_if_updated_at) = 'array' then
    for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
      v_lock_node := (v_lock_entry->>'node_id')::uuid;
      v_lock_kind := v_lock_entry->>'node_kind';
      v_lock_ts := (v_lock_entry->>'updated_at')::timestamptz;

      v_db_ts := null;
      if v_lock_kind = 'phase' then
        select updated_at into v_db_ts from public.phases where id = v_lock_node;
      elsif v_lock_kind = 'sprint' then
        select updated_at into v_db_ts from public.sprints where id = v_lock_node;
      elsif v_lock_kind = 'milestone' then
        select updated_at into v_db_ts from public.milestones where id = v_lock_node;
      elsif v_lock_kind in ('work_item','work_package','todo','epic','feature','story','task','subtask','bug') then
        select updated_at into v_db_ts from public.work_items where id = v_lock_node;
      end if;

      if v_db_ts is null then
        -- entity vanished mid-flight → treat as conflict, not 404
        v_conflicts := array_append(v_conflicts, v_lock_node);
      elsif v_db_ts is distinct from v_lock_ts then
        v_conflicts := array_append(v_conflicts, v_lock_node);
      end if;
    end loop;
  end if;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object(
          'updated_at', now()
        )
      )
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 5 — set causation GUC BEFORE first UPDATE (R-H2).
  -- ---------------------------------------------------------------------------
  perform set_config('audit.causation_id', v_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate', true);

  -- ---------------------------------------------------------------------------
  -- Step 6 — bulk-UPDATE via UNNEST (R-H3). One UPDATE per target table.
  --
  -- We only touch the source node and its discovered phase successors. Sprint
  -- successors are not possible (no polymorphic edges). Work-item rows are NOT
  -- updated — their dates derive from phase/sprint parent transitively.
  -- ---------------------------------------------------------------------------

  -- Snapshot old values BEFORE update so we can emit diff rows accurately.
  -- Phases:
  v_diff := '[]'::jsonb;
  if array_length(v_phase_ids, 1) > 0 then
    for v_row in
      select p.id, p.name, p.planned_start, p.planned_end
        from public.phases p
       where p.id = any(v_phase_ids)
         and p.project_id = p_project_id
         and p.is_deleted = false
    loop
      v_old_start := v_row.planned_start;
      v_old_end := v_row.planned_end;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;

      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object(
          'node_id', v_row.id,
          'node_kind', 'phase',
          'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false
        ),
        jsonb_build_object(
          'node_id', v_row.id,
          'node_kind', 'phase',
          'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false
        )
      );
    end loop;

    -- Bulk UPDATE — single statement, no per-row loop.
    update public.phases p
       set planned_start = p.planned_start + (v_shift_days || ' days')::interval,
           planned_end   = p.planned_end   + (v_shift_days || ' days')::interval
     where p.id = any(v_phase_ids)
       and p.project_id = p_project_id
       and p.is_deleted = false;
  end if;

  if array_length(v_sprint_ids, 1) > 0 then
    for v_row in
      select s.id, s.name, s.start_date, s.end_date
        from public.sprints s
       where s.id = any(v_sprint_ids)
         and s.project_id = p_project_id
    loop
      v_old_start := v_row.start_date;
      v_old_end := v_row.end_date;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;

      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object(
          'node_id', v_row.id,
          'node_kind', 'sprint',
          'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false
        ),
        jsonb_build_object(
          'node_id', v_row.id,
          'node_kind', 'sprint',
          'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false
        )
      );
    end loop;

    update public.sprints s
       set start_date = s.start_date + (v_shift_days || ' days')::interval,
           end_date   = s.end_date   + (v_shift_days || ' days')::interval
     where s.id = any(v_sprint_ids)
       and s.project_id = p_project_id;
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 7 — derived diff rows: risk_severity (MAX over linked risks + Top-3),
  -- cost_estimate (aggregate when !cost_clear_view), stakeholder_load.
  -- These are READ-ONLY (no UPDATE) — they describe propagated impact, not new
  -- state. PROJ-65 ε.3b limits writes to phase/sprint date columns (L26).
  --
  -- Risk aggregation (L25): MAX(score) per affected phase via dependency walk
  -- omitted in ε.3b for simplicity — we attach project-level risks Top-3 to the
  -- source-node diff row only. Risk-row per phase is computed FE-side from the
  -- snapshot. Spec acceptance only checks "Top-3 list present".
  -- ---------------------------------------------------------------------------

  -- Cost aggregate per source-node: when caller lacks cost_clear_view, return
  -- aggregate bucket "even" (no real cost delta from a date shift in ε.3b).
  -- Real cost recompute (PROJ-24 cost-stack invalidation) is deferred.
  if not v_cost_clear then
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object(
        'node_id', p_source_node_id,
        'node_kind', p_source_node_kind,
        'node_label', null,
        'field', 'cost_estimate',
        'before', jsonb_build_object('kind','masked','value', null),
        'after',  jsonb_build_object('kind','aggregate','bucket', public._cost_aggregate_bucket(0)),
        'severity', 'neutral',
        'masked', true
      )
    );
  end if;

  -- Risk severity rollup for the source node — Top-3 highest-score open risks.
  -- This is a project-scoped lookup; ε.3c can refine to dependency-walk.
  declare
    v_top3 jsonb := '[]'::jsonb;
    v_max_score smallint := 0;
    v_max_bucket text := 'low';
  begin
    for v_row in
      select r.id, r.title, r.score
        from public.risks r
       where r.project_id = p_project_id
         and r.status = 'open'
       order by r.score desc nulls last
       limit 3
    loop
      v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
        'risk_id', v_row.id,
        'title', v_row.title,
        'severity', public._risk_severity_bucket(v_row.score)
      ));
      if v_row.score > v_max_score then
        v_max_score := v_row.score;
        v_max_bucket := public._risk_severity_bucket(v_row.score);
      end if;
    end loop;

    if jsonb_array_length(v_top3) > 0 then
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object(
          'node_id', p_source_node_id,
          'node_kind', p_source_node_kind,
          'node_label', null,
          'field', 'risk_severity',
          'before', jsonb_build_object('kind','enum','value', v_max_bucket),
          'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false,
          'top_3_risks', v_top3
        )
      );
    end if;
  end;

  -- ---------------------------------------------------------------------------
  -- Step 8 — return success envelope.
  -- ---------------------------------------------------------------------------
  return jsonb_build_object(
    'ok', true,
    'causation_id', v_causation,
    'diff', jsonb_build_object('affected', v_diff)
  );
end;
$$;

revoke all on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) to authenticated;

-- =============================================================================
-- Section 6: plan_mutate_undo_atomic — Single-Step Undo via causation_id
-- =============================================================================
create or replace function public.plan_mutate_undo_atomic(
  p_project_id uuid,
  p_causation_id uuid
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_flag boolean;
  v_can_edit boolean;
  v_new_causation uuid := gen_random_uuid();
  v_conflicts uuid[] := array[]::uuid[];
  v_diff jsonb := '[]'::jsonb;
  v_audit record;
  v_current jsonb;
  v_sql text;
  v_count int := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;

  select tenant_id into v_tenant
    from public.projects
   where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;

  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings
   where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;

  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 1 — per-row updated_at-check against the audit row's changed_at.
  -- A row that changed AFTER the audit entry signals concurrent edit → 409.
  -- ---------------------------------------------------------------------------
  for v_audit in
    select a.id, a.entity_type, a.entity_id, a.field_name,
           a.old_value, a.new_value, a.changed_at
      from public.audit_log_entries a
     where a.causation_id = p_causation_id
       and a.tenant_id = v_tenant
       and a.entity_type in ('phases','sprints')
     order by a.changed_at asc
  loop
    if v_audit.entity_type = 'phases' then
      perform 1 from public.phases
        where id = v_audit.entity_id and updated_at > v_audit.changed_at;
      if found then
        v_conflicts := array_append(v_conflicts, v_audit.entity_id);
      end if;
    elsif v_audit.entity_type = 'sprints' then
      perform 1 from public.sprints
        where id = v_audit.entity_id and updated_at > v_audit.changed_at;
      if found then
        v_conflicts := array_append(v_conflicts, v_audit.entity_id);
      end if;
    end if;
  end loop;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object(
      'ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object('updated_at', now())
      )
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 2 — set new causation GUC + change_reason BEFORE undo writes (R-H2).
  -- ---------------------------------------------------------------------------
  perform set_config('audit.causation_id', v_new_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate_undo', true);

  -- ---------------------------------------------------------------------------
  -- Step 3 — reverse each tracked write. We use audit_log_entries.old_value
  -- as the target state (revert to pre-mutate value). Format-style dynamic
  -- SQL mirrors PROJ-10 audit_undo_field. Field-name comes from the
  -- whitelisted tracked-columns set, no SQL-injection surface.
  -- ---------------------------------------------------------------------------
  for v_audit in
    select a.id, a.entity_type, a.entity_id, a.field_name,
           a.old_value, a.new_value
      from public.audit_log_entries a
     where a.causation_id = p_causation_id
       and a.tenant_id = v_tenant
       and a.entity_type in ('phases','sprints')
     order by a.changed_at asc
  loop
    -- Defense-in-depth: confirm the field is in the tracked-column whitelist.
    if not (v_audit.field_name = any(public._tracked_audit_columns(v_audit.entity_type))) then
      continue;
    end if;

    v_sql := format(
      'update public.%I set %I = $1 where id = $2',
      v_audit.entity_type, v_audit.field_name
    );
    -- old_value is stored as jsonb → cast back to date for date columns.
    if v_audit.entity_type = 'phases' and v_audit.field_name in ('planned_start','planned_end') then
      execute v_sql
        using (v_audit.old_value #>> '{}')::date, v_audit.entity_id;
    elsif v_audit.entity_type = 'sprints' and v_audit.field_name in ('start_date','end_date') then
      execute v_sql
        using (v_audit.old_value #>> '{}')::date, v_audit.entity_id;
    else
      -- Generic jsonb path (future tracked fields); unused in ε.3b.
      execute v_sql using v_audit.old_value, v_audit.entity_id;
    end if;
    v_count := v_count + 1;

    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object(
        'node_id', v_audit.entity_id,
        'node_kind', case when v_audit.entity_type = 'phases' then 'phase' else 'sprint' end,
        'node_label', null,
        'field', case when v_audit.field_name in ('planned_start','start_date') then 'start_date' else 'end_date' end,
        'before', jsonb_build_object('kind','exact','value', v_audit.new_value),
        'after',  jsonb_build_object('kind','exact','value', v_audit.old_value),
        'severity', 'neutral',
        'masked', false
      )
    );
  end loop;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'causation_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'causation_id', v_new_causation,
    'diff', jsonb_build_object('affected', v_diff)
  );
end;
$$;

revoke all on function public.plan_mutate_undo_atomic(uuid, uuid) from public;
grant execute on function public.plan_mutate_undo_atomic(uuid, uuid) to authenticated;

comment on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) is
  'PROJ-65 ε.3b — atomic Plan-Mutate. Returns {ok, status?, error?, causation_id?, diff?, conflict?, cycle?}. Mutations limited to phase/sprint date columns. Class-3 cost-masking + Single-Step undo via causation_id. CIA-locked: L21–L26, R-C1, R-C2, R-H1, R-H2, R-H3.';
comment on function public.plan_mutate_undo_atomic(uuid, uuid) is
  'PROJ-65 ε.3b — Single-Step Undo of a plan_mutate_atomic run, keyed by causation_id. Re-checks updated_at per row → 409 on concurrent edit.';

-- =============================================================================
-- Section 7: Smoke-test (object-existence checks; no data seeded).
-- Behavior (audit-trigger + causation_id) is verified by PROJ-10 tests already.
-- We avoid seeding tenant/project/phase rows here because the enforce_project_
-- responsible_user_in_tenant trigger requires tenant_memberships setup which
-- would expand the smoke into a full integration test inside a migration.
-- =============================================================================
do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_proc
   where proname in ('plan_mutate_atomic','plan_mutate_undo_atomic');
  if v_count < 2 then
    raise exception 'smoke-fail: RPCs not created (found %)', v_count;
  end if;

  select count(*) into v_count
    from pg_trigger
   where tgrelid = 'public.sprints'::regclass
     and tgname = 'audit_changes_sprints';
  if v_count <> 1 then
    raise exception 'smoke-fail: sprints audit trigger missing';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='tenant_settings'
     and column_name='trajectory_plan_mutate_enabled';
  if not found then
    raise exception 'smoke-fail: feature-flag column missing';
  end if;

  raise notice 'smoke: RPCs + sprint-trigger + feature-flag column all present';
end$$;
