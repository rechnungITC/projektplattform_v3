-- =============================================================================
-- PROJ-122 — [M&A] SPA Issues List und Vertragsverhandlungspunkte (Epic J)
-- =============================================================================
-- EXTEND on PROJ-100a (need-to-know), PROJ-10 (field audit), PROJ-114
-- (dd_findings recipe), PROJ-110 (stage-gate pre-read), PROJ-115 (external
-- document links).
--
-- Reuse was evaluated and rejected for work_items / decisions / risks /
-- dd_findings / open_items (see the Tech Design in the feature spec):
-- open_items has NO confidentiality_level at all, decisions are immutable,
-- dd_findings require a dd_stream_id, and work_items would have to hide the
-- SPA fields in `attributes` jsonb — which _tracked_audit_columns does not
-- track, so the DoD "Audit-Trail aktiv" would only appear to be satisfied.
--
-- Security model (mirrors dd_findings, AC-122-H3/H4):
--   * SELECT: permissive is_project_member + RESTRICTIVE can_access_classified
--   * NO insert/update/delete policies at all -> writes are RLS default-deny
--     and only possible through the SECURITY DEFINER RPCs below, each of which
--     re-checks can_access_classified BEFORE writing (no self-escalation).
--   * The summary RPC is SECURITY INVOKER so aggregates can never reveal more
--     rows than the caller may read (aggregate-leak probe in the pentest).
--
-- Shared surfaces (audit trio, stage_gate_prereadiness, external link
-- resolver) are extended ONLY by anchor-replacing their LIVE definitions, so
-- branches added by parallel slices survive (AC-122-H2/H6).
-- =============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.spa_issues (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  project_id               uuid not null references public.projects(id) on delete cascade,
  -- Stable per-project running number ("I-1", "I-2"): Legal references issues
  -- by number across negotiation rounds, so it must not shift when rows are
  -- filtered by need-to-know.
  issue_number             integer not null,
  title                    text not null check (length(btrim(title)) between 1 and 200),
  -- Free-text clause reference ("§ 8.2 Garantien"). Deep clause-ID linking into
  -- the draft contract is deliberately out of scope (spec "Offene Fragen").
  clause_reference         text check (clause_reference is null or length(clause_reference) <= 200),
  category                 text not null default 'other'
                             check (category in ('warranty','indemnity','purchase_price',
                                                 'liability','condition','other')),
  own_position             text check (own_position is null or length(own_position) <= 8000),
  counterparty_position    text check (counterparty_position is null or length(counterparty_position) <= 8000),
  recommended_solution     text check (recommended_solution is null or length(recommended_solution) <= 8000),
  risk_if_no_agreement     text check (risk_if_no_agreement is null or length(risk_if_no_agreement) <= 8000),
  status                   text not null default 'open'
                             check (status in ('open','in_negotiation','agreed','escalated','closed')),
  importance               text not null default 'mittel'
                             check (importance in ('niedrig','mittel','hoch','kritisch')),
  responsible_user_id      uuid references public.profiles(id) on delete set null,
  due_date                 date,
  -- Buildable links only (AC-122 D4). Purchase-price bridge (PROJ-121) and
  -- closing conditions (PROJ-123) are still Planned - they get additive
  -- nullable FK columns once those tables exist (PROJ-Y-122a).
  linked_finding_id        uuid references public.dd_findings(id) on delete set null,
  linked_risk_id           uuid references public.risks(id) on delete set null,
  -- DB default stays 'standard' (house norm). RPC/UI preselect 'confidential'
  -- (AC-122-H5) - a hard 'confidential' DB default would lock Legal users
  -- without clearance out of the rows they just created.
  confidentiality_level    public.ma_confidentiality_level not null default 'standard',
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint spa_issues_number_unique unique (project_id, issue_number)
);

create index if not exists spa_issues_project_idx on public.spa_issues (project_id);
create index if not exists spa_issues_tenant_idx on public.spa_issues (tenant_id);
create index if not exists spa_issues_status_idx on public.spa_issues (project_id, status);
create index if not exists spa_issues_finding_idx on public.spa_issues (linked_finding_id)
  where linked_finding_id is not null;
create index if not exists spa_issues_risk_idx on public.spa_issues (linked_risk_id)
  where linked_risk_id is not null;
create index if not exists spa_issues_responsible_idx on public.spa_issues (responsible_user_id)
  where responsible_user_id is not null;

alter table public.spa_issues enable row level security;

comment on table public.spa_issues is
  'PROJ-122 - M&A SPA issues list (contract negotiation points). Writes are RPC-only; need-to-know via can_access_classified.';

-- ── 2. RLS: read-only policies; writes are RPC-only (AC-122-H3) ─────────────
drop policy if exists spa_issues_select on public.spa_issues;
create policy spa_issues_select on public.spa_issues
  for select to authenticated using (public.is_project_member(project_id));

drop policy if exists spa_issues_confidentiality_gate on public.spa_issues;
create policy spa_issues_confidentiality_gate on public.spa_issues
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- ── 3. Triggers: updated_at + PROJ-10 field audit ──────────────────────────
drop trigger if exists spa_issues_set_updated_at on public.spa_issues;
create trigger spa_issues_set_updated_at
  before update on public.spa_issues
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists audit_changes_spa_issues on public.spa_issues;
create trigger audit_changes_spa_issues
  after update on public.spa_issues
  for each row execute function public.record_audit_changes();

-- ── 4. Audit trio — collision-safe anchor-replace on LIVE defs (AC-122-H6) ──
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def is not null and v_def not like '%''spa_issues''%' then
    v_new := replace(v_def, '])))', ', ''spa_issues''::text])))');
    if v_new = v_def then raise exception 'unexpected audit check format'; end if;
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
  end if;
end $mig$;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure) into d;
  if position('''spa_issues''' in d) = 0 then
    d := replace(d, 'else array[]::text[]',
      'when ''spa_issues'' then array[''title'',''clause_reference'',''category'','
      || '''own_position'',''counterparty_position'',''recommended_solution'','
      || '''risk_if_no_agreement'',''status'',''importance'',''responsible_user_id'','
      || '''due_date'',''linked_finding_id'',''linked_risk_id'',''confidentiality_level''] '
      || 'else array[]::text[]');
    execute d;
  end if;
end $mig$;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure) into d;
  if position('''spa_issues''' in d) = 0 then
    d := replace(d, 'else return false;',
      'when ''spa_issues'' then select project_id into v_project from public.spa_issues where id = p_entity_id; '
      || 'else return false;');
    execute d;
  end if;
end $mig$;

-- Recreating can_read_audit_entry from its live definition can drop the
-- authenticated EXECUTE grant, which silently breaks the PROJ-10 history tab.
-- Re-assert it unconditionally (lesson from 20260625153238).
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- ── 5. create_spa_issue (AC-122-H4: clearance re-check BEFORE write) ────────
-- Write gate is admin OR project lead OR project editor. Deliberate deviation
-- from the stricter dd_findings manager-gate: the primary persona (Legal
-- Counsel) is a project *editor*, not a lead - a manager-only gate would make
-- the feature unusable for the role that owns the artefact. Viewers stay
-- read-only.
create or replace function public.create_spa_issue(
  p_project_id uuid,
  p_title text,
  p_clause_reference text default null,
  p_category text default 'other',
  p_own_position text default null,
  p_counterparty_position text default null,
  p_recommended_solution text default null,
  p_risk_if_no_agreement text default null,
  p_importance text default 'mittel',
  p_responsible_user_id uuid default null,
  p_due_date date default null,
  p_linked_finding_id uuid default null,
  p_linked_risk_id uuid default null,
  p_confidentiality_level public.ma_confidentiality_level default 'confidential'
) returns public.spa_issues
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_level  public.ma_confidentiality_level := coalesce(p_confidentiality_level, 'confidential');
  v_num    integer;
  v_row    public.spa_issues;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id into v_tenant
    from public.projects where id = p_project_id and is_deleted = false;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant)
          or public.is_project_lead(p_project_id)
          or public.has_project_role(p_project_id, 'editor')) then
    raise exception 'insufficient role to create spa_issue' using errcode = '42501';
  end if;

  -- No self-escalation: the caller must already be cleared for the level they
  -- are about to write (AC-122-H4).
  if not public.can_access_classified(p_project_id, v_level) then
    raise exception 'not cleared for this confidentiality level' using errcode = '42501';
  end if;

  -- Cross-project / cross-tenant link smuggling guard.
  if p_linked_finding_id is not null
     and not exists (select 1 from public.dd_findings
                      where id = p_linked_finding_id and project_id = p_project_id) then
    raise exception 'linked finding does not belong to this project' using errcode = '23514';
  end if;
  if p_linked_risk_id is not null
     and not exists (select 1 from public.risks
                      where id = p_linked_risk_id and project_id = p_project_id) then
    raise exception 'linked risk does not belong to this project' using errcode = '23514';
  end if;

  -- Serialise per-project numbering; the unique constraint is the backstop.
  perform pg_advisory_xact_lock(hashtextextended('spa_issues:' || p_project_id::text, 0));
  select coalesce(max(issue_number), 0) + 1 into v_num
    from public.spa_issues where project_id = p_project_id;

  insert into public.spa_issues
    (tenant_id, project_id, issue_number, title, clause_reference, category,
     own_position, counterparty_position, recommended_solution, risk_if_no_agreement,
     importance, responsible_user_id, due_date, linked_finding_id, linked_risk_id,
     confidentiality_level, created_by)
  values
    (v_tenant, p_project_id, v_num, p_title, p_clause_reference, coalesce(p_category, 'other'),
     p_own_position, p_counterparty_position, p_recommended_solution, p_risk_if_no_agreement,
     coalesce(p_importance, 'mittel'), p_responsible_user_id, p_due_date,
     p_linked_finding_id, p_linked_risk_id, v_level, v_caller)
  returning * into v_row;

  return v_row;
end $f$;
revoke execute on function public.create_spa_issue(uuid,text,text,text,text,text,text,text,text,uuid,date,uuid,uuid,public.ma_confidentiality_level) from public, anon;
grant execute on function public.create_spa_issue(uuid,text,text,text,text,text,text,text,text,uuid,date,uuid,uuid,public.ma_confidentiality_level) to authenticated;

-- ── 6. update_spa_issue ────────────────────────────────────────────────────
-- p_clear_* flags exist because coalesce() cannot distinguish "not supplied"
-- from "explicitly set to NULL" (dd_findings pattern).
create or replace function public.update_spa_issue(
  p_issue_id uuid,
  p_title text default null,
  p_clause_reference text default null,
  p_category text default null,
  p_own_position text default null,
  p_counterparty_position text default null,
  p_recommended_solution text default null,
  p_risk_if_no_agreement text default null,
  p_importance text default null,
  p_responsible_user_id uuid default null,
  p_clear_responsible boolean default false,
  p_due_date date default null,
  p_clear_due_date boolean default false,
  p_linked_finding_id uuid default null,
  p_clear_finding boolean default false,
  p_linked_risk_id uuid default null,
  p_clear_risk boolean default false,
  p_confidentiality_level public.ma_confidentiality_level default null
) returns public.spa_issues
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare
  v_caller uuid := auth.uid();
  v_i      public.spa_issues;
  v_row    public.spa_issues;
  v_target public.ma_confidentiality_level;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_i from public.spa_issues where id = p_issue_id;
  if not found then
    raise exception 'spa_issue not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_i.tenant_id)
          or public.is_project_lead(v_i.project_id)
          or public.has_project_role(v_i.project_id, 'editor')) then
    raise exception 'insufficient role to update spa_issue' using errcode = '42501';
  end if;

  -- Must be cleared for the CURRENT level (cannot edit what you may not read)
  -- and for the TARGET level (cannot escalate yourself out of the row).
  if not public.can_access_classified(v_i.project_id, v_i.confidentiality_level) then
    raise exception 'not cleared for this spa_issue' using errcode = '42501';
  end if;
  v_target := coalesce(p_confidentiality_level, v_i.confidentiality_level);
  if not public.can_access_classified(v_i.project_id, v_target) then
    raise exception 'not cleared for the target confidentiality level' using errcode = '42501';
  end if;

  if p_linked_finding_id is not null
     and not exists (select 1 from public.dd_findings
                      where id = p_linked_finding_id and project_id = v_i.project_id) then
    raise exception 'linked finding does not belong to this project' using errcode = '23514';
  end if;
  if p_linked_risk_id is not null
     and not exists (select 1 from public.risks
                      where id = p_linked_risk_id and project_id = v_i.project_id) then
    raise exception 'linked risk does not belong to this project' using errcode = '23514';
  end if;

  update public.spa_issues set
    title                 = coalesce(p_title, title),
    clause_reference      = coalesce(p_clause_reference, clause_reference),
    category              = coalesce(p_category, category),
    own_position          = coalesce(p_own_position, own_position),
    counterparty_position = coalesce(p_counterparty_position, counterparty_position),
    recommended_solution  = coalesce(p_recommended_solution, recommended_solution),
    risk_if_no_agreement  = coalesce(p_risk_if_no_agreement, risk_if_no_agreement),
    importance            = coalesce(p_importance, importance),
    responsible_user_id   = case when p_clear_responsible then null
                                 else coalesce(p_responsible_user_id, responsible_user_id) end,
    due_date              = case when p_clear_due_date then null
                                 else coalesce(p_due_date, due_date) end,
    linked_finding_id     = case when p_clear_finding then null
                                 else coalesce(p_linked_finding_id, linked_finding_id) end,
    linked_risk_id        = case when p_clear_risk then null
                                 else coalesce(p_linked_risk_id, linked_risk_id) end,
    confidentiality_level = v_target,
    updated_at            = now()
  where id = p_issue_id
  returning * into v_row;

  return v_row;
end $f$;
revoke execute on function public.update_spa_issue(uuid,text,text,text,text,text,text,text,text,uuid,boolean,date,boolean,uuid,boolean,uuid,boolean,public.ma_confidentiality_level) from public, anon;
grant execute on function public.update_spa_issue(uuid,text,text,text,text,text,text,text,text,uuid,boolean,date,boolean,uuid,boolean,uuid,boolean,public.ma_confidentiality_level) to authenticated;

-- ── 7. transition_spa_issue_status (house norm transition_*) ────────────────
-- Contract negotiation is genuinely non-linear (an "agreed" point can reopen
-- when a later round moves), so every target state is reachable. The RPC still
-- earns its place: it is the single audited, clearance-checked status path.
create or replace function public.transition_spa_issue_status(
  p_issue_id uuid,
  p_status text
) returns public.spa_issues
language plpgsql security definer set search_path = public, pg_temp
as $f$
declare
  v_caller uuid := auth.uid();
  v_i      public.spa_issues;
  v_row    public.spa_issues;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open','in_negotiation','agreed','escalated','closed') then
    raise exception 'invalid spa_issue status: %', p_status using errcode = '23514';
  end if;

  select * into v_i from public.spa_issues where id = p_issue_id;
  if not found then
    raise exception 'spa_issue not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_i.tenant_id)
          or public.is_project_lead(v_i.project_id)
          or public.has_project_role(v_i.project_id, 'editor')) then
    raise exception 'insufficient role to transition spa_issue' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_i.project_id, v_i.confidentiality_level) then
    raise exception 'not cleared for this spa_issue' using errcode = '42501';
  end if;

  update public.spa_issues set status = p_status, updated_at = now()
   where id = p_issue_id returning * into v_row;
  return v_row;
end $f$;
revoke execute on function public.transition_spa_issue_status(uuid,text) from public, anon;
grant execute on function public.transition_spa_issue_status(uuid,text) to authenticated;

-- ── 8. spa_issues_summary — SECURITY INVOKER (no aggregate-leak) ────────────
create or replace function public.spa_issues_summary(p_project_id uuid)
returns table (status text, issue_count bigint)
language sql stable security invoker set search_path = public, pg_temp
as $f$
  select i.status, count(*)::bigint
  from public.spa_issues i
  where i.project_id = p_project_id
  group by i.status;
$f$;
revoke execute on function public.spa_issues_summary(uuid) from public, anon;
grant execute on function public.spa_issues_summary(uuid) to authenticated;

-- ── 9. Stage-gate pre-read signal (AC-122-H1/H2) ───────────────────────────
-- Anchor-replace on the LIVE definition: parallel slices may have added their
-- own signals, and the 'mandatory_deliverables' placeholder belongs to a
-- PROJ-104 follow-up. `has_blocking_readiness` semantics stay UNCHANGED - the
-- spec asks for a hint, not a blocker, and the existing UI text bound to that
-- flag would otherwise become factually wrong.
--
-- The counter is gate-key independent on purpose: gate_key is copied per
-- project at seed time and may drift per tenant, so the UI (not SQL) decides
-- where to highlight it. Signing is gate_8; the spec's "Stage-Gate 6" is wrong
-- in both number and label (gate_6 = valuation/binding offer).
do $mig$
declare d text; d0 text;
begin
  select pg_get_functiondef('public.stage_gate_prereadiness(uuid)'::regprocedure) into d;
  if d is null then
    raise exception 'stage_gate_prereadiness not found - PROJ-110 must be applied first';
  end if;

  if position('open_spa_issues' in d) = 0 then
    d0 := d;

    -- (a) declare the new counter
    d := replace(d, 'v_open_red_flags integer := 0;',
                    'v_open_red_flags integer := 0;' || chr(10) ||
                    '  v_open_spa_issues integer := 0;');
    if d = d0 then raise exception 'prereadiness anchor (a) not found'; end if;

    -- (b) compute it right before the result is assembled. SECURITY INVOKER +
    --     RLS on spa_issues means non-cleared callers count 0 confidential rows.
    d0 := d;
    d := replace(d, '  return jsonb_build_object(',
                    '  select count(*) into v_open_spa_issues' || chr(10) ||
                    '    from public.spa_issues si' || chr(10) ||
                    '   where si.project_id = v_project' || chr(10) ||
                    '     and si.status in (''open'',''escalated'');' || chr(10) || chr(10) ||
                    '  return jsonb_build_object(');
    if d = d0 then raise exception 'prereadiness anchor (b) not found'; end if;

    -- (c) expose it, leaving mandatory_deliverables + has_blocking_readiness intact
    d0 := d;
    d := replace(d, '''mandatory_deliverables'', null,',
                    '''mandatory_deliverables'', null,' || chr(10) ||
                    '    ''open_spa_issues'', v_open_spa_issues,');
    if d = d0 then raise exception 'prereadiness anchor (c) not found'; end if;

    execute d;
  end if;
end $mig$;

-- CREATE OR REPLACE preserves privileges, but re-assert per AC-122-H2 so a
-- future drop/recreate in this chain cannot silently strip execution rights.
revoke execute on function public.stage_gate_prereadiness(uuid) from public, anon;
grant execute on function public.stage_gate_prereadiness(uuid) to authenticated;

-- ── 10. External document links: allow 'spa_issue' as a 5th parent type ─────
-- The clause reference is free text; the actual draft/redline lives in the data
-- room, so without a document link the feature stays half-finished (CIA Fork 6).
-- risk_links is deliberately NOT extended (redundant to linked_risk_id and it
-- opens an existence-inference channel - PROJ-Y-107b / PROJ-Y-122b).
-- NOTE (drift-proofing): this anchors on the trailing array terminator, NOT on
-- a specific member such as 'deliverable'. Parallel slices append their own
-- entity types (PROJ-120 added 'ma_valuation' to the LIVE constraint), so the
-- member list differs between prod and the schema-drift shadow DB, which
-- replays only the migrations present on this branch. The terminator is stable
-- in both, and reading the live def at apply time preserves sibling values.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'external_document_links_entity_type_check';
  if v_def is not null and v_def not like '%spa_issue%' then
    v_new := replace(v_def, '])))', ', ''spa_issue''::text])))');
    if v_new = v_def then
      raise exception 'unexpected external link entity_type check format: %', v_def;
    end if;
    execute 'alter table public.external_document_links drop constraint external_document_links_entity_type_check';
    execute 'alter table public.external_document_links add constraint external_document_links_entity_type_check ' || v_new;
  end if;
end $mig$;

do $mig$
declare d text; d0 text;
begin
  select pg_get_functiondef('public.external_link_parent_ctx(text,uuid)'::regprocedure) into d;
  if d is null then
    raise exception 'external_link_parent_ctx not found - PROJ-115 must be applied first';
  end if;
  if position('spa_issue' in d) = 0 then
    d0 := d;
    -- Whitespace-tolerant anchor: PROJ-115 stored the else-branch across two
    -- lines, PROJ-120 recreated the function with it on one line. Matching a
    -- literal would work in exactly one of prod / shadow-DB and fail in the
    -- other, so anchor on the else-branch regardless of its line breaks and
    -- re-emit it verbatim after the new when-branch.
    d := regexp_replace(d,
      '(\n\s*)else(\s+)project_id := null; level := null;',
      E'\\1when ''spa_issue'' then select s.project_id, s.confidentiality_level '
      || E'into project_id, level from public.spa_issues s where s.id = p_entity_id;'
      || E'\\1else\\2project_id := null; level := null;');
    if d = d0 then raise exception 'external_link_parent_ctx anchor not found'; end if;
    execute d;
  end if;
end $mig$;

revoke execute on function public.external_link_parent_ctx(text, uuid) from public, anon;
grant execute on function public.external_link_parent_ctx(text, uuid) to authenticated;

-- Polymorphic entity_id cannot carry an FK, so links are cleaned up on delete.
drop trigger if exists cleanup_external_links on public.spa_issues;
create trigger cleanup_external_links after delete on public.spa_issues
  for each row execute function public._cleanup_external_document_links('spa_issue');
