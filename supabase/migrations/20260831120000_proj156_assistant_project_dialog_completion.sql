-- =============================================================================
-- PROJ-156: Atomic and retry-safe completion of a conversational project draft
-- =============================================================================
-- The function is SECURITY INVOKER so the existing owner-only RLS policies on
-- assistant_sessions and project_wizard_drafts remain authoritative.

create or replace function public.complete_assistant_project_dialog(
  p_session_id uuid,
  p_expected_revision integer,
  p_completion_key uuid,
  p_modality text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.assistant_sessions%rowtype;
  v_dialog jsonb;
  v_slots jsonb;
  v_completion jsonb;
  v_draft public.project_wizard_drafts%rowtype;
  v_name text;
  v_description text;
  v_project_type text;
  v_project_method text;
  v_turn public.assistant_turns%rowtype;
  v_tools jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select s.*
    into v_session
    from public.assistant_sessions s
   where s.id = p_session_id
     and s.user_id = v_actor
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'assistant session not found';
  end if;

  v_completion := v_session.context->'dialog_completion';
  if v_completion->>'completion_key' = p_completion_key::text then
    select d.*
      into v_draft
      from public.project_wizard_drafts d
     where d.id = (v_completion->>'wizard_draft_id')::uuid
       and d.created_by = v_actor;
    if not found then
      raise exception using errcode = 'P0002', message = 'completed wizard draft not found';
    end if;
    return jsonb_build_object(
      'id', v_draft.id,
      'name', v_draft.name,
      'turn_id', v_completion->>'turn_id',
      'turn_created_at', v_completion->>'turn_created_at'
    );
  elsif v_completion is not null then
    raise exception using errcode = '40001', message = 'assistant dialog was already completed';
  end if;

  v_dialog := v_session.context->'dialog_state';
  if v_dialog is null
     or v_dialog->>'pending_intent' <> 'project_create_draft'
     or v_dialog->>'phase' <> 'reviewing'
     or coalesce((v_dialog->>'schema_version')::integer, 0) <> 1
     or coalesce((v_dialog->>'revision')::integer, -1) <> p_expected_revision then
    raise exception using errcode = '40001', message = 'assistant dialog state conflict';
  end if;

  if (v_dialog->>'expires_at')::timestamptz <= now() then
    raise exception using errcode = 'P0001', message = 'assistant dialog expired';
  end if;

  v_slots := v_dialog->'slots';
  v_name := nullif(btrim(v_slots->>'name'), '');
  v_description := nullif(btrim(v_slots->>'description'), '');
  v_project_type := nullif(v_slots->>'project_type', '');
  v_project_method := nullif(v_slots->>'project_method', '');

  if v_name is null or char_length(v_name) > 255 then
    raise exception using errcode = '22023', message = 'a valid project name is required';
  end if;
  if v_description is not null and char_length(v_description) > 5000 then
    raise exception using errcode = '22023', message = 'project description is too long';
  end if;
  if v_project_type is not null
     and v_project_type not in ('erp', 'construction', 'software', 'general', 'ma') then
    raise exception using errcode = '22023', message = 'invalid project type';
  end if;
  if v_project_method is not null
     and v_project_method not in ('scrum', 'kanban', 'safe', 'waterfall', 'pmi', 'prince2', 'vxt2') then
    raise exception using errcode = '22023', message = 'invalid project method';
  end if;
  if p_modality not in ('text', 'voice') then
    raise exception using errcode = '22023', message = 'invalid modality';
  end if;

  insert into public.project_wizard_drafts (
    tenant_id,
    created_by,
    name,
    project_type,
    project_method,
    data
  ) values (
    v_session.tenant_id,
    v_actor,
    v_name,
    v_project_type,
    v_project_method,
    jsonb_build_object(
      'name', v_name,
      'description', coalesce(v_description, ''),
      'project_number', '',
      'planned_start_date', null,
      'planned_end_date', null,
      'responsible_user_id', v_actor,
      'project_type', v_project_type,
      'project_method', v_project_method,
      'type_specific_data', '{}'::jsonb
    )
  )
  returning * into v_draft;

  v_tools := jsonb_build_array(jsonb_build_object(
    'key', 'wizard_draft.create',
    'label', 'Wizard-Entwurf anlegen',
    'status', 'executed'
  ));

  insert into public.assistant_turns (
    session_id, tenant_id, user_id, project_id, modality, input_text,
    input_redacted, recognized_intent, confirmation_state, result_status,
    tool_calls, response_text, route_target, wizard_draft_id
  ) values (
    v_session.id, v_session.tenant_id, v_actor, null, p_modality, null,
    false, 'project_create_draft', 'confirmed', 'success', v_tools,
    null,
    jsonb_build_object(
      'href', '/projects/new/wizard?draftId=' || v_draft.id::text,
      'label', 'Entwurf prüfen'
    ),
    v_draft.id
  ) returning * into v_turn;

  insert into public.assistant_action_events (
    tenant_id, session_id, turn_id, user_id, project_id,
    recognized_intent, action_key, confirmation_state, executed_tools,
    result_status
  ) values (
    v_session.tenant_id, v_session.id, v_turn.id, v_actor, null,
    'project_create_draft', 'wizard_draft.create', 'confirmed', v_tools,
    'success'
  );

  v_completion := jsonb_build_object(
    'intent', 'project_create_draft',
    'completion_key', p_completion_key,
    'revision', p_expected_revision,
    'wizard_draft_id', v_draft.id,
    'wizard_draft_name', v_draft.name,
    'turn_id', v_turn.id,
    'turn_created_at', v_turn.created_at
  );

  update public.assistant_sessions
     set context = (context - 'dialog_state') || jsonb_build_object(
           'dialog_completion', v_completion
         ),
         last_turn_at = now(),
         last_intent = 'project_create_draft'
   where id = p_session_id
     and user_id = v_actor;

  return jsonb_build_object(
    'id', v_draft.id,
    'name', v_draft.name,
    'turn_id', v_turn.id,
    'turn_created_at', v_turn.created_at
  );
end;
$$;

revoke all on function public.complete_assistant_project_dialog(uuid, integer, uuid, text) from public;
revoke all on function public.complete_assistant_project_dialog(uuid, integer, uuid, text) from anon;
grant execute on function public.complete_assistant_project_dialog(uuid, integer, uuid, text) to authenticated;

comment on function public.complete_assistant_project_dialog(uuid, integer, uuid, text) is
  'PROJ-156: atomically creates one owner-scoped Wizard draft, closes the reviewed dialog, and persists its turn/action audit; retries use completion_key.';

create or replace function public.complete_assistant_work_item_dialog(
  p_session_id uuid,
  p_expected_revision integer,
  p_project_id uuid,
  p_requested_kind text,
  p_target_kind text,
  p_title text,
  p_description text,
  p_source_modality text,
  p_kind_was_mapped boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.assistant_sessions%rowtype;
  v_dialog jsonb;
  v_project public.projects%rowtype;
  v_draft public.assistant_work_item_drafts%rowtype;
  v_turn public.assistant_turns%rowtype;
  v_tools jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select s.* into v_session
    from public.assistant_sessions s
   where s.id = p_session_id
     and s.user_id = v_actor
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'assistant session not found';
  end if;

  v_dialog := v_session.context->'dialog_state';
  if v_dialog is null
     or v_dialog->>'pending_intent' <> 'work_item_create_draft'
     or coalesce((v_dialog->>'schema_version')::integer, 0) <> 1
     or coalesce((v_dialog->>'revision')::integer, -1) <> p_expected_revision then
    raise exception using errcode = '40001', message = 'assistant dialog state conflict';
  end if;
  if (v_dialog->>'expires_at')::timestamptz <= now() then
    raise exception using errcode = 'P0001', message = 'assistant dialog expired';
  end if;

  select p.* into v_project
    from public.projects p
   where p.id = p_project_id
     and p.tenant_id = v_session.tenant_id
     and not p.is_deleted;
  if not found then
    raise exception using errcode = 'P0002', message = 'project not found';
  end if;
  if not (
    public.is_tenant_admin(v_session.tenant_id)
    or public.has_project_role(p_project_id, 'lead')
    or public.has_project_role(p_project_id, 'editor')
  ) then
    raise exception using errcode = '42501', message = 'project write access required';
  end if;

  if p_requested_kind not in ('epic','feature','story','task','subtask','bug','work_package')
     or p_target_kind not in ('epic','feature','story','task','subtask','bug','work_package')
     or nullif(btrim(p_title), '') is null
     or char_length(p_title) > 255
     or (p_description is not null and char_length(p_description) > 10000)
     or p_source_modality not in ('text', 'voice') then
    raise exception using errcode = '22023', message = 'invalid work item draft payload';
  end if;
  if v_dialog->'slots'->>'requested_kind' <> p_requested_kind
     or (
       nullif(v_dialog->'slots'->>'title', '') is not null
       and nullif(v_dialog->'slots'->>'title', '') is distinct from nullif(p_title, '')
     )
     or (
       nullif(v_dialog->'slots'->>'project_id', '') is not null
       and (v_dialog->'slots'->>'project_id')::uuid <> p_project_id
     )
     or (
       jsonb_array_length(coalesce(v_dialog->'candidate_project_ids', '[]'::jsonb)) > 0
       and not (v_dialog->'candidate_project_ids' ? p_project_id::text)
     ) then
    raise exception using errcode = '40001', message = 'assistant dialog payload conflict';
  end if;

  insert into public.assistant_work_item_drafts (
    tenant_id, user_id, project_id, requested_kind, target_kind, title,
    description, source_transcript, source_modality
  ) values (
    v_session.tenant_id, v_actor, p_project_id, p_requested_kind,
    p_target_kind, p_title, p_description, null,
    p_source_modality
  ) returning * into v_draft;

  v_tools := jsonb_build_array(jsonb_build_object(
    'key', 'work_item_draft.create',
    'label', 'Sprach-Entwurf anlegen',
    'status', 'executed',
    'metadata', jsonb_build_object(
      'draft_id', v_draft.id,
      'requested_kind', p_requested_kind,
      'target_kind', p_target_kind,
      'kind_was_mapped', p_kind_was_mapped
    )
  ));

  insert into public.assistant_turns (
    session_id, tenant_id, user_id, project_id, modality, input_text,
    input_redacted, recognized_intent, confirmation_state, result_status,
    tool_calls, response_text
  ) values (
    v_session.id, v_session.tenant_id, v_actor, p_project_id,
    p_source_modality, null, false,
    'work_item_create_draft', 'required', 'success', v_tools, null
  ) returning * into v_turn;

  insert into public.assistant_action_events (
    tenant_id, session_id, turn_id, user_id, project_id,
    recognized_intent, action_key, confirmation_state, executed_tools,
    result_status
  ) values (
    v_session.tenant_id, v_session.id, v_turn.id, v_actor, p_project_id,
    'work_item_create_draft', 'work_item_draft.create', 'required', v_tools,
    'success'
  );

  update public.assistant_sessions
     set project_id = p_project_id,
         context = context - 'dialog_state',
         last_turn_at = now(),
         last_intent = 'work_item_create_draft'
   where id = v_session.id
     and user_id = v_actor;

  return jsonb_build_object(
    'id', v_draft.id,
    'title', v_draft.title,
    'description', v_draft.description,
    'target_kind', v_draft.target_kind,
    'requested_kind', v_draft.requested_kind,
    'turn_id', v_turn.id,
    'turn_created_at', v_turn.created_at
  );
end;
$$;

revoke all on function public.complete_assistant_work_item_dialog(uuid, integer, uuid, text, text, text, text, text, boolean) from public;
revoke all on function public.complete_assistant_work_item_dialog(uuid, integer, uuid, text, text, text, text, text, boolean) from anon;
grant execute on function public.complete_assistant_work_item_dialog(uuid, integer, uuid, text, text, text, text, text, boolean) to authenticated;

comment on function public.complete_assistant_work_item_dialog(uuid, integer, uuid, text, text, text, text, text, boolean) is
  'PROJ-156: atomically claims one Work-Item dialog revision, creates its private PROJ-144 draft, clears temporary slots, and writes turn/action audit.';

create or replace function public.clear_assistant_dialog_state(
  p_session_id uuid default null,
  p_reason text default 'context_changed'
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session record;
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_reason not in ('expired', 'context_changed', 'logout') then
    raise exception using errcode = '22023', message = 'invalid cleanup reason';
  end if;

  for v_session in
    select s.id, s.tenant_id, s.project_id, s.context
      from public.assistant_sessions s
     where s.user_id = v_actor
       and s.context ? 'dialog_state'
       and (p_session_id is null or s.id = p_session_id)
     for update
  loop
    update public.assistant_sessions
       set context = context - 'dialog_state',
           last_turn_at = now()
     where id = v_session.id
       and user_id = v_actor;

    insert into public.assistant_action_events (
      tenant_id, session_id, turn_id, user_id, project_id,
      recognized_intent, action_key, confirmation_state, executed_tools,
      result_status
    ) values (
      v_session.tenant_id, v_session.id, null, v_actor, v_session.project_id,
      coalesce(v_session.context->'dialog_state'->>'pending_intent', 'unknown'),
      'dialog.' || p_reason,
      case when p_reason = 'logout' then 'cancelled' else 'not_required' end,
      jsonb_build_array(jsonb_build_object(
        'key', 'dialog.' || p_reason,
        'label', 'Dialogzustand bereinigen',
        'status', 'executed'
      )),
      'success'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.clear_assistant_dialog_state(uuid, text) from public;
revoke all on function public.clear_assistant_dialog_state(uuid, text) from anon;
grant execute on function public.clear_assistant_dialog_state(uuid, text) to authenticated;

comment on function public.clear_assistant_dialog_state(uuid, text) is
  'PROJ-156: removes temporary dialog slots on expiry, tenant/context change, or logout and records a metadata-only action event.';
