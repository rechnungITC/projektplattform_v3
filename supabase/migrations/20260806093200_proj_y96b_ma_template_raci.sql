-- PROJ-Y-96b: M&A Template RACI-Zuordnungen — EXTEND on the PROJ-96 catalog +
-- PROJ-97b/PROJ-104 RACI backbone. Stamps role-key RACI onto workstreams AND
-- deliverables when a template is applied.
--
-- Kernentscheidungen (Tech Design 2026-08-06, CIA-reviewed, 2 hard-blocker fixes
-- + 2 user-locks locked in this migration):
--
--   1) NEW child table `ma_template_raci` (target_type ∈ {workstream, deliverable},
--      target_key soft-reference, role_key free-text per PROJ-24, R/A/C/I). No
--      audit trigger (dd_stream_templates precedent; templates = tenant config).
--
--   2) HARD-BLOCKER 1: `raci_target_type_check` (today 'work_item','deliverable' per
--      PROJ-104) MUST widen to include 'workstream' or Y-96b workstream copies
--      fail with 23514. Idempotent drop+recreate in this same migration.
--
--   3) HARD-BLOCKER 2: `ma_template_deliverables` has no stable `deliverable_key`
--      today. Y-96b needs one for target-key remapping + orphan detection. Add
--      nullable → backfill from name via deterministic slugify → set NOT NULL +
--      format CHECK + unique(template_id, deliverable_key). Update
--      `ensure_default_ma_project_templates` to write the key on future seeds.
--
--   4) FORK A1 (user-locked): `raci_assignments.source_template_id ON DELETE
--      RESTRICT` — mirrors PROJ-141-γ3 policy for workstreams/deliverables.
--      Template with live provenance is not deletable → identity protection.
--
--   5) FORK B1 (user-locked): Buy-Side default seed writes canonical M&A RACI
--      (`deal_lead`=A + `pmo_lead`=R on workstreams, `sponsor`=I on deliverables).
--      First apply emits `raci_unknown_role_key` warnings — actionable, not
--      blocking (free-text role_keys per PROJ-24-Lock, tenant must add them).
--
-- The `apply_ma_project_template` RPC gets a 5th atomic copy block (after phases,
-- workstreams, deliverables). Two warning classes (non-blocking):
--   • `raci_unknown_role_key` — tenant has no matching row in role_rates or
--     stakeholders (union check; resources.role_key was removed from the
--     schema — the audit-column whitelist mentions it historically but the
--     live table doesn't carry it). Row is stamped anyway.
--   • `raci_orphan_target`   — target_key not in the template's siblings. Row
--     is NOT stamped.
--
-- No audit-fn recreate → no can_read_audit_entry grant-drop risk (PROJ-114 H-1
-- lesson honoured). Provenance columns are append-only stamps and stay out of
-- `_tracked_audit_columns['raci_assignments']` (still 'role_key','raci_letter').
--
-- Live-RPC-Smoke: tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql (9 vectors
-- including Fork-A1 RESTRICT proof + PROJ-96/97b/104 regression verbatim).

-- ---------------------------------------------------------------------------
-- Section 1: HARD-BLOCKER 2 — deliverable_key on ma_template_deliverables.
-- 3-step add: nullable → deterministic backfill → NOT NULL + format CHECK.
-- ---------------------------------------------------------------------------
alter table public.ma_template_deliverables
  add column if not exists deliverable_key text;

-- Deterministic slugify: lowercase, replace non-alnum runs with '_', trim
-- leading/trailing underscores. Buy-Side default's 9 rows all produce unique
-- keys (verified: market_competitive_assessment, financial_dd_report,
-- quality_of_earnings_qoe_analyse, legal_dd_report, red_flag_memo,
-- tax_dd_report, hr_management_dd_report, it_dd_report, operations_dd_report).
update public.ma_template_deliverables
   set deliverable_key = regexp_replace(
     regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'),
     '^_+|_+$', '', 'g'
   )
 where deliverable_key is null;

alter table public.ma_template_deliverables
  alter column deliverable_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ma_template_deliverables_deliverable_key_check'
       and conrelid = 'public.ma_template_deliverables'::regclass
  ) then
    alter table public.ma_template_deliverables
      add constraint ma_template_deliverables_deliverable_key_check
      check (deliverable_key ~ '^[a-z][a-z0-9_]{1,48}$');
  end if;
end $$;

create unique index if not exists ma_template_deliverables_key_unique
  on public.ma_template_deliverables (template_id, deliverable_key);

-- ---------------------------------------------------------------------------
-- Section 2: HARD-BLOCKER 1 — widen raci_target_type_check to include
-- 'workstream'. Idempotent drop+recreate. Live raci_one_accountable partial
-- unique index still applies to workstream-typed rows (index is target-typed).
-- ---------------------------------------------------------------------------
alter table public.raci_assignments
  drop constraint if exists raci_target_type_check;
alter table public.raci_assignments
  add constraint raci_target_type_check
  check (target_type in ('work_item','deliverable','workstream'));

-- ---------------------------------------------------------------------------
-- Section 3: Provenance stamps on raci_assignments (Fork A1 = RESTRICT).
-- Additive nullable columns; no backfill; existing rows keep NULL.
-- Manual RPCs (set_work_item_raci / set_deliverable_raci) leave provenance
-- untouched — their explicit INSERT column lists don't reference these.
-- ---------------------------------------------------------------------------
alter table public.raci_assignments
  add column if not exists source_template_id uuid,
  add column if not exists source_template_version integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'raci_assignments_source_template_id_fkey'
       and conrelid = 'public.raci_assignments'::regclass
  ) then
    alter table public.raci_assignments
      add constraint raci_assignments_source_template_id_fkey
      foreign key (source_template_id)
      references public.ma_project_templates(id)
      on delete restrict;
  end if;
end $$;

comment on constraint raci_assignments_source_template_id_fkey on public.raci_assignments is
  'PROJ-Y-96b (Fork A1): ON DELETE RESTRICT — template with live RACI provenance is not deletable (mirrors PROJ-141-γ3 policy for workstreams/deliverables).';

-- ---------------------------------------------------------------------------
-- Section 4: NEW ma_template_raci child catalog table.
-- Mirror of ma_template_workstreams / ma_template_deliverables:
--   read = tenant member, write = tenant admin (committee/dd_stream pattern).
--   No audit trigger (dd_stream_templates precedent — templates = tenant config).
-- ---------------------------------------------------------------------------
create table if not exists public.ma_template_raci (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  template_id   uuid not null references public.ma_project_templates(id) on delete cascade,
  target_type   text not null check (target_type in ('workstream','deliverable')),
  target_key    text not null check (char_length(target_key) between 1 and 100),
  role_key      text not null check (char_length(trim(role_key)) between 1 and 100),
  raci_letter   text not null check (raci_letter in ('R','A','C','I')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ma_template_raci_template_idx
  on public.ma_template_raci (template_id);

-- Full uniqueness of a Template-RACI row (prevents exact duplicates in the catalog).
create unique index if not exists ma_template_raci_full_unique
  on public.ma_template_raci (template_id, target_type, target_key, role_key, raci_letter);

-- Template-side single-A per target (mirrors live raci_one_accountable at catalog time).
create unique index if not exists ma_template_raci_one_accountable
  on public.ma_template_raci (template_id, target_type, target_key)
  where raci_letter = 'A';

create trigger ma_template_raci_set_updated_at
  before update on public.ma_template_raci
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ma_template_raci enable row level security;

drop policy if exists ma_template_raci_select on public.ma_template_raci;
create policy ma_template_raci_select on public.ma_template_raci
  for select using (public.is_tenant_member(tenant_id));
drop policy if exists ma_template_raci_insert on public.ma_template_raci;
create policy ma_template_raci_insert on public.ma_template_raci
  for insert with check (public.is_tenant_admin(tenant_id));
drop policy if exists ma_template_raci_update on public.ma_template_raci;
create policy ma_template_raci_update on public.ma_template_raci
  for update using (public.is_tenant_admin(tenant_id))
              with check (public.is_tenant_admin(tenant_id));
drop policy if exists ma_template_raci_delete on public.ma_template_raci;
create policy ma_template_raci_delete on public.ma_template_raci
  for delete using (public.is_tenant_admin(tenant_id));

comment on table public.ma_template_raci is 'PROJ-Y-96b: M&A project-template RACI catalog. target_type ∈ {workstream, deliverable}; target_key soft-refs the sibling catalog inside the same template. Stamped into raci_assignments by apply_ma_project_template. No audit trigger (dd_stream_templates precedent).';

-- ---------------------------------------------------------------------------
-- Section 5: Extend ensure_default_ma_project_templates to write
-- `deliverable_key` and to seed canonical Buy-Side RACI rows (Fork B1).
-- Idempotent — the outer INSERT is guarded by ON CONFLICT DO NOTHING; if the
-- template already exists we return 0 without writing children.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_default_ma_project_templates(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_template_id uuid;
  v_seeded int := 0;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'not a tenant member' using errcode = '42501';
  end if;

  insert into public.ma_project_templates (tenant_id, template_key, name, deal_side, description, version)
  values (p_tenant_id, 'buy_side_standard', 'Buy-Side M&A (Standard)', 'buy',
          'Standard-Struktur für Buy-Side-M&A-Projekte: Standard-Workstreams, -Deliverables und -RACI.', 1)
  on conflict (tenant_id, template_key) do nothing
  returning id into v_template_id;

  if v_template_id is null then
    return 0;
  end if;
  v_seeded := 1;

  insert into public.ma_template_workstreams (tenant_id, template_id, workstream_key, label, goal, sort_order)
  values
    (p_tenant_id, v_template_id, 'commercial', 'Commercial / Market DD', 'Markt-, Wettbewerbs- und Geschäftsmodellanalyse', 10),
    (p_tenant_id, v_template_id, 'financial',  'Financial DD',            'Analyse der Vermögens-, Finanz- und Ertragslage', 20),
    (p_tenant_id, v_template_id, 'legal',      'Legal DD',                'Rechtliche Prüfung inkl. Verträge und Streitigkeiten', 30),
    (p_tenant_id, v_template_id, 'tax',        'Tax DD',                  'Steuerliche Prüfung und Risiken', 40),
    (p_tenant_id, v_template_id, 'hr',         'HR / Organisation DD',    'Personal, Management und Organisationsstruktur', 50),
    (p_tenant_id, v_template_id, 'it',         'IT / Technology DD',      'IT-Landschaft, Systeme und technische Schulden', 60),
    (p_tenant_id, v_template_id, 'operations', 'Operations DD',           'Operative Prozesse, Supply Chain und Standorte', 70);

  insert into public.ma_template_deliverables (tenant_id, template_id, workstream_key, deliverable_key, name, sort_order)
  values
    (p_tenant_id, v_template_id, 'commercial', 'market_competitive_assessment', 'Market & Competitive Assessment', 10),
    (p_tenant_id, v_template_id, 'financial',  'financial_dd_report',           'Financial DD Report', 10),
    (p_tenant_id, v_template_id, 'financial',  'quality_of_earnings_qoe_analyse', 'Quality of Earnings (QoE) Analyse', 20),
    (p_tenant_id, v_template_id, 'legal',      'legal_dd_report',               'Legal DD Report', 10),
    (p_tenant_id, v_template_id, 'legal',      'red_flag_memo',                 'Red-Flag Memo', 20),
    (p_tenant_id, v_template_id, 'tax',        'tax_dd_report',                 'Tax DD Report', 10),
    (p_tenant_id, v_template_id, 'hr',         'hr_management_dd_report',       'HR & Management DD Report', 10),
    (p_tenant_id, v_template_id, 'it',         'it_dd_report',                  'IT DD Report', 10),
    (p_tenant_id, v_template_id, 'operations', 'operations_dd_report',          'Operations DD Report', 10);

  -- Fork B1: canonical Buy-Side RACI defaults. Free-text role_keys per PROJ-24-Lock.
  --   deal_lead = A on each workstream          (7 rows, sort_order 10)
  --   pmo_lead  = R on each workstream          (7 rows, sort_order 20)
  --   sponsor   = I on each deliverable         (9 rows, sort_order 10)
  -- First apply into a tenant without these role_keys emits raci_unknown_role_key
  -- warnings — actionable, not blocking (deliberate onboarding hint).
  insert into public.ma_template_raci (tenant_id, template_id, target_type, target_key, role_key, raci_letter, sort_order)
  select p_tenant_id, v_template_id, 'workstream', tw.workstream_key, 'deal_lead', 'A', 10
    from public.ma_template_workstreams tw where tw.template_id = v_template_id
  union all
  select p_tenant_id, v_template_id, 'workstream', tw.workstream_key, 'pmo_lead', 'R', 20
    from public.ma_template_workstreams tw where tw.template_id = v_template_id
  union all
  select p_tenant_id, v_template_id, 'deliverable', td.deliverable_key, 'sponsor', 'I', 10
    from public.ma_template_deliverables td where td.template_id = v_template_id;

  return v_seeded;
end;
$$;

revoke all on function public.ensure_default_ma_project_templates(uuid) from public, anon;
grant execute on function public.ensure_default_ma_project_templates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Section 6: Extend apply_ma_project_template with the 5th atomic copy block.
-- Structure unchanged (SECURITY DEFINER, hard re-apply block, phase-model reuse,
-- workstream + deliverable copy). New: after both copies, walk ma_template_raci
-- and stamp raci_assignments rows. Emit structured warnings for unknown role
-- keys (row stamped anyway) and orphan target keys (row skipped). Return value
-- gains `raci_created` and optional `warnings`.
-- ---------------------------------------------------------------------------
create or replace function public.apply_ma_project_template(p_project_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant uuid;
  v_type text;
  v_caller uuid := auth.uid();
  v_tpl public.ma_project_templates%rowtype;
  v_phase_result jsonb;
  v_ws_created int := 0;
  v_del_created int := 0;
  v_raci_created int := 0;
  v_known_roles text[];
  v_warnings jsonb := '[]'::jsonb;
  r record;
  v_target_id uuid;
  v_result jsonb;
begin
  select tenant_id, project_type into v_tenant, v_type
  from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'template apply is only allowed for M&A projects' using errcode = 'P0001';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to apply a template to this project' using errcode = '42501';
  end if;

  select * into v_tpl from public.ma_project_templates
  where id = p_template_id and tenant_id = v_tenant and is_active = true;
  if not found then
    raise exception 'template not found or inactive in this tenant' using errcode = 'P0002';
  end if;

  -- Hard re-apply block: workstreams have unique(project_id, workstream_key).
  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  -- Phases: reuse the deployed PROJ-95 phase-model activation (idempotent, mandate-gated phase 2).
  v_phase_result := public.activate_ma_phase_model(p_project_id);

  -- Workstreams: decoupled copy + provenance stamp.
  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_workstreams tw
  where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

  -- Deliverables: remap workstream_key → freshly inserted workstream_id.
  insert into public.deliverables
    (tenant_id, project_id, workstream_id, name, description, status, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, w.id, td.name, td.description, td.status, td.confidentiality_level, td.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_deliverables td
  join public.workstreams w
    on w.project_id = p_project_id and w.workstream_key = td.workstream_key
  where td.template_id = v_tpl.id;
  get diagnostics v_del_created = row_count;

  -- PROJ-Y-96b: RACI copy — 5th atomic block. Pre-compute the tenant's "known
  -- role_key" universe (union of role_rates + stakeholders — `resources.role_key`
  -- was removed from the live schema even though it still appears in the audit
  -- whitelist) so we don't hit those tables per template row. Empty tenants →
  -- empty array → every row emits raci_unknown_role_key (deliberate onboarding
  -- hint for Buy-Side seed).
  select coalesce(array_agg(distinct role_key), array[]::text[])
    into v_known_roles
    from (
      select role_key from public.role_rates   where tenant_id = v_tenant
      union
      select role_key from public.stakeholders where tenant_id = v_tenant
    ) roles
   where role_key is not null;

  for r in
    select mr.target_type, mr.target_key, trim(mr.role_key) as role_key, mr.raci_letter
      from public.ma_template_raci mr
     where mr.template_id = v_tpl.id
     order by mr.sort_order, mr.target_type, mr.target_key, mr.role_key
  loop
    -- Remap target_key → live target_id inside this project.
    v_target_id := null;
    if r.target_type = 'workstream' then
      select id into v_target_id
        from public.workstreams
       where project_id = p_project_id and workstream_key = r.target_key;
    elsif r.target_type = 'deliverable' then
      select d.id into v_target_id
        from public.deliverables d
        join public.ma_template_deliverables td
          on td.template_id = v_tpl.id and td.deliverable_key = r.target_key
       where d.project_id = p_project_id
         and d.source_template_id = v_tpl.id
         and d.name = td.name
       limit 1;
    end if;

    if v_target_id is null then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_orphan_target',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
      continue;
    end if;

    if not (r.role_key = any (v_known_roles)) then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_unknown_role_key',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
    end if;

    insert into public.raci_assignments
      (tenant_id, project_id, target_type, target_id, role_key, raci_letter,
       created_by, source_template_id, source_template_version)
    values
      (v_tenant, p_project_id, r.target_type, v_target_id, r.role_key, r.raci_letter,
       v_caller, v_tpl.id, v_tpl.version);
    v_raci_created := v_raci_created + 1;
  end loop;

  v_result := jsonb_build_object(
    'template_id', v_tpl.id,
    'template_version', v_tpl.version,
    'phase_model', v_phase_result,
    'workstreams_created', v_ws_created,
    'deliverables_created', v_del_created,
    'raci_created', v_raci_created
  );
  if jsonb_array_length(v_warnings) > 0 then
    v_result := v_result || jsonb_build_object('warnings', v_warnings);
  end if;
  return v_result;
end;
$$;

revoke all on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated;

comment on function public.apply_ma_project_template(uuid, uuid) is 'PROJ-96 + PROJ-Y-96b: atomically seeds a fresh M&A project from a template (reuses activate_ma_phase_model for phases; copies workstreams, deliverables, and RACI with provenance stamps). Hard re-apply block. RACI-copy emits non-blocking warnings for unknown role_keys (row still stamped) and orphan target_keys (row skipped).';
