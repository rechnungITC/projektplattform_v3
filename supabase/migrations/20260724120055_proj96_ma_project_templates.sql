-- PROJ-96: M&A Project Templates (EXTEND, blueprint = committee_templates / dd_stream_templates)
-- Catalog (tenant config) -> copy-on-create into project via apply_ma_project_template.
-- No audit trigger (dd_stream_templates precedent: tenant config, moddatetime only) -> no audit-fn recreate.

-- 1. Template catalog head
create table if not exists public.ma_project_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  name text not null,
  deal_side text not null default 'buy' check (deal_side in ('buy','sell','carve_out','jv','minority')),
  description text,
  version int not null default 1 check (version >= 1),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, template_key)
);

-- 2. Template child: workstreams
create table if not exists public.ma_template_workstreams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.ma_project_templates(id) on delete cascade,
  workstream_key text not null check (workstream_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label text not null,
  goal text,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, workstream_key)
);

-- 3. Template child: deliverables (anchored to a template workstream by key)
create table if not exists public.ma_template_deliverables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.ma_project_templates(id) on delete cascade,
  workstream_key text not null,
  name text not null,
  description text,
  status text not null default 'planned',
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ma_template_workstreams_template on public.ma_template_workstreams(template_id);
create index if not exists idx_ma_template_deliverables_template on public.ma_template_deliverables(template_id);

-- moddatetime triggers (schema-qualified per schema-drift shadow-DB requirement)
create trigger ma_project_templates_set_updated_at before update on public.ma_project_templates
  for each row execute function extensions.moddatetime('updated_at');
create trigger ma_template_workstreams_set_updated_at before update on public.ma_template_workstreams
  for each row execute function extensions.moddatetime('updated_at');
create trigger ma_template_deliverables_set_updated_at before update on public.ma_template_deliverables
  for each row execute function extensions.moddatetime('updated_at');

-- RLS: read = tenant member (shared catalog config), write = tenant admin (committee/dd_stream pattern)
alter table public.ma_project_templates enable row level security;
alter table public.ma_template_workstreams enable row level security;
alter table public.ma_template_deliverables enable row level security;

create policy ma_project_templates_select on public.ma_project_templates
  for select using (public.is_tenant_member(tenant_id));
create policy ma_project_templates_insert on public.ma_project_templates
  for insert with check (public.is_tenant_admin(tenant_id));
create policy ma_project_templates_update on public.ma_project_templates
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy ma_project_templates_delete on public.ma_project_templates
  for delete using (public.is_tenant_admin(tenant_id));

create policy ma_template_workstreams_select on public.ma_template_workstreams
  for select using (public.is_tenant_member(tenant_id));
create policy ma_template_workstreams_insert on public.ma_template_workstreams
  for insert with check (public.is_tenant_admin(tenant_id));
create policy ma_template_workstreams_update on public.ma_template_workstreams
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy ma_template_workstreams_delete on public.ma_template_workstreams
  for delete using (public.is_tenant_admin(tenant_id));

create policy ma_template_deliverables_select on public.ma_template_deliverables
  for select using (public.is_tenant_member(tenant_id));
create policy ma_template_deliverables_insert on public.ma_template_deliverables
  for insert with check (public.is_tenant_admin(tenant_id));
create policy ma_template_deliverables_update on public.ma_template_deliverables
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy ma_template_deliverables_delete on public.ma_template_deliverables
  for delete using (public.is_tenant_admin(tenant_id));

-- 4. Provenance stamps on live copies (additive, nullable, on delete set null -> no retroactive coupling)
alter table public.workstreams
  add column if not exists source_template_id uuid references public.ma_project_templates(id) on delete set null,
  add column if not exists source_template_version int;
alter table public.deliverables
  add column if not exists source_template_id uuid references public.ma_project_templates(id) on delete set null,
  add column if not exists source_template_version int;

-- 5. Lazy-seed default Buy-Side template (member-triggered first access, idempotent)
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
          'Standard-Struktur für Buy-Side-M&A-Projekte: Standard-Workstreams und -Deliverables der Due Diligence.', 1)
  on conflict (tenant_id, template_key) do nothing
  returning id into v_template_id;

  if v_template_id is null then
    return 0; -- already seeded
  end if;
  v_seeded := 1;

  insert into public.ma_template_workstreams (tenant_id, template_id, workstream_key, label, goal, sort_order)
  values
    (p_tenant_id, v_template_id, 'commercial', 'Commercial / Market DD', 'Markt-, Wettbewerbs- und Geschäftsmodellanalyse', 10),
    (p_tenant_id, v_template_id, 'financial', 'Financial DD', 'Analyse der Vermögens-, Finanz- und Ertragslage', 20),
    (p_tenant_id, v_template_id, 'legal', 'Legal DD', 'Rechtliche Prüfung inkl. Verträge und Streitigkeiten', 30),
    (p_tenant_id, v_template_id, 'tax', 'Tax DD', 'Steuerliche Prüfung und Risiken', 40),
    (p_tenant_id, v_template_id, 'hr', 'HR / Organisation DD', 'Personal, Management und Organisationsstruktur', 50),
    (p_tenant_id, v_template_id, 'it', 'IT / Technology DD', 'IT-Landschaft, Systeme und technische Schulden', 60),
    (p_tenant_id, v_template_id, 'operations', 'Operations DD', 'Operative Prozesse, Supply Chain und Standorte', 70);

  insert into public.ma_template_deliverables (tenant_id, template_id, workstream_key, name, sort_order)
  values
    (p_tenant_id, v_template_id, 'commercial', 'Market & Competitive Assessment', 10),
    (p_tenant_id, v_template_id, 'financial', 'Financial DD Report', 10),
    (p_tenant_id, v_template_id, 'financial', 'Quality of Earnings (QoE) Analyse', 20),
    (p_tenant_id, v_template_id, 'legal', 'Legal DD Report', 10),
    (p_tenant_id, v_template_id, 'legal', 'Red-Flag Memo', 20),
    (p_tenant_id, v_template_id, 'tax', 'Tax DD Report', 10),
    (p_tenant_id, v_template_id, 'hr', 'HR & Management DD Report', 10),
    (p_tenant_id, v_template_id, 'it', 'IT DD Report', 10),
    (p_tenant_id, v_template_id, 'operations', 'Operations DD Report', 10);

  return v_seeded;
end;
$$;

revoke all on function public.ensure_default_ma_project_templates(uuid) from public, anon;
grant execute on function public.ensure_default_ma_project_templates(uuid) to authenticated;

-- 6. Copy-on-create: apply a template to a project (atomic; reuses activate_ma_phase_model for phases)
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

  -- hard re-apply block (workstreams have unique(project_id, workstream_key) -> avoid dupes/collisions)
  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  -- phases: reuse the deployed PROJ-95 phase-model activation (idempotent, mandate-gated phase 2)
  v_phase_result := public.activate_ma_phase_model(p_project_id);

  -- workstreams: decoupled copy + provenance stamp
  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_workstreams tw
  where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

  -- deliverables: remap workstream_key -> freshly inserted workstream_id
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

  return jsonb_build_object(
    'template_id', v_tpl.id,
    'template_version', v_tpl.version,
    'phase_model', v_phase_result,
    'workstreams_created', v_ws_created,
    'deliverables_created', v_del_created
  );
end;
$$;

revoke all on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated;

comment on table public.ma_project_templates is 'PROJ-96: M&A project template catalog (tenant config). Applied via apply_ma_project_template (copy-on-create). No audit trigger (tenant config, dd_stream_templates precedent).';
comment on function public.apply_ma_project_template(uuid, uuid) is 'PROJ-96: atomically seeds a fresh M&A project from a template (reuses activate_ma_phase_model for phases; copies workstreams + deliverables with provenance stamp). Hard re-apply block.';
