-- =============================================================================
-- PROJ-18: Compliance Automatik & Process Templates (Plumbing slice)
-- =============================================================================
-- Architecture decisions locked in /architecture as A-A-B:
--   * Trigger Service as TypeScript module (not Postgres trigger / Edge Fn)
--   * Templates as TS constants (not Markdown files / DB-stored defaults)
--   * Scope: ST-01 + ST-02 + ST-03-minimal + ST-04 + ST-05; ST-06 deferred
--
-- Four new tables:
--   compliance_tags         — tenant-scoped registry of known tags
--   work_item_tags          — n:m work_items × compliance_tags
--   compliance_trigger_log  — idempotency keys for trigger fires
--   work_item_documents     — inline body + checklist for compliance forms
--
-- Plus: seed 7 platform-default tags for every existing tenant.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- compliance_tags — tenant-scoped registry
-- ---------------------------------------------------------------------------
create table public.compliance_tags (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  key                   text not null,
  display_name          text not null,
  description           text,
  is_active             boolean not null default true,
  default_child_kinds   text[] not null default array[]::text[],
  template_keys         text[] not null default array[]::text[],
  is_platform_default   boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint compliance_tags_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint compliance_tags_key_format
    check (key ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint compliance_tags_display_name_length
    check (char_length(display_name) between 1 and 200),
  constraint compliance_tags_description_length
    check (description is null or char_length(description) <= 2000)
);

create unique index compliance_tags_tenant_key_unique
  on public.compliance_tags (tenant_id, key);

create index compliance_tags_tenant_active_idx
  on public.compliance_tags (tenant_id, is_active);

alter table public.compliance_tags enable row level security;

create policy "compliance_tags_select_member"
  on public.compliance_tags for select
  using (public.is_tenant_member(tenant_id));

create policy "compliance_tags_update_admin"
  on public.compliance_tags for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- INSERT/DELETE deliberately not exposed in v1 — defaults are code-only,
-- platform-defaults are seeded via migration. Custom tags become a
-- follow-up slice.

create trigger compliance_tags_set_updated_at
  before update on public.compliance_tags
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- work_item_tags — n:m
-- ---------------------------------------------------------------------------
create table public.work_item_tags (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  work_item_id    uuid not null,
  tag_id          uuid not null,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  constraint wit_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint wit_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint wit_tag_fkey
    foreign key (tag_id) references public.compliance_tags(id) on delete cascade,
  constraint wit_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict
);

create unique index wit_work_item_tag_unique
  on public.work_item_tags (work_item_id, tag_id);

create index wit_work_item_idx
  on public.work_item_tags (work_item_id);

create index wit_tag_idx
  on public.work_item_tags (tag_id);

alter table public.work_item_tags enable row level security;

-- We need to pull the project_id from the work_item to gate via project
-- membership. Defense in depth: even if the caller has a tenant role,
-- they only see/write tags on work items they're a project member of.

create policy "wit_select_project_member"
  on public.work_item_tags for select
  using (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_tags.work_item_id
        and public.is_project_member(wi.project_id)
    )
  );

create policy "wit_insert_project_editor_or_lead_or_admin"
  on public.work_item_tags for insert
  with check (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_tags.work_item_id
        and (
          public.has_project_role(wi.project_id, 'editor')
          or public.is_project_lead(wi.project_id)
          or public.is_tenant_admin(work_item_tags.tenant_id)
        )
    )
  );

create policy "wit_delete_project_editor_or_lead_or_admin"
  on public.work_item_tags for delete
  using (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_tags.work_item_id
        and (
          public.has_project_role(wi.project_id, 'editor')
          or public.is_project_lead(wi.project_id)
          or public.is_tenant_admin(work_item_tags.tenant_id)
        )
    )
  );


-- ---------------------------------------------------------------------------
-- compliance_trigger_log — idempotency keys
-- ---------------------------------------------------------------------------
-- Every fire records (work_item_id, tag_id, phase). UNIQUE prevents
-- double-firing the same (item, tag, phase) combination across retries
-- or race conditions.
-- ---------------------------------------------------------------------------
create table public.compliance_trigger_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  work_item_id    uuid not null,
  tag_id          uuid not null,
  phase           text not null,
  fired_at        timestamptz not null default now(),
  constraint ctl_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ctl_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint ctl_tag_fkey
    foreign key (tag_id) references public.compliance_tags(id) on delete cascade,
  constraint ctl_phase_check
    check (phase in ('created','in_progress','done'))
);

create unique index ctl_unique_per_phase
  on public.compliance_trigger_log (work_item_id, tag_id, phase);

create index ctl_work_item_idx
  on public.compliance_trigger_log (work_item_id);

alter table public.compliance_trigger_log enable row level security;

-- Reads are project-scoped (so the UI can show fire history for
-- a work item). Writes are NOT exposed — the trigger service in
-- TypeScript runs in the same txn as the work-item INSERT/UPDATE
-- under the editor's session, and the UNIQUE constraint provides
-- the idempotency guarantee. Service-role writes via the API
-- routes server-context bypass RLS naturally.

create policy "ctl_select_project_member"
  on public.compliance_trigger_log for select
  using (
    exists (
      select 1 from public.work_items wi
      where wi.id = compliance_trigger_log.work_item_id
        and public.is_project_member(wi.project_id)
    )
  );

create policy "ctl_insert_project_editor_or_lead_or_admin"
  on public.compliance_trigger_log for insert
  with check (
    exists (
      select 1 from public.work_items wi
      where wi.id = compliance_trigger_log.work_item_id
        and (
          public.has_project_role(wi.project_id, 'editor')
          or public.is_project_lead(wi.project_id)
          or public.is_tenant_admin(compliance_trigger_log.tenant_id)
        )
    )
  );


-- ---------------------------------------------------------------------------
-- work_item_documents — inline body + checklist (compliance form output)
-- ---------------------------------------------------------------------------
create table public.work_item_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  work_item_id    uuid not null,
  kind            text not null,
  title           text not null,
  body            text not null default '',
  checklist       jsonb not null default '[]'::jsonb,
  version         int not null default 1,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint wid_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint wid_work_item_fkey
    foreign key (work_item_id) references public.work_items(id) on delete cascade,
  constraint wid_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint wid_kind_check
    check (kind in ('compliance-form','manual-attachment')),
  constraint wid_title_length
    check (char_length(title) between 1 and 200),
  constraint wid_body_length
    check (char_length(body) <= 50000),
  constraint wid_version_positive
    check (version >= 1)
);

create index wid_work_item_idx
  on public.work_item_documents (work_item_id, created_at desc);

alter table public.work_item_documents enable row level security;

create policy "wid_select_project_member"
  on public.work_item_documents for select
  using (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_documents.work_item_id
        and public.is_project_member(wi.project_id)
    )
  );

create policy "wid_write_project_editor_or_lead_or_admin"
  on public.work_item_documents for all
  using (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_documents.work_item_id
        and (
          public.has_project_role(wi.project_id, 'editor')
          or public.is_project_lead(wi.project_id)
          or public.is_tenant_admin(work_item_documents.tenant_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_documents.work_item_id
        and (
          public.has_project_role(wi.project_id, 'editor')
          or public.is_project_lead(wi.project_id)
          or public.is_tenant_admin(work_item_documents.tenant_id)
        )
    )
  );

create trigger wid_set_updated_at
  before update on public.work_item_documents
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- Audit whitelist + tracked-columns extension
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings',
      'communication_outbox',
      'resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
      'compliance_tags','work_item_documents'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $func$
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
    when 'resources' then array['display_name','kind','fte_default','availability_default','is_active','linked_user_id']
    when 'work_item_resources' then array['allocation_pct']
    when 'tenant_project_type_overrides' then array['overrides']
    when 'tenant_method_overrides' then array['enabled']
    when 'vendors' then array['name','category','primary_contact_email','website','status']
    when 'vendor_project_assignments' then array['role','scope_note','valid_from','valid_until']
    when 'vendor_evaluations' then array['criterion','score','comment']
    when 'vendor_documents' then array['kind','title','external_url','document_date','note']
    when 'compliance_tags' then array['display_name','description','is_active']
    when 'work_item_documents' then array['title','body','checklist','version']
    else array[]::text[]
  end
$func$;

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
as $func$
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
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then
      select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project
      from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id
      where wid.id = p_entity_id;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$func$;

create trigger audit_changes_compliance_tags
  after update on public.compliance_tags
  for each row execute function public.record_audit_changes();

create trigger audit_changes_work_item_documents
  after update on public.work_item_documents
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- Seed 7 platform-default tags for every existing tenant.
-- Idempotent: only inserts rows that don't already exist for the
-- (tenant_id, key) pair.
-- ---------------------------------------------------------------------------
insert into public.compliance_tags
  (tenant_id, key, display_name, description, default_child_kinds, template_keys, is_platform_default)
select t.id, td.key, td.display_name, td.description, td.default_child_kinds, td.template_keys, true
from public.tenants t
cross join (
  values
    ('iso-9001',           'ISO 9001 (Qualität)',         'Qualitätsmanagement nach ISO 9001 — erzwingt Prüf-Schritt + Doku-Slot.',           array['task'],         array['iso-9001-form']),
    ('iso-27001',          'ISO 27001 (Informationssicherheit)', 'Informationssicherheits-Check — IS-Management, Risikobetrachtung.',          array['task'],         array['iso-27001-form']),
    ('dsgvo',              'DSGVO',                       'Datenschutz-Folgenabschätzung + DPA-Check + Klasse-3-Datenfluss-Beschreibung.',    array['task'],         array['dsgvo-form']),
    ('microsoft-365-intro','M365 Einführung',             'Standard-Schritte für Microsoft-365-Rollouts (Identitäten, Lizenzen, Migration).',  array['work_package'], array['m365-intro-form']),
    ('vendor-evaluation',  'Vendor-Evaluation',           'Lieferanten-Bewertungs-Matrix + Pflichtfelder. Mit PROJ-15 verzahnt.',             array['task'],         array['vendor-evaluation-form']),
    ('change-management',  'Change-Management',           'Change-Request-Workflow: Antrag, Bewertung, Freigabe, Rollout, Review.',            array['work_package'], array['change-management-form']),
    ('onboarding',         'Onboarding',                  'Standard-Onboarding-Checkliste für neue Team-Mitglieder.',                          array['task'],         array['onboarding-form'])
) as td(key, display_name, description, default_child_kinds, template_keys)
on conflict (tenant_id, key) do nothing;
