-- =============================================================================
-- PROJ-13: Communication center + project chat
-- =============================================================================
-- communication_outbox    — one row per outgoing message / draft
-- project_chat_messages   — append-only internal chat per project
--
-- Both tenant- + project-scoped. Outbox status is a 5-state machine;
-- `suppressed` is its own terminal for Class-3 blocks (separate from
-- `failed` which is reserved for provider errors). Chat is append-only
-- in MVP (no edit/delete).
--
-- Audit whitelist + tracked-columns extended for outbox so status
-- transitions land in audit_log_entries.
--
-- Migration also activates the `communication` module for existing
-- tenants by appending it to tenant_settings.active_modules (idempotent).
-- =============================================================================

create table public.communication_outbox (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  channel         text not null,
  recipient       text not null,
  subject         text,
  body            text not null,
  metadata        jsonb not null default '{}'::jsonb,
  status          text not null default 'draft',
  error_detail    text,
  sent_at         timestamptz,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint communication_outbox_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint communication_outbox_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint communication_outbox_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint communication_outbox_channel_check
    check (channel in ('internal','email','slack','teams')),
  constraint communication_outbox_status_check
    check (status in ('draft','queued','sent','failed','suppressed')),
  constraint communication_outbox_recipient_length
    check (char_length(recipient) between 1 and 320),
  constraint communication_outbox_subject_length
    check (subject is null or char_length(subject) <= 255),
  constraint communication_outbox_body_length
    check (char_length(body) between 1 and 50000),
  constraint communication_outbox_error_detail_length
    check (error_detail is null or char_length(error_detail) <= 2000),
  constraint communication_outbox_sent_consistency
    check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null)),
  constraint communication_outbox_error_consistency
    check (
      (status in ('failed','suppressed') and error_detail is not null)
      or (status not in ('failed','suppressed') and error_detail is null)
    )
);

create index communication_outbox_project_status_idx
  on public.communication_outbox (project_id, status, created_at desc);
create index communication_outbox_project_channel_idx
  on public.communication_outbox (project_id, channel, created_at desc);

alter table public.communication_outbox enable row level security;

create policy "communication_outbox_select_member"
  on public.communication_outbox for select
  using (public.is_project_member(project_id));

create policy "communication_outbox_insert_editor_or_lead_or_admin"
  on public.communication_outbox for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "communication_outbox_update_editor_or_lead_or_admin"
  on public.communication_outbox for update
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

create policy "communication_outbox_delete_editor_or_lead_or_admin"
  on public.communication_outbox for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger communication_outbox_set_updated_at
  before update on public.communication_outbox
  for each row execute procedure extensions.moddatetime ('updated_at');

-- project_chat_messages
create table public.project_chat_messages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  project_id        uuid not null,
  sender_user_id    uuid,
  body              text not null,
  created_at        timestamptz not null default now(),
  constraint chat_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint chat_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint chat_sender_fkey
    foreign key (sender_user_id) references public.profiles(id) on delete set null,
  constraint chat_body_length
    check (char_length(body) between 1 and 4000)
);

create index project_chat_messages_project_idx
  on public.project_chat_messages (project_id, created_at desc);

alter table public.project_chat_messages enable row level security;

create policy "chat_select_member"
  on public.project_chat_messages for select
  using (public.is_project_member(project_id));

create policy "chat_insert_member"
  on public.project_chat_messages for insert
  with check (public.is_project_member(project_id));

-- No UPDATE/DELETE policies in MVP — append-only chat.

-- Audit whitelist extension
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings',
      'communication_outbox'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides']
    when 'communication_outbox' then array['status','error_detail','sent_at']
    else array[]::text[]
  end
$$;

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
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

create trigger audit_changes_communication_outbox
  after update on public.communication_outbox
  for each row execute function public.record_audit_changes();

-- Activate the `communication` module for all existing tenants by appending
-- it to active_modules where it isn't already present. Idempotent.
update public.tenant_settings
   set active_modules = active_modules || '"communication"'::jsonb
 where not (active_modules @> '"communication"'::jsonb);
