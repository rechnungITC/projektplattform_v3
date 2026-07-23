-- ---------------------------------------------------------------------------
-- PROJ-79-α — DMS Foundation (internal core). Project-scoped document tree +
-- internal file storage + incremental tenant storage quota.
--
-- Scope α ONLY: document_tree_nodes + documents + tenant_storage_quotas +
-- private Storage bucket `documents` (tenant/project-prefixed, mirror of the
-- PROJ-70 `context-source-uploads` hardening) + tree move/soft-delete RPCs +
-- quota-increment trigger + PROJ-10 audit wiring. DB enums keep the β values
-- (external_link / sharepoint / gdrive) forward-compatible but α only ever
-- writes folder/document + internal.
--
-- Deferred → β (NOT in this migration): external_source_connectors,
-- SharePoint/GDrive OAuth, Supabase Vault, on-demand fetch, external_link
-- node creation, nightly quota truth-sweep cron.
--
-- Audit trio (audit_log_entity_type_check + _tracked_audit_columns +
-- can_read_audit_entry) recreated NON-DESTRUCTIVELY from the LIVE prod defs
-- (M&A-EXTEND recipe): all sibling entities preserved, +authenticated grant
-- re-added. Idempotent DDL throughout.
-- ---------------------------------------------------------------------------

-- Section 0: audit entity-type CHECK — LIVE list + document_tree_nodes + documents
alter table public.audit_log_entries drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders','work_items','phases','milestones','projects','risks',
      'decisions','open_items','tenants','tenant_settings','communication_outbox',
      'resources','work_item_resources','tenant_project_type_overrides',
      'tenant_method_overrides','vendors','vendor_project_assignments',
      'vendor_evaluations','vendor_documents','compliance_tags',
      'work_item_documents','budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
      'dependencies','tenant_ai_keys','tenant_ai_providers',
      'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships',
      'organization_units','locations','stakeholder_interactions',
      'stakeholder_interaction_participants','organization_imports','releases',
      'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
      'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles',
      'ma_ndas','ma_nda_assignments','dd_streams','ma_clearance_grant_requests',
      'ma_clearance_approval_policies','raci_assignments','dd_questions','dd_findings',
      'committees','committee_members','workstreams','workstream_phases',
      'deliverables','deliverable_documents','risk_categories','ma_stage_gates',
      'document_tree_nodes','documents'
    ]::text[])
  );

-- Section 1: document_tree_nodes ------------------------------------------------
create table if not exists public.document_tree_nodes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  parent_id   uuid references public.document_tree_nodes(id) on delete cascade,
  node_type   text not null check (node_type in ('folder','document','external_link')),
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists document_tree_nodes_project_idx on public.document_tree_nodes (project_id);
create index if not exists document_tree_nodes_tenant_idx on public.document_tree_nodes (tenant_id);
create index if not exists document_tree_nodes_parent_idx on public.document_tree_nodes (parent_id) where parent_id is not null;
-- Unique (parent_id, slug) among live nodes; NULL-parent (root) uniqueness is
-- per project. Two partial indexes because Postgres treats NULLs as distinct.
create unique index if not exists document_tree_nodes_parent_slug_uk
  on public.document_tree_nodes (parent_id, slug)
  where parent_id is not null and deleted_at is null;
create unique index if not exists document_tree_nodes_root_slug_uk
  on public.document_tree_nodes (project_id, slug)
  where parent_id is null and deleted_at is null;

alter table public.document_tree_nodes enable row level security;

drop policy if exists document_tree_nodes_select on public.document_tree_nodes;
create policy document_tree_nodes_select on public.document_tree_nodes
  for select to authenticated using (public.is_project_member(project_id));

drop policy if exists document_tree_nodes_insert on public.document_tree_nodes;
create policy document_tree_nodes_insert on public.document_tree_nodes
  for insert to authenticated with check (
    public.is_tenant_admin(tenant_id) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = document_tree_nodes.project_id
        and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')));

drop policy if exists document_tree_nodes_update on public.document_tree_nodes;
create policy document_tree_nodes_update on public.document_tree_nodes
  for update to authenticated using (
    public.is_tenant_admin(tenant_id) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = document_tree_nodes.project_id
        and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')))
  with check (
    public.is_tenant_admin(tenant_id) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = document_tree_nodes.project_id
        and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')));

drop policy if exists document_tree_nodes_delete on public.document_tree_nodes;
create policy document_tree_nodes_delete on public.document_tree_nodes
  for delete to authenticated using (
    public.is_tenant_admin(tenant_id) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = document_tree_nodes.project_id
        and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')));

drop trigger if exists document_tree_nodes_set_updated_at on public.document_tree_nodes;
create trigger document_tree_nodes_set_updated_at before update on public.document_tree_nodes
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists audit_changes_document_tree_nodes on public.document_tree_nodes;
create trigger audit_changes_document_tree_nodes after update on public.document_tree_nodes
  for each row execute function public.record_audit_changes();

-- Section 2: documents ----------------------------------------------------------
create table if not exists public.documents (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  tree_node_id             uuid not null references public.document_tree_nodes(id) on delete cascade,
  storage_backend          text not null default 'internal'
    check (storage_backend in ('internal','sharepoint','gdrive')),
  storage_path             text not null,
  mime_type                text not null,
  size_bytes               bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  original_filename        text not null,
  checksum                 text not null,
  mime_unsupported_for_rag boolean not null default false,
  ai_generated             boolean not null default false,
  ai_generated_metadata    jsonb,
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
create index if not exists documents_tree_node_idx on public.documents (tree_node_id);
create index if not exists documents_tenant_idx on public.documents (tenant_id);

alter table public.documents enable row level security;

-- Access derives from the owning tree node's project membership.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated using (exists (
    select 1 from public.document_tree_nodes n
    where n.id = tree_node_id and public.is_project_member(n.project_id)));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated with check (exists (
    select 1 from public.document_tree_nodes n
    where n.id = tree_node_id and (
      public.is_tenant_admin(n.tenant_id) or exists (
        select 1 from public.project_memberships pm
        where pm.project_id = n.project_id
          and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')))));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated using (exists (
    select 1 from public.document_tree_nodes n
    where n.id = tree_node_id and (
      public.is_tenant_admin(n.tenant_id) or exists (
        select 1 from public.project_memberships pm
        where pm.project_id = n.project_id
          and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')))));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete to authenticated using (exists (
    select 1 from public.document_tree_nodes n
    where n.id = tree_node_id and (
      public.is_tenant_admin(n.tenant_id) or exists (
        select 1 from public.project_memberships pm
        where pm.project_id = n.project_id
          and pm.user_id = (select auth.uid()) and pm.role in ('lead','editor')))));

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists audit_changes_documents on public.documents;
create trigger audit_changes_documents after update on public.documents
  for each row execute function public.record_audit_changes();

-- Section 3: tenant_storage_quotas (per-tenant, system-written) ------------------
create table if not exists public.tenant_storage_quotas (
  tenant_id           uuid primary key references public.tenants(id) on delete cascade,
  license_tier        text not null default 'standard',
  max_bytes           bigint not null default 5368709120,   -- 5 GiB default tier
  soft_warning_pct    integer not null default 80 check (soft_warning_pct between 1 and 100),
  current_usage_bytes bigint not null default 0 check (current_usage_bytes >= 0),
  last_recomputed_at  timestamptz
);
alter table public.tenant_storage_quotas enable row level security;

-- read = tenant-admin only; writes are system-only via SECURITY DEFINER trigger
-- (no INSERT/UPDATE/DELETE policy for authenticated → direct writes blocked).
drop policy if exists tenant_storage_quotas_select on public.tenant_storage_quotas;
create policy tenant_storage_quotas_select on public.tenant_storage_quotas
  for select to authenticated using (public.is_tenant_admin(tenant_id));

-- Section 4: internal Storage bucket `documents` (private, tenant/project-prefixed)
-- Mirrors PROJ-70 context-source-uploads hardening. Path layout:
--   {tenant_id}/{project_id}/{tree_node_id}/{sanitized_filename}
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

do $bucket_limits$
begin
  if exists (select 1 from information_schema.columns
    where table_schema='storage' and table_name='buckets' and column_name='file_size_limit') then
    update storage.buckets set file_size_limit = 52428800 where id = 'documents';  -- 50 MB
  end if;
  if exists (select 1 from information_schema.columns
    where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types') then
    update storage.buckets set allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/markdown','text/csv','image/png','image/jpeg'
    ] where id = 'documents';
  end if;
end
$bucket_limits$;

-- RLS on storage.objects — seg1 = tenant (is_tenant_member), seg2 = project
-- (is_project_member). Fine-grained editor gate is enforced at the API layer;
-- these policies are tenant/project defense-in-depth (stronger than PROJ-70's
-- tenant-only precedent).
drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select on storage.objects
  for select to authenticated using (
    bucket_id = 'documents'
    and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    and public.is_tenant_member((split_part(name,'/',1))::uuid)
    and split_part(name,'/',2) ~ '^[0-9a-f-]{36}$'
    and public.is_project_member((split_part(name,'/',2))::uuid));

drop policy if exists documents_bucket_insert on storage.objects;
create policy documents_bucket_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents'
    and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    and public.is_tenant_member((split_part(name,'/',1))::uuid)
    and split_part(name,'/',2) ~ '^[0-9a-f-]{36}$'
    and public.is_project_member((split_part(name,'/',2))::uuid));

drop policy if exists documents_bucket_update on storage.objects;
create policy documents_bucket_update on storage.objects
  for update to authenticated using (
    bucket_id = 'documents'
    and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    and public.is_tenant_member((split_part(name,'/',1))::uuid)
    and split_part(name,'/',2) ~ '^[0-9a-f-]{36}$'
    and public.is_project_member((split_part(name,'/',2))::uuid))
  with check (
    bucket_id = 'documents'
    and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    and public.is_tenant_member((split_part(name,'/',1))::uuid)
    and split_part(name,'/',2) ~ '^[0-9a-f-]{36}$'
    and public.is_project_member((split_part(name,'/',2))::uuid));

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'documents'
    and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
    and public.is_tenant_member((split_part(name,'/',1))::uuid)
    and split_part(name,'/',2) ~ '^[0-9a-f-]{36}$'
    and public.is_project_member((split_part(name,'/',2))::uuid));

-- Section 5: quota-increment trigger (system-only writer) -----------------------
-- α policy: increment on internal-document INSERT. Soft-delete does NOT free
-- bytes (30-day retention window; freeing happens in β nightly truth-sweep).
create or replace function public._dms_bump_storage_usage()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.storage_backend = 'internal' and new.deleted_at is null then
    insert into public.tenant_storage_quotas as q
      (tenant_id, current_usage_bytes, last_recomputed_at)
    values (new.tenant_id, new.size_bytes, now())
    on conflict (tenant_id) do update
      set current_usage_bytes = q.current_usage_bytes + new.size_bytes,
          last_recomputed_at = now();
  end if;
  return new;
end;
$$;
revoke execute on function public._dms_bump_storage_usage() from public;
revoke execute on function public._dms_bump_storage_usage() from anon;
revoke execute on function public._dms_bump_storage_usage() from authenticated;

drop trigger if exists documents_bump_storage_usage on public.documents;
create trigger documents_bump_storage_usage after insert on public.documents
  for each row execute function public._dms_bump_storage_usage();

-- Section 6: tree RPCs (impersonation-safe: auth.uid(), no actor param) ---------
-- 6a. Move a node to a new parent, with cycle detection.
create or replace function public.dms_move_node(p_node_id uuid, p_new_parent_id uuid)
returns public.document_tree_nodes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_row public.document_tree_nodes;
  v_p_tenant uuid; v_p_project uuid; v_p_type text; v_p_deleted timestamptz;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.document_tree_nodes where id = p_node_id and deleted_at is null;
  if not found then raise exception 'node not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to move node' using errcode='42501';
  end if;

  if p_new_parent_id is not null then
    if p_new_parent_id = p_node_id then
      raise exception 'cannot move a node into itself' using errcode='23514';
    end if;
    select tenant_id, project_id, node_type, deleted_at
      into v_p_tenant, v_p_project, v_p_type, v_p_deleted
      from public.document_tree_nodes where id = p_new_parent_id;
    if not found or v_p_deleted is not null then
      raise exception 'target parent not found' using errcode='P0002';
    end if;
    if v_p_project <> v_project then
      raise exception 'cannot move node across projects' using errcode='23514';
    end if;
    if v_p_type <> 'folder' then
      raise exception 'target parent must be a folder' using errcode='23514';
    end if;
    -- cycle guard: new parent must not be a descendant of the node being moved
    if exists (
      with recursive descendants as (
        select id from public.document_tree_nodes where parent_id = p_node_id
        union all
        select c.id from public.document_tree_nodes c
        join descendants d on c.parent_id = d.id
      )
      select 1 from descendants where id = p_new_parent_id
    ) then
      raise exception 'cannot move a node into its own descendant' using errcode='23514';
    end if;
  end if;

  update public.document_tree_nodes
    set parent_id = p_new_parent_id, updated_at = now()
    where id = p_node_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.dms_move_node(uuid, uuid) from public;
revoke execute on function public.dms_move_node(uuid, uuid) from anon;
grant execute on function public.dms_move_node(uuid, uuid) to authenticated;

-- 6b. Soft-delete a node and its whole subtree (+ linked documents).
create or replace function public.dms_soft_delete_subtree(p_node_id uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_count integer;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.document_tree_nodes where id = p_node_id;
  if not found then raise exception 'node not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to delete node' using errcode='42501';
  end if;

  with recursive subtree as (
    select id from public.document_tree_nodes where id = p_node_id
    union all
    select c.id from public.document_tree_nodes c
    join subtree s on c.parent_id = s.id
  ),
  del_docs as (
    update public.documents d set deleted_at = now()
    where d.tree_node_id in (select id from subtree) and d.deleted_at is null
    returning 1
  ),
  del_nodes as (
    update public.document_tree_nodes n set deleted_at = now()
    where n.id in (select id from subtree) and n.deleted_at is null
    returning 1
  )
  select count(*) into v_count from del_nodes;
  return v_count;
end;
$$;
revoke execute on function public.dms_soft_delete_subtree(uuid) from public;
revoke execute on function public.dms_soft_delete_subtree(uuid) from anon;
grant execute on function public.dms_soft_delete_subtree(uuid) to authenticated;

-- Section 7: audit trio recreate (LIVE defs + document_tree_nodes/documents) -----
create or replace function public._tracked_audit_columns(p_table text)
returns text[] language sql immutable security definer set search_path to 'public','pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id','category_id','confidentiality_level','workstream_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes','daily_rate_override','daily_rate_override_currency','organization_unit_id']
    when 'work_item_resources' then array['effort_hours','role_key','start_date','end_date']
    when 'tenant_project_type_overrides' then array['display_name','description','rules','active','sort_order']
    when 'tenant_method_overrides' then array['display_name','description','rules','active','sort_order']
    when 'vendors' then array['name','vendor_number','category','status','contact_email','contact_phone','website','notes','tax_id']
    when 'vendor_project_assignments' then array['role','status','signed_at','signed_off_by','removed_at','removed_by']
    when 'vendor_evaluations' then array['rubric_key','score','comment','evaluated_at','evaluated_by']
    when 'vendor_documents' then array['kind','title','file_url','signed_at','signed_off_by','expires_at','metadata']
    when 'compliance_tags' then array['key','label','description','data_classes','required_for_kinds']
    when 'work_item_documents' then array['title','file_url','tag_keys','description']
    when 'budget_categories' then array['name','description','position']
    when 'budget_items' then array['name','description','category_id','planned_amount','planned_currency','position']
    when 'budget_postings' then array['budget_item_id','amount','currency','posted_at','description','source_type','source_ref','reverses_posting_id']
    when 'vendor_invoices' then array['vendor_id','invoice_number','total_amount','currency','invoice_date','due_date','status','document_id','metadata']
    when 'report_snapshots' then array[]::text[]
    when 'role_rates' then array['daily_rate','currency','valid_from','role_key']
    when 'work_item_cost_lines' then array['amount','currency','source_type','source_metadata','occurred_on']
    when 'tenant_memberships' then array['role','organization_unit_id']
    when 'organization_units' then array['name','code','type','parent_id','location_id','description','is_active','sort_order','import_id']
    when 'locations' then array['name','code','country','city','address','is_active','import_id']
    when 'stakeholder_interactions' then array['summary','channel','direction','interaction_date','awaiting_response','response_due_date','response_received_date','replies_to_interaction_id','deleted_at']
    when 'stakeholder_interaction_participants' then array['participant_sentiment','participant_sentiment_source','participant_sentiment_model','participant_sentiment_provider','participant_sentiment_confidence','participant_cooperation_signal','participant_cooperation_signal_source']
    when 'ma_clearance_profiles' then array['name','description','granted_level','is_active']
    when 'ma_advisor_profiles' then array['organization','advisor_type','mandate_start','mandate_end','mandate_status','responsible_user_id','scope']
    when 'ma_ndas' then array['counterparty','responsible_user_id','status','signed_date','valid_from','valid_until','scope_kind','scope_ref','covered_level','document_link','reminder_date']
    when 'ma_nda_assignments' then array['user_id','contact_name','contact_org']
    when 'dd_streams' then array['stream_key','label','stream_lead_user_id','status','planned_start','planned_end','scope','notes','confidentiality_level','phase_id','sort_order']
    when 'raci_assignments' then array['role_key','raci_letter']
    when 'dd_questions' then array['title','detail','addressee','priority','due_date','status','responsible_user_id','answer_text','answer_link','answered_by','answer_round','confidentiality_level']
    when 'dd_findings' then array['title','description','severity','economic_impact_eur','probability','recommended_treatment','status','linked_risk_id','responsible_user_id','confidentiality_level']
    when 'committees' then array['name','purpose','cadence','decision_scope','value_threshold_eur','value_threshold_currency','escalation_scope','confidentiality_level','sort_order']
    when 'committee_members' then array['stakeholder_id','role_in_committee','is_voting']
    when 'workstreams' then array['workstream_key','label','goal','lead_user_id','rag_status','scope','notes','confidentiality_level','sort_order']
    when 'deliverables' then array['name','description','phase_id','workstream_id','responsible_user_id','due_date','status','confidentiality_level','sort_order']
    when 'deliverable_documents' then array['title','url','tag_keys']
    when 'risk_categories' then array['key','label','applies_to_project_type','sort_order','is_active']
    when 'ma_stage_gates' then array['status','decision','decision_id','decided_by','decided_at','confidentiality_level']
    when 'document_tree_nodes' then array['name','parent_id','sort_order','deleted_at']
    when 'documents' then array['deleted_at','mime_unsupported_for_rag']
    else array[]::text[]
  end
$$;
revoke execute on function public._tracked_audit_columns(text) from public;

create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then return true; end if;
  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then select project_id into v_project from public.milestones where id = p_entity_id;
    when 'releases' then select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id where wid.id = p_entity_id;
    when 'budget_categories' then select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      select project_id into v_project from public.vendor_invoices where id = p_entity_id;
      if v_project is null then return false; end if;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    when 'risk_categories' then return public.is_tenant_member(p_tenant_id);
    when 'sprints' then select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then select project_id into v_project from public.dd_streams where id = p_entity_id;
    when 'raci_assignments' then select project_id into v_project from public.raci_assignments where id = p_entity_id;
    when 'dd_questions' then select project_id into v_project from public.dd_questions where id = p_entity_id;
    when 'dd_findings' then select project_id into v_project from public.dd_findings where id = p_entity_id;
    when 'committees' then select project_id into v_project from public.committees where id = p_entity_id;
    when 'committee_members' then
      select c.project_id into v_project from public.committee_members m
      join public.committees c on c.id = m.committee_id where m.id = p_entity_id;
    when 'workstreams' then select project_id into v_project from public.workstreams where id = p_entity_id;
    when 'deliverables' then select project_id into v_project from public.deliverables where id = p_entity_id;
    when 'deliverable_documents' then
      select d.project_id into v_project from public.deliverable_documents dd
      join public.deliverables d on d.id = dd.deliverable_id where dd.id = p_entity_id;
    when 'ma_stage_gates' then select project_id into v_project from public.ma_stage_gates where id = p_entity_id;
    when 'document_tree_nodes' then select project_id into v_project from public.document_tree_nodes where id = p_entity_id;
    when 'documents' then
      select n.project_id into v_project from public.documents dd
      join public.document_tree_nodes n on n.id = dd.tree_node_id where dd.id = p_entity_id;
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- Section 8: static smoke checks ------------------------------------------------
do $smoke$
declare v_tables int; v_bucket int; v_obj_policies int; v_check_has_docs boolean;
begin
  select count(*) into v_tables from information_schema.tables
    where table_schema='public' and table_name in
      ('document_tree_nodes','documents','tenant_storage_quotas');
  if v_tables <> 3 then raise exception 'smoke-fail: expected 3 DMS tables, found %', v_tables; end if;

  select count(*) into v_bucket from storage.buckets where id='documents' and public=false;
  if v_bucket <> 1 then raise exception 'smoke-fail: documents bucket missing/misconfigured'; end if;

  select count(*) into v_obj_policies from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname in ('documents_bucket_select','documents_bucket_insert','documents_bucket_update','documents_bucket_delete');
  if v_obj_policies <> 4 then raise exception 'smoke-fail: expected 4 documents bucket policies, found %', v_obj_policies; end if;

  -- audit trio still resolves the new + a sibling entity (non-destructive recreate)
  if public._tracked_audit_columns('document_tree_nodes') = array[]::text[] then
    raise exception 'smoke-fail: document_tree_nodes not tracked'; end if;
  if public._tracked_audit_columns('deliverables') = array[]::text[] then
    raise exception 'smoke-fail: sibling deliverables lost from _tracked_audit_columns'; end if;

  select (strpos(pg_get_constraintdef(oid), '''document_tree_nodes''') > 0
          and strpos(pg_get_constraintdef(oid), '''documents''') > 0)
    into v_check_has_docs
  from pg_constraint where conname='audit_log_entity_type_check';
  if not coalesce(v_check_has_docs,false) then
    raise exception 'smoke-fail: audit CHECK missing document_tree_nodes/documents'; end if;

  raise notice 'PROJ-79-alpha smoke passed: 3 tables + bucket + 4 obj-policies + audit trio intact';
end
$smoke$;
