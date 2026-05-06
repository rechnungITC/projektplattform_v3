-- =============================================================================
-- Security hardening — convert_open_item_to_* + accept_ki_suggestion_risk
-- accept p_actor_user_id, drop their dependence on auth.uid()-bound
-- helpers, and become safely callable from the service-role admin client.
-- =============================================================================
-- Same pattern as state-machine refactor (20260506190000):
--   - add `p_actor_user_id uuid default null` (positioned last)
--   - resolve caller as `coalesce(p_actor_user_id, auth.uid())`
--   - replace `has_project_role / is_project_lead / is_tenant_admin` calls
--     with direct `tenant_memberships` / `project_memberships` lookups
--     against the resolved caller id
--
-- Functions covered:
--   - convert_open_item_to_decision(... + p_actor_user_id)
--     RETURNS (success, message, decision_id)
--   - convert_open_item_to_task(p_open_item_id, p_actor_user_id)
--     RETURNS (success, message, work_item_id)
--   - accept_ki_suggestion_risk(p_suggestion_id, p_actor_user_id)
--     RETURNS (success, message, risk_id)
--
-- DROP+CREATE because the parameter list changes (Postgres treats it as
-- a different function identity); the column names in RETURNS TABLE are
-- preserved verbatim so existing route code that reads `result.decision_id`
-- / `result.work_item_id` / `result.risk_id` keeps working.
--
-- A companion migration revokes EXECUTE from `authenticated` once the
-- route callers are switched.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- convert_open_item_to_decision
-- ---------------------------------------------------------------------------
drop function if exists public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid
);

create or replace function public.convert_open_item_to_decision(
  p_open_item_id        uuid,
  p_decision_text       text,
  p_rationale           text,
  p_decider_stakeholder uuid,
  p_context_phase_id    uuid,
  p_context_risk_id     uuid,
  p_actor_user_id       uuid default null
)
returns table (success boolean, message text, decision_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_oi      public.open_items;
  v_actor   uuid;
  v_new_id  uuid;
  v_authz   boolean;
begin
  v_actor := coalesce(p_actor_user_id, auth.uid());
  if v_actor is null then
    return query select false, 'authentication required'::text, null::uuid;
    return;
  end if;

  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then
    return query select false, 'open_item_not_found'::text, null::uuid;
    return;
  end if;

  v_authz := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_oi.tenant_id and user_id = v_actor and role = 'admin'
  ) or exists (
    select 1 from public.project_memberships
    where project_id = v_oi.project_id and user_id = v_actor
      and project_role in ('lead','editor')
  );
  if not v_authz then
    return query select false, 'forbidden'::text, null::uuid;
    return;
  end if;

  if v_oi.status = 'converted' then
    return query select false, 'already_converted'::text, null::uuid;
    return;
  end if;

  insert into public.decisions (
    tenant_id, project_id, title, decision_text, rationale, decided_at,
    decider_stakeholder_id, context_phase_id, context_risk_id, created_by
  ) values (
    v_oi.tenant_id, v_oi.project_id, v_oi.title, p_decision_text, p_rationale,
    now(), p_decider_stakeholder, p_context_phase_id, p_context_risk_id, v_actor
  )
  returning id into v_new_id;

  perform set_config('audit.change_reason', 'open_item_converted_to_decision', true);
  update public.open_items
     set status = 'converted',
         converted_to_entity_type = 'decisions',
         converted_to_entity_id = v_new_id
   where id = p_open_item_id;

  return query select true, 'ok'::text, v_new_id;
end;
$func$;


-- ---------------------------------------------------------------------------
-- convert_open_item_to_task
-- ---------------------------------------------------------------------------
drop function if exists public.convert_open_item_to_task(uuid);

create or replace function public.convert_open_item_to_task(
  p_open_item_id  uuid,
  p_actor_user_id uuid default null
)
returns table (success boolean, message text, work_item_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_oi      public.open_items;
  v_actor   uuid;
  v_new_id  uuid;
  v_authz   boolean;
begin
  v_actor := coalesce(p_actor_user_id, auth.uid());
  if v_actor is null then
    return query select false, 'authentication required'::text, null::uuid;
    return;
  end if;

  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then
    return query select false, 'open_item_not_found'::text, null::uuid;
    return;
  end if;

  v_authz := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_oi.tenant_id and user_id = v_actor and role = 'admin'
  ) or exists (
    select 1 from public.project_memberships
    where project_id = v_oi.project_id and user_id = v_actor
      and project_role in ('lead','editor')
  );
  if not v_authz then
    return query select false, 'forbidden'::text, null::uuid;
    return;
  end if;

  if v_oi.status = 'converted' then
    return query select false, 'already_converted'::text, null::uuid;
    return;
  end if;

  insert into public.work_items (
    tenant_id, project_id, kind, title, description, status, priority, created_by
  ) values (
    v_oi.tenant_id, v_oi.project_id, 'task', v_oi.title, v_oi.description,
    'todo', 'medium', v_actor
  )
  returning id into v_new_id;

  perform set_config('audit.change_reason', 'open_item_converted_to_task', true);
  update public.open_items
     set status = 'converted',
         converted_to_entity_type = 'work_items',
         converted_to_entity_id = v_new_id
   where id = p_open_item_id;

  return query select true, 'ok'::text, v_new_id;
end;
$func$;


-- ---------------------------------------------------------------------------
-- accept_ki_suggestion_risk
-- ---------------------------------------------------------------------------
drop function if exists public.accept_ki_suggestion_risk(uuid);

create or replace function public.accept_ki_suggestion_risk(
  p_suggestion_id uuid,
  p_actor_user_id uuid default null
)
returns table (success boolean, message text, risk_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_sug         public.ki_suggestions;
  v_actor       uuid;
  v_new_id      uuid;
  v_payload     jsonb;
  v_title       text;
  v_description text;
  v_probability smallint;
  v_impact      smallint;
  v_status      text;
  v_mitigation  text;
  v_authz       boolean;
begin
  v_actor := coalesce(p_actor_user_id, auth.uid());
  if v_actor is null then
    return query select false, 'authentication required'::text, null::uuid;
    return;
  end if;

  select * into v_sug from public.ki_suggestions where id = p_suggestion_id;
  if not found then
    return query select false, 'suggestion_not_found'::text, null::uuid;
    return;
  end if;

  v_authz := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_sug.tenant_id and user_id = v_actor and role = 'admin'
  ) or exists (
    select 1 from public.project_memberships
    where project_id = v_sug.project_id and user_id = v_actor
      and project_role in ('lead','editor')
  );
  if not v_authz then
    return query select false, 'forbidden'::text, null::uuid;
    return;
  end if;

  if v_sug.status <> 'draft' then
    return query select false, 'suggestion_not_draft'::text, null::uuid;
    return;
  end if;
  if v_sug.purpose <> 'risks' then
    return query select false, 'wrong_purpose'::text, null::uuid;
    return;
  end if;

  v_payload     := v_sug.payload;
  v_title       := v_payload ->> 'title';
  v_description := v_payload ->> 'description';
  v_probability := (v_payload ->> 'probability')::smallint;
  v_impact      := (v_payload ->> 'impact')::smallint;
  v_status      := coalesce(v_payload ->> 'status', 'open');
  v_mitigation  := v_payload ->> 'mitigation';

  if v_title is null or char_length(v_title) = 0 then
    return query select false, 'invalid_payload_title'::text, null::uuid;
    return;
  end if;
  if v_probability is null or v_probability < 1 or v_probability > 5 then
    return query select false, 'invalid_payload_probability'::text, null::uuid;
    return;
  end if;
  if v_impact is null or v_impact < 1 or v_impact > 5 then
    return query select false, 'invalid_payload_impact'::text, null::uuid;
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

  return query select true, 'ok'::text, v_new_id;
end;
$func$;


-- ---------------------------------------------------------------------------
-- Re-grant EXECUTE so existing callers keep working until route-side switch.
-- ---------------------------------------------------------------------------
grant execute on function public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid, uuid
) to authenticated;
grant execute on function public.convert_open_item_to_task(uuid, uuid)
  to authenticated;
grant execute on function public.accept_ki_suggestion_risk(uuid, uuid)
  to authenticated;
