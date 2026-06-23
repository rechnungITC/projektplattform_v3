-- ---------------------------------------------------------------------------
-- PROJ-100b — Clearance profiles + who-can-see, on top of the 100a gate.
--
-- EXTEND on PROJ-100a (20260616100000). Two convenience/transparency layers on
-- the finished need-to-know gate:
--   (1) Clearance PROFILES — named tenant catalog templates that grant a
--       clearance in one step. Applying a profile reuses the EXISTING grant
--       path (single authority + audit path) — a profile can never bypass RLS
--       or the 100a invariants.
--   (2) WHO-CAN-SEE — a read-only RPC that lists exactly the users the gate
--       (can_access_classified) would let through for an object, DERIVED from
--       the same predicate (no second gate that could drift).
--
-- AC5 (four-eyes) is NOT here -> PROJ-100c.
-- ---------------------------------------------------------------------------

-- Section 1: clearance-profile catalog (tenant-scoped) ----------------------
-- Mirrors the existing tenant-catalog pattern. 'standard' is never granted
-- (it is the open default), so the grantable levels mirror the grant schema.
create table if not exists public.ma_clearance_profiles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  description   text,
  granted_level public.ma_confidentiality_level not null,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ma_clearance_profiles_grantable_level
    check (granted_level in ('confidential', 'strict'))
);

-- Case-insensitive unique name per tenant (no "Legal" vs "legal" dupes);
-- same name across tenants is fine (isolated).
create unique index if not exists ma_clearance_profiles_tenant_name_idx
  on public.ma_clearance_profiles (tenant_id, lower(name));
create index if not exists ma_clearance_profiles_tenant_idx
  on public.ma_clearance_profiles (tenant_id);

alter table public.ma_clearance_profiles enable row level security;

-- SELECT: any tenant member may read the catalog (it is not secret which
-- profiles exist; only applying them is manager-gated, via the grant path).
drop policy if exists ma_clearance_profiles_select on public.ma_clearance_profiles;
create policy ma_clearance_profiles_select on public.ma_clearance_profiles
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- INSERT / UPDATE / DELETE: tenant-admin only (specific policies, not FOR ALL,
-- per the PROJ-68 hygiene convention). Hard delete is allowed for admins but
-- the UI deactivates (is_active=false) instead.
drop policy if exists ma_clearance_profiles_insert on public.ma_clearance_profiles;
create policy ma_clearance_profiles_insert on public.ma_clearance_profiles
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists ma_clearance_profiles_update on public.ma_clearance_profiles;
create policy ma_clearance_profiles_update on public.ma_clearance_profiles
  for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists ma_clearance_profiles_delete on public.ma_clearance_profiles;
create policy ma_clearance_profiles_delete on public.ma_clearance_profiles
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

-- Section 2: audit wiring for the catalog -----------------------------------
-- record_audit_changes (PROJ-10, UPDATE-only) writes audit_log_entries with
-- entity_type = TG_TABLE_NAME, so the CHECK constraint must allow the new type
-- BEFORE any write (the PROJ-100a-H-1 lesson). Recreate with the value
-- appended to the deployed 45-value set.
alter table public.audit_log_entries
  drop constraint if exists audit_log_entity_type_check;
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
      'ma_confidentiality_clearances','ma_clearance_profiles'
    ]::text[])
  );

-- Add the profile catalog's tracked columns. Reproduced verbatim from the
-- 20260616100000 version with only the ma_clearance_profiles addition.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      'is_approver',
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel',
      'organization_unit_id'
    ]
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      'daily_rate_override','daily_rate_override_currency',
      'organization_unit_id'
    ]
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
    when 'organization_units' then array[
      'name','code','type','parent_id','location_id','description',
      'is_active','sort_order','import_id'
    ]
    when 'locations' then array[
      'name','code','country','city','address','is_active','import_id'
    ]
    when 'stakeholder_interactions' then array[
      'summary','channel','direction','interaction_date',
      'awaiting_response','response_due_date','response_received_date',
      'replies_to_interaction_id','deleted_at'
    ]
    when 'stakeholder_interaction_participants' then array[
      'participant_sentiment','participant_sentiment_source',
      'participant_sentiment_model','participant_sentiment_provider',
      'participant_sentiment_confidence',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    when 'ma_clearance_profiles' then array['name','description','granted_level','is_active']
    else array[]::text[]
  end
$$;
revoke execute on function public._tracked_audit_columns(text) from public;

create trigger audit_changes_ma_clearance_profiles
  after update on public.ma_clearance_profiles
  for each row execute function public.record_audit_changes();

-- Section 3: clearance -> profile provenance reference -----------------------
-- Optional: which profile a clearance was last applied via. Pure traceability;
-- does NOT affect the gate. ON DELETE SET NULL so a hard-deleted profile leaves
-- the clearance intact.
alter table public.ma_confidentiality_clearances
  add column if not exists applied_profile_id uuid
    references public.ma_clearance_profiles(id) on delete set null;

-- Section 4: recreate grant RPC with an optional profile reference -----------
-- The 100a grant is the single authority + audit path. We add an optional
-- p_applied_profile_id so the apply-profile wrapper can record provenance via
-- the SAME path (no parallel write). Behaviour is otherwise identical to
-- 20260616100000. Dropping the 4-arg version and creating a 5-arg version with
-- a default keeps the existing PostgREST callers working (resolved via default).
drop function if exists public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz);

create or replace function public.grant_confidentiality_clearance(
  p_project_id uuid,
  p_user_id uuid,
  p_max_level public.ma_confidentiality_level,
  p_valid_until timestamptz default null,
  p_applied_profile_id uuid default null
)
returns public.ma_confidentiality_clearances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_row public.ma_confidentiality_clearances;
  v_actor uuid := auth.uid();
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to grant clearances' using errcode = '42501';
  end if;

  -- target must be a member of the same tenant (no cross-tenant grant)
  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = p_user_id
  ) then
    raise exception 'target user is not a member of this tenant' using errcode = '42501';
  end if;

  insert into public.ma_confidentiality_clearances
    (tenant_id, project_id, user_id, max_level, valid_until, granted_by, applied_profile_id)
  values (v_tenant, p_project_id, p_user_id, p_max_level, p_valid_until, v_actor, p_applied_profile_id)
  on conflict (tenant_id, project_id, user_id)
  do update set max_level = excluded.max_level,
                valid_until = excluded.valid_until,
                granted_by = excluded.granted_by,
                applied_profile_id = excluded.applied_profile_id,
                granted_at = now()
  returning * into v_row;

  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (v_tenant, 'ma_confidentiality_clearances', v_row.id, 'max_level',
     null, to_jsonb(p_max_level::text), v_actor,
     nullif(current_setting('audit.change_reason', true), ''));

  return v_row;
end;
$$;

revoke execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz, uuid) from public, anon;
grant execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz, uuid) to authenticated;

-- Section 5: apply a profile (thin wrapper over the grant path) --------------
-- Resolves an ACTIVE profile (same tenant as the project), then delegates to
-- grant_confidentiality_clearance with the profile's level + a provenance ref.
-- Downgrade guard: never silently lowers an existing higher clearance — the
-- effective level is GREATEST(existing, profile level). Authority + tenant +
-- audit are all enforced by the inner grant call (single path).
create or replace function public.apply_clearance_profile(
  p_project_id uuid,
  p_user_id uuid,
  p_profile_id uuid
)
returns public.ma_confidentiality_clearances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_profile_level public.ma_confidentiality_level;
  v_existing public.ma_confidentiality_level;
  v_effective public.ma_confidentiality_level;
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- profile must exist, be active, and belong to the project's tenant
  select granted_level into v_profile_level
  from public.ma_clearance_profiles
  where id = p_profile_id and tenant_id = v_tenant and is_active;
  if v_profile_level is null then
    raise exception 'clearance profile not found or inactive' using errcode = 'P0002';
  end if;

  -- downgrade guard: keep the higher of existing vs profile level
  select max_level into v_existing
  from public.ma_confidentiality_clearances
  where project_id = p_project_id and user_id = p_user_id;
  v_effective := greatest(v_existing, v_profile_level);

  -- single write/audit/authority path
  return public.grant_confidentiality_clearance(
    p_project_id, p_user_id, v_effective, null, p_profile_id
  );
end;
$$;

revoke execute on function public.apply_clearance_profile(uuid, uuid, uuid) from public, anon;
grant execute on function public.apply_clearance_profile(uuid, uuid, uuid) to authenticated;

-- Section 6: who-can-see RPC (derived from the gate predicate) ---------------
-- Returns exactly the users can_access_classified would let through for an
-- object at p_level in p_project_id: standard => every tenant member (baseline,
-- the gate is a no-op); else tenant-admins (bypass) UNION non-expired clearance
-- holders >= p_level. NOT a second gate — it mirrors the gate's own rule.
-- Manager-gated (admin/lead) so it does not leak the inner circle to everyone.
create or replace function public.who_can_access(
  p_project_id uuid,
  p_level public.ma_confidentiality_level
)
returns table (
  user_id uuid,
  access_reason text,
  cleared_level public.ma_confidentiality_level,
  valid_until timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return;
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to view the access overview' using errcode = '42501';
  end if;

  if p_level = 'standard' then
    return query
      select m.user_id, 'baseline'::text, null::public.ma_confidentiality_level, null::timestamptz
      from public.tenant_memberships m
      where m.tenant_id = v_tenant;
    return;
  end if;

  return query
    -- tenant-admins: full access by bypass
    select m.user_id, 'admin'::text, null::public.ma_confidentiality_level, null::timestamptz
    from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.role = 'admin'
    union
    -- cleared, non-expired, non-admin users
    select c.user_id, 'clearance'::text, c.max_level, c.valid_until
    from public.ma_confidentiality_clearances c
    where c.project_id = p_project_id
      and c.max_level >= p_level
      and (c.valid_until is null or c.valid_until > now())
      and not exists (
        select 1 from public.tenant_memberships m2
        where m2.tenant_id = v_tenant and m2.user_id = c.user_id and m2.role = 'admin'
      );
end;
$$;

revoke execute on function public.who_can_access(uuid, public.ma_confidentiality_level) from public, anon;
grant execute on function public.who_can_access(uuid, public.ma_confidentiality_level) to authenticated;

comment on function public.who_can_access(uuid, public.ma_confidentiality_level) is
  'PROJ-100b read-only who-can-see: lists exactly the users can_access_classified would admit for an object at the given level in the given project (standard=all members, else admins UNION non-expired clearances >= level). Manager-gated. Mirrors the gate; never a second gate.';
