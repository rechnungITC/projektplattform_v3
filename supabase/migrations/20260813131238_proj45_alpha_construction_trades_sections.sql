-- =============================================================================
-- PROJ-45-α — Construction Extension: Gewerke & Bauabschnitte
-- =============================================================================
-- EXTEND on PROJ-6 (project_type='construction'), PROJ-9 (work_items),
-- PROJ-19 (phases), PROJ-20/107 (risks), PROJ-15 (vendors), PROJ-10 (audit),
-- PROJ-130 (lifecycle audit + registers).
--
-- FORK DECISION (CIA-reviewed 2026-08-13, user-locked):
--   `workstreams` (PROJ-102) is field-identical to a project trade, but it is
--   NOT generalized. Its `label` is NOT NULL and is read as the display source
--   by all five INVOKER report functions, while PROJ-45 lock L7 / AC-45.5
--   requires that a catalog rename propagates everywhere and that NO name is
--   copied into the project row. Generalizing would force either a nullable
--   label (five deployed M&A reports render blank) or a trigger-synced second
--   copy (exactly the second source of truth L7 forbids). Mirroring instead,
--   per the PROJ-112/102 recipe. Second reason: `confidentiality_level` would
--   ride along, and a site manager who raises it locks themselves out — the
--   clearance UI is M&A-gated.
--
-- DEVIATION from CIA obligation A-1 (documented, evidence-based):
--   A-1 said "catalog without audit trigger, dd_stream_templates pattern".
--   Measured against live: that pattern is NOT uniform. `dd_stream_templates`
--   and `ma_project_templates` carry neither field nor lifecycle audit, but
--   `risk_categories`, `ma_clearance_profiles`, `committee_templates` and
--   `organization_units` carry BOTH. The dividing line is not "catalog vs.
--   rest" but COPIED TEMPLATE vs. REFERENCED CATALOG: templates are copied on
--   apply (the copy carries a provenance stamp), referenced catalogs stay the
--   single source of truth. L7 makes the trade catalog a referenced catalog by
--   construction — a rename reaches every project — so without an audit trail
--   nobody could reconstruct why every project's label changed. We therefore
--   follow `risk_categories`, not `dd_stream_templates`.
--
-- Security model:
--   * construction_trades   — read: tenant member; write: tenant admin
--     (mirrors risk_categories, a tenant-wide catalog).
--   * project_construction_trades / construction_sections /
--     construction_section_phases — read: project member; write: project
--     manager or tenant admin (mirrors the project-scoped house pattern).
--   * No confidentiality axis in construction (see fork decision).
--
-- Shared surfaces (audit trio) are extended ONLY by anchor-replacing their
-- LIVE definitions with WHITESPACE-TOLERANT regexes, verified after each
-- write, with sibling-branch guards — obligation A-3, lessons from
-- PROJ-Y-115c and PROJ-Y-122a. All count assertions are DELTAS, never
-- absolutes — obligation A-4, lesson from PROJ-130-α.
-- =============================================================================

-- ── 1. Tenant-wide trade catalog (mirrors risk_categories) ──────────────────
create table if not exists public.construction_trades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_trades_key_len check (char_length(key) between 1 and 64),
  constraint construction_trades_key_shape check (key ~ '^[a-z0-9_]+$'),
  constraint construction_trades_label_len check (char_length(label) between 1 and 120),
  constraint construction_trades_tenant_key_unique unique (tenant_id, key)
);

create index if not exists construction_trades_tenant_active_idx
  on public.construction_trades (tenant_id, is_active, sort_order);

alter table public.construction_trades enable row level security;

-- ── 2. Project-side trade (references the catalog, never copies the name) ───
create table if not exists public.project_construction_trades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- RESTRICT is the technical form of AC-45.3: a catalog entry in use cannot
  -- be deleted. Deactivating is the supported path (AC-45.4).
  trade_id uuid not null references public.construction_trades(id) on delete restrict,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  rag_status text not null default 'gruen',
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_construction_trades_rag_check
    check (rag_status in ('gruen', 'gelb', 'rot')),
  constraint project_construction_trades_notes_len
    check (notes is null or char_length(notes) <= 2000),
  -- AC-45.9: the same catalog entry can be assigned to a project only once.
  constraint project_construction_trades_unique unique (project_id, trade_id)
);

create index if not exists project_construction_trades_project_idx
  on public.project_construction_trades (project_id, sort_order);
create index if not exists project_construction_trades_trade_idx
  on public.project_construction_trades (trade_id);
create index if not exists project_construction_trades_tenant_idx
  on public.project_construction_trades (tenant_id);

alter table public.project_construction_trades enable row level security;

-- ── 3. Construction sections (free-depth tree, materialised ltree path) ─────
create table if not exists public.construction_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- CASCADE: deleting a section removes its subtree in one go, so no orphans
  -- can appear (AC-45.15). The UI names the consequence before confirming.
  parent_id uuid references public.construction_sections(id) on delete cascade,
  label text not null,
  description text,
  sort_order integer not null default 0,
  -- Materialised path so "filter includes descendants" (AC-45.20) is an index
  -- lookup instead of a recursive CTE per request. Same technique as
  -- work_items.outline_path (PROJ-9-R2). Maintained by trigger only.
  path public.ltree,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_sections_label_len check (char_length(label) between 1 and 160),
  constraint construction_sections_desc_len
    check (description is null or char_length(description) <= 4000),
  -- AC-45.14, first line of defence; the trigger below catches deeper cycles.
  constraint construction_sections_no_self_loop check (parent_id is null or parent_id <> id)
);

-- Same label may exist under different parents ("2. OG" under Haus A and B),
-- but not twice under the same one. NULLS NOT DISTINCT (PG15+) makes this hold
-- for root level too, where parent_id is NULL.
create unique index if not exists construction_sections_sibling_label_unique
  on public.construction_sections (project_id, parent_id, label) nulls not distinct;

create index if not exists construction_sections_project_idx
  on public.construction_sections (project_id, sort_order);
create index if not exists construction_sections_parent_idx
  on public.construction_sections (parent_id);
create index if not exists construction_sections_path_idx
  on public.construction_sections using gist (path);
create index if not exists construction_sections_tenant_idx
  on public.construction_sections (tenant_id);

alter table public.construction_sections enable row level security;

-- ── 4. Section ↔ phase (M:N, mirrors workstream_phases) ─────────────────────
create table if not exists public.construction_section_phases (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  section_id uuid not null references public.construction_sections(id) on delete cascade,
  phase_id uuid not null references public.phases(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (section_id, phase_id)
);

create index if not exists construction_section_phases_phase_idx
  on public.construction_section_phases (phase_id);

alter table public.construction_section_phases enable row level security;

-- ── 5. Additive nullable references on core tables (A-2) ────────────────────
-- SET NULL everywhere: removing a trade or a section must never destroy work
-- (AC-45.22). Idempotent so a fresh replay cannot fail here.
alter table public.work_items
  add column if not exists trade_id uuid
    references public.project_construction_trades(id) on delete set null;
alter table public.work_items
  add column if not exists section_id uuid
    references public.construction_sections(id) on delete set null;
alter table public.risks
  add column if not exists trade_id uuid
    references public.project_construction_trades(id) on delete set null;

create index if not exists work_items_trade_idx
  on public.work_items (trade_id) where trade_id is not null;
create index if not exists work_items_section_idx
  on public.work_items (section_id) where section_id is not null;
create index if not exists risks_trade_idx
  on public.risks (trade_id) where trade_id is not null;

-- ── 6. Tenant/project consistency + tree integrity ──────────────────────────
create or replace function public.construction_section_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent record;
  v_project_tenant uuid;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'PROJ-45: project % does not exist', NEW.project_id;
  end if;
  if NEW.tenant_id <> v_project_tenant then
    raise exception 'PROJ-45: tenant mismatch between section and project'
      using errcode = '23514';
  end if;

  if NEW.parent_id is null then
    NEW.path := text2ltree('n' || replace(NEW.id::text, '-', '_'));
  else
    select id, project_id, path into v_parent
      from public.construction_sections where id = NEW.parent_id;
    if v_parent.id is null then
      raise exception 'PROJ-45: parent section does not exist' using errcode = '23503';
    end if;
    if v_parent.project_id <> NEW.project_id then
      raise exception 'PROJ-45: parent section belongs to a different project'
        using errcode = '23514';
    end if;
    -- AC-45.14: a section may never become its own ancestor. With the
    -- materialised path this is a containment test, not a recursive walk.
    if TG_OP = 'UPDATE'
       and OLD.path is not null
       and v_parent.path operator(public.<@) OLD.path then
      raise exception 'PROJ-45: cycle rejected — % would sit below itself', NEW.id
        using errcode = '23514';
    end if;
    NEW.path := v_parent.path operator(public.||) text2ltree('n' || replace(NEW.id::text, '-', '_'));
  end if;

  return NEW;
end;
$$;

revoke execute on function public.construction_section_guard() from public, anon, authenticated;

drop trigger if exists construction_sections_guard on public.construction_sections;
create trigger construction_sections_guard
  before insert or update of parent_id, project_id, tenant_id
  on public.construction_sections
  for each row execute function public.construction_section_guard();

-- Re-path the whole subtree when a section is moved (AC-45.13).
create or replace function public.construction_section_repath_subtree()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if OLD.path is distinct from NEW.path then
    update public.construction_sections
       set path = NEW.path operator(public.||) subpath(path, nlevel(OLD.path))
     where path operator(public.<@) OLD.path
       and id <> NEW.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.construction_section_repath_subtree() from public, anon, authenticated;

drop trigger if exists construction_sections_repath on public.construction_sections;
create trigger construction_sections_repath
  after update of parent_id on public.construction_sections
  for each row execute function public.construction_section_repath_subtree();

-- Keep the M:N join inside one tenant and one project.
create or replace function public.construction_section_phase_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section_project uuid;
  v_section_tenant uuid;
  v_phase_project uuid;
begin
  select project_id, tenant_id into v_section_project, v_section_tenant
    from public.construction_sections where id = NEW.section_id;
  select project_id into v_phase_project from public.phases where id = NEW.phase_id;

  if v_section_project is null or v_phase_project is null then
    raise exception 'PROJ-45: section or phase does not exist' using errcode = '23503';
  end if;
  if v_section_project <> v_phase_project then
    raise exception 'PROJ-45: phase belongs to a different project' using errcode = '23514';
  end if;
  if NEW.tenant_id <> v_section_tenant then
    raise exception 'PROJ-45: tenant mismatch on section/phase link' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.construction_section_phase_guard() from public, anon, authenticated;

drop trigger if exists construction_section_phases_guard on public.construction_section_phases;
create trigger construction_section_phases_guard
  before insert or update on public.construction_section_phases
  for each row execute function public.construction_section_phase_guard();

-- Project trade must live in its project's tenant, and its catalog entry too.
create or replace function public.project_construction_trade_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_tenant uuid;
  v_trade_tenant uuid;
  v_trade_active boolean;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  select tenant_id, is_active into v_trade_tenant, v_trade_active
    from public.construction_trades where id = NEW.trade_id;

  if v_project_tenant is null or v_trade_tenant is null then
    raise exception 'PROJ-45: project or trade does not exist' using errcode = '23503';
  end if;
  if NEW.tenant_id <> v_project_tenant or v_trade_tenant <> v_project_tenant then
    raise exception 'PROJ-45: cross-tenant trade assignment rejected' using errcode = '23514';
  end if;
  -- AC-45.4: a deactivated trade disappears from NEW selections but existing
  -- assignments stay valid, so only INSERT is gated on is_active.
  if TG_OP = 'INSERT' and not v_trade_active then
    raise exception 'PROJ-45: trade % is deactivated', NEW.trade_id using errcode = '23514';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.project_construction_trade_guard() from public, anon, authenticated;

drop trigger if exists project_construction_trades_guard on public.project_construction_trades;
create trigger project_construction_trades_guard
  before insert or update on public.project_construction_trades
  for each row execute function public.project_construction_trade_guard();

-- ── 7. updated_at ───────────────────────────────────────────────────────────
-- extensions.moddatetime must stay schema-qualified: the bare form resolves in
-- prod but not in the schema-drift shadow DB.
drop trigger if exists construction_trades_moddatetime on public.construction_trades;
create trigger construction_trades_moddatetime
  before update on public.construction_trades
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists project_construction_trades_moddatetime on public.project_construction_trades;
create trigger project_construction_trades_moddatetime
  before update on public.project_construction_trades
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists construction_sections_moddatetime on public.construction_sections;
create trigger construction_sections_moddatetime
  before update on public.construction_sections
  for each row execute function extensions.moddatetime(updated_at);

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
-- Catalog: read for every tenant member, write for tenant admins only.
drop policy if exists construction_trades_select on public.construction_trades;
create policy construction_trades_select on public.construction_trades
  for select using (public.is_tenant_member(tenant_id));

drop policy if exists construction_trades_insert on public.construction_trades;
create policy construction_trades_insert on public.construction_trades
  for insert with check (public.is_tenant_admin(tenant_id));

drop policy if exists construction_trades_update on public.construction_trades;
create policy construction_trades_update on public.construction_trades
  for update using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists construction_trades_delete on public.construction_trades;
create policy construction_trades_delete on public.construction_trades
  for delete using (public.is_tenant_admin(tenant_id));

-- Project-scoped tables: read for project members, write for project managers.
drop policy if exists project_construction_trades_select on public.project_construction_trades;
create policy project_construction_trades_select on public.project_construction_trades
  for select using (public.is_project_member(project_id));

drop policy if exists project_construction_trades_write on public.project_construction_trades;
create policy project_construction_trades_write on public.project_construction_trades
  for insert with check ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists project_construction_trades_update on public.project_construction_trades;
create policy project_construction_trades_update on public.project_construction_trades
  for update using ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)))
  with check ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists project_construction_trades_delete on public.project_construction_trades;
create policy project_construction_trades_delete on public.project_construction_trades
  for delete using ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists construction_sections_select on public.construction_sections;
create policy construction_sections_select on public.construction_sections
  for select using (public.is_project_member(project_id));

drop policy if exists construction_sections_insert on public.construction_sections;
create policy construction_sections_insert on public.construction_sections
  for insert with check ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists construction_sections_update on public.construction_sections;
create policy construction_sections_update on public.construction_sections
  for update using ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)))
  with check ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists construction_sections_delete on public.construction_sections;
create policy construction_sections_delete on public.construction_sections
  for delete using ((public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id)));

drop policy if exists construction_section_phases_select on public.construction_section_phases;
create policy construction_section_phases_select on public.construction_section_phases
  for select using (
    exists (select 1 from public.construction_sections s
             where s.id = section_id and public.is_project_member(s.project_id))
  );

drop policy if exists construction_section_phases_insert on public.construction_section_phases;
create policy construction_section_phases_insert on public.construction_section_phases
  for insert with check (
    exists (select 1 from public.construction_sections s
             where s.id = section_id
               and (public.is_tenant_admin(s.tenant_id) or public.is_project_lead(s.project_id)))
  );

drop policy if exists construction_section_phases_delete on public.construction_section_phases;
create policy construction_section_phases_delete on public.construction_section_phases
  for delete using (
    exists (select 1 from public.construction_sections s
             where s.id = section_id
               and (public.is_tenant_admin(s.tenant_id) or public.is_project_lead(s.project_id)))
  );

-- ── 9. Audit entity-type CHECK — additive, before any audited write ─────────
do $mig$
declare
  v_def text;
  v_new text;
  v_missing text[];
  v_before int;
  v_after int;
begin
  v_def := pg_get_constraintdef(
    (select oid from pg_constraint where conname = 'audit_log_entity_type_check'));

  v_missing := array(
    select x from unnest(array[
      'construction_trades',
      'project_construction_trades',
      'construction_sections'
    ]) as x
    where position('''' || x || '''' in v_def) = 0
  );

  -- A-4: assert a DELTA, never an absolute count. The shadow DB used by the
  -- schema-drift guard and prod legitimately disagree on totals (PROJ-130-α).
  -- Every array element in this CHECK carries exactly one `::text` cast, so
  -- counting casts counts entries without parsing the list.
  v_before := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;

  if array_length(v_missing, 1) is not null then
    -- The rendered form is  CHECK ((entity_type = ANY (ARRAY['a'::text, …])))
    -- — NOT the `]::text[]` shape used inside _tracked_audit_columns. Anchor on
    -- the closing bracket at the very end so the single (non-global) match is
    -- unambiguous. Verified against the live definition before writing.
    v_new := regexp_replace(
      v_def,
      '::text\s*\]\s*\)\s*\)\s*\)\s*$',
      '::text, '
        || (select string_agg('''' || x || '''::text', ', ') from unnest(v_missing) as x)
        || '])))'
    );
    if v_new = v_def then
      raise exception 'PROJ-45: entity_type CHECK anchor not found — refusing to guess';
    end if;

    alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
            || v_new;

    v_def := pg_get_constraintdef(
      (select oid from pg_constraint where conname = 'audit_log_entity_type_check'));
    v_after := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;

    if v_after <> v_before + array_length(v_missing, 1) then
      raise exception 'PROJ-45: entity_type CHECK delta wrong — expected +%, got %',
        array_length(v_missing, 1), v_after - v_before;
    end if;

    -- Sibling guard: branches placed by parallel slices must survive.
    foreach v_new in array array['spa_issues','ma_valuations','workstreams','committees']
    loop
      if position('''' || v_new || '''' in v_def) = 0 then
        raise exception 'PROJ-45: entity_type CHECK lost sibling branch %', v_new;
      end if;
    end loop;
  end if;
end
$mig$;

-- ── 10. _tracked_audit_columns — anchor-replace on the LIVE definition ──────
do $mig$
declare
  v_def text;
  v_new text;
  v_branch constant text :=
       'when ''construction_trades'' then array[''key'',''label'',''sort_order'',''is_active''] '
    || 'when ''project_construction_trades'' then array[''trade_id'',''responsible_user_id'','
    || '''vendor_id'',''rag_status'',''notes'',''sort_order''] '
    || 'when ''construction_sections'' then array[''label'',''description'',''parent_id'',''sort_order''] ';
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

  if position('''construction_trades''' in v_def) = 0 then
    -- Whitespace-tolerant anchor (A-3). Without the 'g' flag only the FIRST
    -- match is rewritten; the else-branch is unique in this function.
    v_new := regexp_replace(v_def, 'else\s+array\[\]::text\[\]', v_branch || 'else array[]::text[]');
    if v_new = v_def then
      raise exception 'PROJ-45: _tracked_audit_columns else-anchor not found in ANY whitespace shape';
    end if;
    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if position('''construction_trades''' in v_def) = 0 then
      raise exception 'PROJ-45: _tracked_audit_columns patch did not apply';
    end if;
  end if;

  -- A-2: the work_items and risks branches gain the new references. Guard the
  -- eleven existing work_items columns against accidental truncation.
  if position('''trade_id''' in v_def) = 0 then
    v_new := regexp_replace(
      v_def,
      '(when\s+''work_items''\s+then\s+array\[)',
      '\1''trade_id'',''section_id'','
    );
    if v_new = v_def then
      raise exception 'PROJ-45: work_items branch anchor not found';
    end if;
    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if position('''trade_id''' in v_def) = 0 then
      raise exception 'PROJ-45: work_items branch patch did not apply';
    end if;
  end if;

  -- Post-condition: none of the pre-existing work_items columns may vanish.
  foreach v_new in array array['title','description','status','priority',
                               'responsible_user_id','kind','sprint_id','parent_id',
                               'story_points','confidentiality_level','is_deleted']
  loop
    if position('''' || v_new || '''' in v_def) = 0 then
      raise exception 'PROJ-45: _tracked_audit_columns lost work_items column %', v_new;
    end if;
  end loop;

  -- Sibling guard against a concurrent recreate-from-live.
  foreach v_new in array array['spa_issues','ma_valuations','skill_knowledge_links']
  loop
    if position('''' || v_new || '''' in v_def) = 0 then
      raise exception 'PROJ-45: _tracked_audit_columns lost sibling branch %', v_new;
    end if;
  end loop;
end
$mig$;

-- The risks branch gains trade_id separately so a partial replay cannot leave
-- work_items patched and risks unpatched without raising.
do $mig$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
  if v_def !~ 'when\s+''risks''\s+then\s+array\[''trade_id''' then
    v_new := regexp_replace(v_def, '(when\s+''risks''\s+then\s+array\[)', '\1''trade_id'',');
    if v_new = v_def then
      raise exception 'PROJ-45: risks branch anchor not found';
    end if;
    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if v_def !~ 'when\s+''risks''\s+then\s+array\[''trade_id''' then
      raise exception 'PROJ-45: risks branch patch did not apply';
    end if;
  end if;
end
$mig$;

-- ── 11. can_read_audit_entry — anchor-replace + mandatory re-grant ──────────
do $mig$
declare
  v_def text;
  v_new text;
  v_branch constant text :=
       'when ''construction_trades'' then return public.is_tenant_member(p_tenant_id); '
    || 'when ''project_construction_trades'' then select project_id into v_project '
    || 'from public.project_construction_trades where id = p_entity_id; '
    || 'when ''construction_sections'' then select project_id into v_project '
    || 'from public.construction_sections where id = p_entity_id; ';
begin
  v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);

  if position('''construction_trades''' in v_def) = 0 then
    v_new := regexp_replace(v_def, 'else\s+return\s+false;', v_branch || 'else return false;');
    if v_new = v_def then
      raise exception 'PROJ-45: can_read_audit_entry else-anchor not found in ANY whitespace shape';
    end if;
    execute v_new;

    v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
    if position('''construction_trades''' in v_def) = 0 then
      raise exception 'PROJ-45: can_read_audit_entry patch did not apply';
    end if;
  end if;

  foreach v_new in array array['spa_issues','ma_valuations','workstreams','risk_categories']
  loop
    if position('''' || v_new || '''' in v_def) = 0 then
      raise exception 'PROJ-45: can_read_audit_entry lost sibling branch %', v_new;
    end if;
  end loop;
end
$mig$;

-- Recreating this function drops its EXECUTE grant, which silently breaks the
-- PROJ-10 history tab. Re-assert unconditionally (lesson from 20260625153238).
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- ── 12. Audit triggers (field-level + lifecycle, PROJ-10 / PROJ-130-β) ──────
drop trigger if exists construction_trades_audit on public.construction_trades;
create trigger construction_trades_audit
  after update on public.construction_trades
  for each row execute function public.record_audit_changes();

drop trigger if exists project_construction_trades_audit on public.project_construction_trades;
create trigger project_construction_trades_audit
  after update on public.project_construction_trades
  for each row execute function public.record_audit_changes();

drop trigger if exists construction_sections_audit on public.construction_sections;
create trigger construction_sections_audit
  after update on public.construction_sections
  for each row execute function public.record_audit_changes();

drop trigger if exists construction_trades_lifecycle on public.construction_trades;
create trigger construction_trades_lifecycle
  after insert or delete on public.construction_trades
  for each row execute function public.record_audit_lifecycle();

drop trigger if exists project_construction_trades_lifecycle on public.project_construction_trades;
create trigger project_construction_trades_lifecycle
  after insert or delete on public.project_construction_trades
  for each row execute function public.record_audit_lifecycle();

drop trigger if exists construction_sections_lifecycle on public.construction_sections;
create trigger construction_sections_lifecycle
  after insert or delete on public.construction_sections
  for each row execute function public.record_audit_lifecycle();

-- ── 13. Lazy seed of a VOB/C-flavoured default catalog (Q1) ────────────────
-- Mirrors seed_risk_categories_if_empty: fills only when the tenant has no
-- trades at all, so it can never overwrite curated data.
create or replace function public.seed_construction_trades_if_empty(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'PROJ-45: only tenant admins may seed the trade catalog'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.construction_trades where tenant_id = p_tenant_id) then
    return 0;
  end if;

  insert into public.construction_trades (tenant_id, key, label, sort_order, created_by)
  select p_tenant_id, t.key, t.label, t.ord, auth.uid()
    from (values
      ('erdarbeiten',        'Erdarbeiten',                      10),
      ('rohbau',             'Rohbau',                           20),
      ('zimmer_holzbau',     'Zimmer- und Holzbauarbeiten',      30),
      ('dachabdichtung',     'Dachdeckung und Abdichtung',       40),
      ('fassade',            'Fassade und Wärmedämmung',         50),
      ('fenster_tueren',     'Fenster und Außentüren',           60),
      ('estrich',            'Estricharbeiten',                  70),
      ('trockenbau',         'Trockenbau',                       80),
      ('sanitaer',           'Sanitärtechnik',                   90),
      ('heizung',            'Heizungstechnik',                 100),
      ('lueftung',           'Lüftungstechnik',                 110),
      ('elektro',            'Elektrotechnik',                  120),
      ('aufzug',             'Aufzugsanlagen',                  130),
      ('fliesen',            'Fliesen- und Plattenarbeiten',    140),
      ('maler',              'Maler- und Lackierarbeiten',      150),
      ('bodenbelag',         'Bodenbelagsarbeiten',             160),
      ('schlosser',          'Metallbau und Schlosserarbeiten', 170),
      ('aussenanlagen',      'Außenanlagen und Landschaftsbau', 180)
    ) as t(key, label, ord);

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.seed_construction_trades_if_empty(uuid) from public, anon;
grant execute on function public.seed_construction_trades_if_empty(uuid) to authenticated;

-- ── 14. Post-conditions ─────────────────────────────────────────────────────
do $mig$
declare
  v_missing text;
begin
  foreach v_missing in array array['construction_trades','project_construction_trades',
                                   'construction_sections','construction_section_phases']
  loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = v_missing and c.relrowsecurity)
    then
      raise exception 'PROJ-45: table % missing or RLS not enabled', v_missing;
    end if;
  end loop;

  if (select count(*) from pg_attribute
       where attrelid = 'public.work_items'::regclass
         and attname in ('trade_id','section_id') and not attisdropped) <> 2 then
    raise exception 'PROJ-45: work_items is missing the additive references';
  end if;

  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.risks'::regclass
                    and attname = 'trade_id' and not attisdropped) then
    raise exception 'PROJ-45: risks.trade_id missing';
  end if;
end
$mig$;
