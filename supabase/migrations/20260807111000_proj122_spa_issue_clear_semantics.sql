-- =============================================================================
-- PROJ-122 — fix: optional text fields could not be cleared
-- =============================================================================
-- Defect found while re-reading the update path before /qa.
--
-- update_spa_issue used `coalesce(p_x, x)` for every optional text column, so
-- NULL always meant "not supplied". The UI sends NULL for an emptied input,
-- which meant a user could never clear "Klauselbezug", "Eigene Position",
-- "Gegenposition", "Empfohlene Lösung" or "Risiko bei Nichteinigung" — the old
-- text silently survived the save, and the form re-opened showing stale
-- content the user believed they had deleted. On a negotiation record that is
-- actively misleading: a withdrawn position would keep reading as current.
--
-- The structured columns already had explicit p_clear_* flags for exactly this
-- reason; the free-text ones were missed. Rather than add five more boolean
-- parameters, this adopts an unambiguous sentinel for text columns:
--
--     NULL         -> not supplied, keep the current value
--     '' (empty)   -> explicit clear, store NULL
--
-- Empty string carries no meaning for any of these fields, so it is free to
-- use as the clear signal. create_spa_issue normalises '' to NULL on the way
-- in as well, so the table never stores an empty string.
--
-- Both functions are replaced in full (they are ours alone; no parallel slice
-- touches them), and the signatures are unchanged, so no grant is affected.
-- =============================================================================

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

  if not public.can_access_classified(p_project_id, v_level) then
    raise exception 'not cleared for this confidentiality level' using errcode = '42501';
  end if;

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

  perform pg_advisory_xact_lock(hashtextextended('spa_issues:' || p_project_id::text, 0));
  select coalesce(max(issue_number), 0) + 1 into v_num
    from public.spa_issues where project_id = p_project_id;

  insert into public.spa_issues
    (tenant_id, project_id, issue_number, title, clause_reference, category,
     own_position, counterparty_position, recommended_solution, risk_if_no_agreement,
     importance, responsible_user_id, due_date, linked_finding_id, linked_risk_id,
     confidentiality_level, created_by)
  values
    (v_tenant, p_project_id, v_num, p_title,
     nullif(btrim(p_clause_reference), ''), coalesce(p_category, 'other'),
     nullif(btrim(p_own_position), ''), nullif(btrim(p_counterparty_position), ''),
     nullif(btrim(p_recommended_solution), ''), nullif(btrim(p_risk_if_no_agreement), ''),
     coalesce(p_importance, 'mittel'), p_responsible_user_id, p_due_date,
     p_linked_finding_id, p_linked_risk_id, v_level, v_caller)
  returning * into v_row;

  return v_row;
end $f$;

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
    title                 = coalesce(nullif(btrim(p_title), ''), title),
    -- '' clears, NULL keeps (see header).
    clause_reference      = case when p_clause_reference = '' then null
                                 else coalesce(p_clause_reference, clause_reference) end,
    category              = coalesce(p_category, category),
    own_position          = case when p_own_position = '' then null
                                 else coalesce(p_own_position, own_position) end,
    counterparty_position = case when p_counterparty_position = '' then null
                                 else coalesce(p_counterparty_position, counterparty_position) end,
    recommended_solution  = case when p_recommended_solution = '' then null
                                 else coalesce(p_recommended_solution, recommended_solution) end,
    risk_if_no_agreement  = case when p_risk_if_no_agreement = '' then null
                                 else coalesce(p_risk_if_no_agreement, risk_if_no_agreement) end,
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
