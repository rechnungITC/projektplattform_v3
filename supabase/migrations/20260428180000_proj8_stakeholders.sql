-- =============================================================================
-- PROJ-8: Stakeholders + suggestion dismissals
-- =============================================================================
-- Applied via Supabase MCP on 2026-04-28. Captured here for repo history.
--
-- Stakeholders are first-class business entities, not technical users (V2 ADR
-- stakeholder-vs-user.md). They live per-project with optional `linked_user_id`
-- when a stakeholder also has an account on the platform.
--
-- Class-3 (personal data) columns: name, contact_email, contact_phone,
-- linked_user_id, notes — flagged in column comments for the future PROJ-12
-- privacy registry.
--
-- RLS strategy:
--   read   = any project member
--   write  = project_editor OR project_lead OR tenant_admin
-- =============================================================================

-- Section 1: stakeholders table
create table public.stakeholders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  project_id      uuid not null,
  kind            text not null,
  origin          text not null,
  name            text not null,
  role_key        text,
  org_unit        text,
  contact_email   text,
  contact_phone   text,
  influence       text not null default 'medium',
  impact          text not null default 'medium',
  linked_user_id  uuid,
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint stakeholders_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint stakeholders_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint stakeholders_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint stakeholders_linked_user_fkey
    foreign key (linked_user_id) references auth.users(id) on delete set null,
  constraint stakeholders_kind_check check (kind in ('person','organization')),
  constraint stakeholders_origin_check check (origin in ('internal','external')),
  constraint stakeholders_influence_check check (influence in ('low','medium','high','critical')),
  constraint stakeholders_impact_check check (impact in ('low','medium','high','critical')),
  constraint stakeholders_name_length check (char_length(name) between 1 and 255),
  constraint stakeholders_role_key_length check (role_key is null or char_length(role_key) <= 100),
  constraint stakeholders_email_length check (contact_email is null or char_length(contact_email) <= 320),
  constraint stakeholders_notes_length check (notes is null or char_length(notes) <= 5000)
);

comment on column public.stakeholders.name is 'Class-3 (personal data). PROJ-12 privacy registry must redact on AI export.';
comment on column public.stakeholders.contact_email is 'Class-3 (personal data).';
comment on column public.stakeholders.contact_phone is 'Class-3 (personal data).';
comment on column public.stakeholders.linked_user_id is 'Class-3 (personal data).';
comment on column public.stakeholders.notes is 'Class-3 (personal data).';

create index stakeholders_project_active_idx
  on public.stakeholders (project_id, is_active);
create index stakeholders_project_role_idx
  on public.stakeholders (project_id, role_key)
  where is_active = true;
create index stakeholders_linked_user_idx
  on public.stakeholders (linked_user_id)
  where linked_user_id is not null;

alter table public.stakeholders enable row level security;

create policy "stakeholders_select_member"
  on public.stakeholders
  for select
  using (public.is_project_member(project_id));

create policy "stakeholders_insert_editor_or_lead_or_admin"
  on public.stakeholders
  for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "stakeholders_update_editor_or_lead_or_admin"
  on public.stakeholders
  for update
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

create policy "stakeholders_delete_lead_or_admin"
  on public.stakeholders
  for delete
  using (
    public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger stakeholders_set_updated_at
  before update on public.stakeholders
  for each row
  execute procedure extensions.moddatetime ('updated_at');

-- Section 2: stakeholder_suggestion_dismissals table
create table public.stakeholder_suggestion_dismissals (
  project_id     uuid not null,
  role_key       text not null,
  tenant_id      uuid not null,
  dismissed_by   uuid not null,
  dismissed_at   timestamptz not null default now(),
  primary key (project_id, role_key),
  constraint ssd_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ssd_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint ssd_dismissed_by_fkey
    foreign key (dismissed_by) references public.profiles(id) on delete cascade,
  constraint ssd_role_key_length check (char_length(role_key) between 1 and 100)
);

create index ssd_project_idx on public.stakeholder_suggestion_dismissals (project_id);

alter table public.stakeholder_suggestion_dismissals enable row level security;

create policy "ssd_select_member"
  on public.stakeholder_suggestion_dismissals
  for select
  using (public.is_project_member(project_id));

create policy "ssd_insert_editor_or_lead_or_admin"
  on public.stakeholder_suggestion_dismissals
  for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "ssd_delete_editor_or_lead_or_admin"
  on public.stakeholder_suggestion_dismissals
  for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );
