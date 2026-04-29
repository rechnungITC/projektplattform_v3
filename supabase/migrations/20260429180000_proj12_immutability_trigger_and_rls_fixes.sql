-- =============================================================================
-- PROJ-12 fix H1 + H2 + L1
-- =============================================================================
-- H1 — ki_runs has SELECT + INSERT but no UPDATE policy. The router's
--      "set final status / tokens / latency" UPDATE silently fails under
--      RLS. Add an UPDATE policy with the same predicate as INSERT.
--
-- H2 — ki_suggestions UPDATE policy is too permissive: a project editor
--      can flip status='accepted' → 'draft' and re-arm the accept-RPC,
--      producing duplicate risks from one suggestion. Two-pronged fix:
--        1. BEFORE-UPDATE trigger that pins terminal states (accepted,
--           rejected) and seals the immutable columns.
--        2. UNIQUE on ki_provenance.ki_suggestion_id as belt-and-suspenders
--           so the second accept-RPC call would fail at insert time even
--           if the trigger were ever bypassed.
--
-- L1 — accept_ki_suggestion_risk + convert_open_item_to_* (PROJ-20) check
--      state before authorization, so a non-member with a guessed UUID
--      learns the terminal state. Reorder: auth first, state second.
-- =============================================================================

-- H1: ki_runs UPDATE policy
create policy "ki_runs_update_editor_or_lead_or_admin"
  on public.ki_runs for update
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  )
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

-- H2 (trigger): ki_suggestions immutability
create or replace function public.enforce_ki_suggestion_immutability()
returns trigger
language plpgsql
as $$
begin
  if OLD.status in ('accepted', 'rejected') then
    raise exception
      'ki_suggestions in status % are sealed and cannot be updated', OLD.status
      using errcode = 'check_violation';
  end if;

  if NEW.tenant_id is distinct from OLD.tenant_id
     or NEW.project_id is distinct from OLD.project_id
     or NEW.ki_run_id is distinct from OLD.ki_run_id
     or NEW.purpose is distinct from OLD.purpose
     or NEW.original_payload is distinct from OLD.original_payload
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception
      'ki_suggestions: immutable columns cannot change'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.enforce_ki_suggestion_immutability() from public, anon, authenticated;

create trigger ki_suggestions_enforce_immutability
  before update on public.ki_suggestions
  for each row
  execute function public.enforce_ki_suggestion_immutability();

-- H2 (defense in depth): one provenance row per suggestion
alter table public.ki_provenance
  add constraint ki_provenance_suggestion_unique unique (ki_suggestion_id);

-- L1: reorder accept_ki_suggestion_risk to check auth before state
create or replace function public.accept_ki_suggestion_risk(p_suggestion_id uuid)
returns table(success boolean, message text, risk_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug public.ki_suggestions;
  v_actor uuid;
  v_new_id uuid;
  v_payload jsonb;
  v_title text;
  v_description text;
  v_probability smallint;
  v_impact smallint;
  v_status text;
  v_mitigation text;
begin
  select * into v_sug from public.ki_suggestions where id = p_suggestion_id;
  if not found then
    return query select false, 'suggestion_not_found', null::uuid;
    return;
  end if;
  if not (
    public.has_project_role(v_sug.project_id, 'editor')
    or public.is_project_lead(v_sug.project_id)
    or public.is_tenant_admin(v_sug.tenant_id)
  ) then
    return query select false, 'forbidden', null::uuid;
    return;
  end if;
  if v_sug.status <> 'draft' then
    return query select false, 'suggestion_not_draft', null::uuid;
    return;
  end if;
  if v_sug.purpose <> 'risks' then
    return query select false, 'wrong_purpose', null::uuid;
    return;
  end if;

  v_actor := auth.uid();
  v_payload := v_sug.payload;
  v_title := v_payload ->> 'title';
  v_description := v_payload ->> 'description';
  v_probability := (v_payload ->> 'probability')::smallint;
  v_impact := (v_payload ->> 'impact')::smallint;
  v_status := coalesce(v_payload ->> 'status', 'open');
  v_mitigation := v_payload ->> 'mitigation';

  if v_title is null or char_length(v_title) = 0 then
    return query select false, 'invalid_payload_title', null::uuid;
    return;
  end if;
  if v_probability is null or v_probability < 1 or v_probability > 5 then
    return query select false, 'invalid_payload_probability', null::uuid;
    return;
  end if;
  if v_impact is null or v_impact < 1 or v_impact > 5 then
    return query select false, 'invalid_payload_impact', null::uuid;
    return;
  end if;

  perform set_config('audit.change_reason', 'ki_acceptance', true);

  insert into public.risks (
    tenant_id, project_id, title, description, probability, impact,
    status, mitigation, created_by
  ) values (
    v_sug.tenant_id, v_sug.project_id, v_title, v_description,
    v_probability, v_impact, v_status, v_mitigation, v_actor
  )
  returning id into v_new_id;

  insert into public.ki_provenance (
    tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
  ) values (
    v_sug.tenant_id, 'risks', v_new_id, v_sug.id, v_sug.is_modified
  );

  update public.ki_suggestions
     set status = 'accepted',
         accepted_entity_type = 'risks',
         accepted_entity_id = v_new_id,
         accepted_at = now()
   where id = p_suggestion_id;

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  ) values (
    v_sug.tenant_id, 'risks', v_new_id, '_record',
    null, v_payload, v_actor, 'ki_acceptance'
  );

  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.accept_ki_suggestion_risk(uuid) from public;
grant execute on function public.accept_ki_suggestion_risk(uuid) to authenticated;

-- L1: same reorder for PROJ-20 convert RPCs
create or replace function public.convert_open_item_to_task(p_open_item_id uuid)
returns table(success boolean, message text, work_item_id uuid)
language plpgsql security definer set search_path = public
as $$
declare v_oi public.open_items; v_actor uuid; v_new_id uuid;
begin
  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then return query select false, 'open_item_not_found', null::uuid; return; end if;
  if not (public.has_project_role(v_oi.project_id, 'editor') or public.is_project_lead(v_oi.project_id) or public.is_tenant_admin(v_oi.tenant_id)) then
    return query select false, 'forbidden', null::uuid; return;
  end if;
  if v_oi.status = 'converted' then return query select false, 'already_converted', null::uuid; return; end if;
  v_actor := auth.uid();
  insert into public.work_items (tenant_id, project_id, kind, title, description, status, priority, created_by)
  values (v_oi.tenant_id, v_oi.project_id, 'task', v_oi.title, v_oi.description, 'todo', 'medium', v_actor)
  returning id into v_new_id;
  perform set_config('audit.change_reason', 'open_item_converted_to_task', true);
  update public.open_items set status = 'converted', converted_to_entity_type = 'work_items', converted_to_entity_id = v_new_id where id = p_open_item_id;
  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.convert_open_item_to_task(uuid) from public;
grant execute on function public.convert_open_item_to_task(uuid) to authenticated;

create or replace function public.convert_open_item_to_decision(
  p_open_item_id uuid, p_decision_text text, p_rationale text,
  p_decider_stakeholder uuid, p_context_phase_id uuid, p_context_risk_id uuid
)
returns table(success boolean, message text, decision_id uuid)
language plpgsql security definer set search_path = public
as $$
declare v_oi public.open_items; v_actor uuid; v_new_id uuid;
begin
  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then return query select false, 'open_item_not_found', null::uuid; return; end if;
  if not (public.has_project_role(v_oi.project_id, 'editor') or public.is_project_lead(v_oi.project_id) or public.is_tenant_admin(v_oi.tenant_id)) then
    return query select false, 'forbidden', null::uuid; return;
  end if;
  if v_oi.status = 'converted' then return query select false, 'already_converted', null::uuid; return; end if;
  v_actor := auth.uid();
  insert into public.decisions (tenant_id, project_id, title, decision_text, rationale, decided_at, decider_stakeholder_id, context_phase_id, context_risk_id, created_by)
  values (v_oi.tenant_id, v_oi.project_id, v_oi.title, p_decision_text, p_rationale, now(), p_decider_stakeholder, p_context_phase_id, p_context_risk_id, v_actor)
  returning id into v_new_id;
  perform set_config('audit.change_reason', 'open_item_converted_to_decision', true);
  update public.open_items set status = 'converted', converted_to_entity_type = 'decisions', converted_to_entity_id = v_new_id where id = p_open_item_id;
  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.convert_open_item_to_decision(uuid, text, text, uuid, uuid, uuid) from public;
grant execute on function public.convert_open_item_to_decision(uuid, text, text, uuid, uuid, uuid) to authenticated;
