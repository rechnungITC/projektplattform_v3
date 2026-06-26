-- PROJ-114 — DD-Findings erfassen, bewerten, quantifizieren (Epic G).
-- CIA-reviewed EXTEND on PROJ-112 (dd_streams) + PROJ-20 (risks) + PROJ-10 (audit)
-- + PROJ-100a (need-to-know). No new dep. Writes go ONLY through SECURITY DEFINER
-- RPCs (so a deal_breaker classification always fires escalation; no direct write
-- policy). Need-to-know inherited from the stream (finding level >= stream level).

-- ── 1. dd_findings ──────────────────────────────────────────────────────────
create table if not exists public.dd_findings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  dd_stream_id          uuid not null references public.dd_streams(id) on delete cascade,
  title                 text not null check (length(btrim(title)) between 1 and 200),
  description           text,
  severity              text not null default 'mittel'
                          check (severity in ('niedrig','mittel','hoch','deal_breaker')),
  economic_impact_eur   numeric(18,2),                     -- optional (AC „geschätzt, wo möglich")
  probability           smallint check (probability between 1 and 5),
  recommended_treatment text check (recommended_treatment in
                          ('kaufpreisanpassung','garantie','freistellung','integrationsthema','akzeptiert')),
  status                text not null default 'open'
                          check (status in ('open','in_review','resolved','dismissed')),
  linked_risk_id        uuid references public.risks(id) on delete set null,  -- direct FK (NOT risk_links)
  responsible_user_id   uuid references public.profiles(id) on delete set null,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists dd_findings_stream_idx on public.dd_findings (dd_stream_id);
create index if not exists dd_findings_project_idx on public.dd_findings (project_id);
create index if not exists dd_findings_tenant_idx on public.dd_findings (tenant_id);
create index if not exists dd_findings_risk_idx on public.dd_findings (linked_risk_id) where linked_risk_id is not null;
alter table public.dd_findings enable row level security;

-- ── 2. dd_finding_escalations (audit trail for deal-breaker → deal lead/sponsor) ─
create table if not exists public.dd_finding_escalations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  finding_id          uuid not null references public.dd_findings(id) on delete cascade,
  escalated_to_user_id uuid not null references public.profiles(id) on delete cascade,
  role                text not null check (role in ('deal_lead','sponsor')),
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  escalated_at        timestamptz not null default now(),
  acknowledged_at     timestamptz,
  unique (finding_id, role)
);
create index if not exists dd_finding_escalations_finding_idx on public.dd_finding_escalations (finding_id);
create index if not exists dd_finding_escalations_user_idx on public.dd_finding_escalations (escalated_to_user_id);
alter table public.dd_finding_escalations enable row level security;

-- ── 3. RLS — read for project members, need-to-know RESTRICTIVE gate.
--     NO permissive write policies: all writes go through SECURITY DEFINER RPCs,
--     guaranteeing the deal-breaker escalation always fires. ─────────────────
drop policy if exists dd_findings_select on public.dd_findings;
create policy dd_findings_select on public.dd_findings
  for select to authenticated using (public.is_project_member(project_id));
drop policy if exists dd_findings_confidentiality_gate on public.dd_findings;
create policy dd_findings_confidentiality_gate on public.dd_findings
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists dd_finding_escalations_select on public.dd_finding_escalations;
create policy dd_finding_escalations_select on public.dd_finding_escalations
  for select to authenticated using (public.is_project_member(project_id));
drop policy if exists dd_finding_escalations_gate on public.dd_finding_escalations;
create policy dd_finding_escalations_gate on public.dd_finding_escalations
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists dd_findings_set_updated_at on public.dd_findings;
create trigger dd_findings_set_updated_at
  before update on public.dd_findings
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists audit_changes_dd_findings on public.dd_findings;
create trigger audit_changes_dd_findings
  after update on public.dd_findings
  for each row execute function public.record_audit_changes();

-- ── 4. Audit wiring (H1) — register dd_findings BEFORE any trigger UPDATE.
--     Collision-safe apply-time injection onto the current live definitions
--     (parallel sessions added dd_questions / raci_assignments branches). ────
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def is not null and v_def not like '%dd_findings%' then
    v_new := replace(v_def, '])))', ', ''dd_findings''::text])))');
    if v_new = v_def then raise exception 'unexpected audit check format'; end if;
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
  end if;
end $mig$;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure) into d;
  if position('''dd_findings''' in d) = 0 then
    d := replace(d, 'else array[]::text[]',
      'when ''dd_findings'' then array[''title'',''description'',''severity'',''economic_impact_eur'',''probability'',''recommended_treatment'',''status'',''linked_risk_id'',''responsible_user_id'',''confidentiality_level''] else array[]::text[]');
    execute d;
  end if;
end $mig$;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure) into d;
  if position('''dd_findings''' in d) = 0 then
    d := replace(d, 'else return false;',
      'when ''dd_findings'' then select project_id into v_project from public.dd_findings where id = p_entity_id; else return false;');
    execute d;
  end if;
end $mig$;

-- ── 5. Internal escalation helper (deal_lead + sponsor), idempotent ─────────
create or replace function public._escalate_dd_finding(p_finding_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $f$
declare v_f public.dd_findings; v_lead uuid; v_sponsor uuid;
begin
  select * into v_f from public.dd_findings where id = p_finding_id;
  if not found then return; end if;

  select responsible_user_id into v_lead from public.projects where id = v_f.project_id;
  select sponsor_user_id into v_sponsor from public.ma_project_profiles where project_id = v_f.project_id;

  if v_lead is not null then
    insert into public.dd_finding_escalations
      (tenant_id, project_id, finding_id, escalated_to_user_id, role, confidentiality_level)
    values (v_f.tenant_id, v_f.project_id, p_finding_id, v_lead, 'deal_lead', v_f.confidentiality_level)
    on conflict (finding_id, role) do nothing;
  end if;
  if v_sponsor is not null then
    insert into public.dd_finding_escalations
      (tenant_id, project_id, finding_id, escalated_to_user_id, role, confidentiality_level)
    values (v_f.tenant_id, v_f.project_id, p_finding_id, v_sponsor, 'sponsor', v_f.confidentiality_level)
    on conflict (finding_id, role) do nothing;
  end if;
end $f$;
revoke execute on function public._escalate_dd_finding(uuid) from public, anon, authenticated;

-- ── 6. create_dd_finding (manager-gated, need-to-know aware) ────────────────
create or replace function public.create_dd_finding(
  p_dd_stream_id uuid, p_title text, p_description text default null,
  p_severity text default 'mittel', p_economic_impact_eur numeric default null,
  p_probability smallint default null, p_recommended_treatment text default null,
  p_linked_risk_id uuid default null, p_confidentiality_level public.ma_confidentiality_level default null
) returns public.dd_findings
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_stream_level public.ma_confidentiality_level; v_level public.ma_confidentiality_level;
  v_row public.dd_findings;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select tenant_id, project_id, confidentiality_level into v_tenant, v_project, v_stream_level
    from public.dd_streams where id = p_dd_stream_id;
  if not found then raise exception 'dd_stream not found' using errcode = 'P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role to create dd_finding' using errcode = '42501';
  end if;

  -- need-to-know: finding level >= stream level; default inherits the stream (H4)
  v_level := coalesce(p_confidentiality_level, v_stream_level);
  if v_level < v_stream_level then
    raise exception 'finding confidentiality cannot be below its stream' using errcode = '42501';
  end if;
  -- caller must be cleared for the resulting level
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'not cleared for this confidentiality level' using errcode = '42501';
  end if;

  insert into public.dd_findings
    (tenant_id, project_id, dd_stream_id, title, description, severity, economic_impact_eur,
     probability, recommended_treatment, linked_risk_id, confidentiality_level, created_by)
  values
    (v_tenant, v_project, p_dd_stream_id, p_title, p_description, p_severity, p_economic_impact_eur,
     p_probability, p_recommended_treatment, p_linked_risk_id, v_level, v_caller)
  returning * into v_row;

  if v_row.severity = 'deal_breaker' then
    perform public._escalate_dd_finding(v_row.id);
  end if;
  return v_row;
end $f$;
revoke execute on function public.create_dd_finding(uuid,text,text,text,numeric,smallint,text,uuid,public.ma_confidentiality_level) from public, anon;
grant execute on function public.create_dd_finding(uuid,text,text,text,numeric,smallint,text,uuid,public.ma_confidentiality_level) to authenticated;

-- ── 7. update_dd_finding (manager + need-to-know; escalates on →deal_breaker) ─
create or replace function public.update_dd_finding(
  p_finding_id uuid, p_title text default null, p_description text default null,
  p_severity text default null, p_economic_impact_eur numeric default null, p_clear_eur boolean default false,
  p_probability smallint default null, p_recommended_treatment text default null,
  p_status text default null, p_linked_risk_id uuid default null, p_responsible_user_id uuid default null
) returns public.dd_findings
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare v_caller uuid := auth.uid(); v_f public.dd_findings; v_row public.dd_findings; v_was_db boolean;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_f from public.dd_findings where id = p_finding_id;
  if not found then raise exception 'dd_finding not found' using errcode = 'P0002'; end if;
  if not (public.is_tenant_admin(v_f.tenant_id) or public.is_project_lead(v_f.project_id)) then
    raise exception 'insufficient role to update dd_finding' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_f.project_id, v_f.confidentiality_level) then
    raise exception 'not cleared for this finding' using errcode = '42501';
  end if;

  v_was_db := (v_f.severity = 'deal_breaker');

  update public.dd_findings set
    title = coalesce(p_title, title),
    description = coalesce(p_description, description),
    severity = coalesce(p_severity, severity),
    economic_impact_eur = case when p_clear_eur then null else coalesce(p_economic_impact_eur, economic_impact_eur) end,
    probability = coalesce(p_probability, probability),
    recommended_treatment = coalesce(p_recommended_treatment, recommended_treatment),
    status = coalesce(p_status, status),
    linked_risk_id = coalesce(p_linked_risk_id, linked_risk_id),
    responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id),
    updated_at = now()
  where id = p_finding_id
  returning * into v_row;

  -- escalate only on the transition INTO deal_breaker
  if v_row.severity = 'deal_breaker' and not v_was_db then
    perform public._escalate_dd_finding(v_row.id);
  end if;
  return v_row;
end $f$;
revoke execute on function public.update_dd_finding(uuid,text,text,text,numeric,boolean,smallint,text,text,uuid,uuid) from public, anon;
grant execute on function public.update_dd_finding(uuid,text,text,text,numeric,boolean,smallint,text,text,uuid,uuid) to authenticated;

-- ── 8. acknowledge escalation (only the escalated-to user) ──────────────────
create or replace function public.acknowledge_dd_finding_escalation(p_escalation_id uuid)
returns public.dd_finding_escalations
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare v_caller uuid := auth.uid(); v_row public.dd_finding_escalations;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_row from public.dd_finding_escalations where id = p_escalation_id;
  if not found then raise exception 'escalation not found' using errcode = 'P0002'; end if;
  if v_row.escalated_to_user_id <> v_caller then
    raise exception 'only the escalated user can acknowledge' using errcode = '42501';
  end if;
  update public.dd_finding_escalations set acknowledged_at = now()
   where id = p_escalation_id returning * into v_row;
  return v_row;
end $f$;
revoke execute on function public.acknowledge_dd_finding_escalation(uuid) from public, anon;
grant execute on function public.acknowledge_dd_finding_escalation(uuid) to authenticated;

-- ── 9. dd_findings_summary — SECURITY INVOKER aggregate (no gate bypass, E6) ─
create or replace function public.dd_findings_summary(p_project_id uuid)
returns table (dd_stream_id uuid, severity text, finding_count bigint, eur_sum numeric, null_eur_count bigint)
language sql stable security invoker set search_path = public, pg_temp
as $f$
  select f.dd_stream_id, f.severity, count(*)::bigint,
         coalesce(sum(f.economic_impact_eur), 0)::numeric,
         count(*) filter (where f.economic_impact_eur is null)::bigint
  from public.dd_findings f
  where f.project_id = p_project_id
  group by f.dd_stream_id, f.severity;
$f$;
revoke execute on function public.dd_findings_summary(uuid) from public, anon;
grant execute on function public.dd_findings_summary(uuid) to authenticated;
