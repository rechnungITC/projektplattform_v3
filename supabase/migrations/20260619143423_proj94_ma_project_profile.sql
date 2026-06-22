-- ---------------------------------------------------------------------------
-- PROJ-94 — M&A-Projekt mit strategischer Grundlage anlegen (M&A Release 1)
--
-- Implements the locked Tech Design in features/PROJ-94-*.md +
-- docs/decisions/ma-domain-architecture.md:
--
--   Fork 1: M&A is ONE project_type (not a module). The stored slug is 'ma'
--           (URL-safe; flows into /api/project-types/[type]/rules). Display
--           label "M&A-Projekt" carries the ampersand. Deal variants
--           (buy/sell/jv/carve-out) are a `deal_side` FIELD, not separate types.
--   Fork 2: the strategic foundation lives in a dedicated 1:1 extension table
--           (NOT projects.type_specific_data JSONB) so AC-5 gets field-level
--           change history via the PROJ-10 audit trigger, and so the table can
--           carry its own confidentiality_level (PROJ-100a need-to-know sublayer).
--           ma_project_profiles is the FIRST new table to adopt the 100a recipe.
--   Fork 3: confidentiality_level (need-to-know) is orthogonal to privacy_class
--           (Class-3). These strategic fields are deal strategy, not PII.
--
-- Scope 94: project_type='ma' + ma_project_profiles table (strategic grounds +
--           mandate_status state machine) + RLS (tenant + need-to-know) +
--           field-level audit + create/transition RPCs.
-- NOT in 94: 10-phase model (PROJ-95), RACI roles (PROJ-97), DD (PROJ-112ff),
--            DMS upload instead of URL (PROJ-79). Mandate 'approved' only SETS
--            the flag; PROJ-95 consumes it to unlock Phase 2.
-- ---------------------------------------------------------------------------

-- Section 1: register project_type='ma' on the two type-constrained tables ----
alter table public.projects
  drop constraint if exists projects_project_type_check;
alter table public.projects
  add constraint projects_project_type_check
    check (project_type in ('erp', 'construction', 'software', 'general', 'ma'));

alter table public.project_wizard_drafts
  drop constraint if exists pwd_project_type_check;
alter table public.project_wizard_drafts
  add constraint pwd_project_type_check check (
    project_type is null
    or project_type in ('erp', 'construction', 'software', 'general', 'ma')
  );

-- Section 2: ma_project_profiles — 1:1 strategic-foundation extension ----------
-- Multi-tenant invariant: tenant_id NOT NULL REFERENCES tenants ON DELETE CASCADE.
-- 1:1 with projects via UNIQUE(project_id) + ON DELETE CASCADE.
create table if not exists public.ma_project_profiles (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  project_id                uuid not null references public.projects(id) on delete cascade,
  -- Deal variant (Fork 1) — optional (not an AC-1 mandatory field).
  deal_side                 text check (deal_side is null or deal_side in ('buy', 'sell', 'jv', 'carve_out')),
  -- Sponsor (AC-1 mandatory). Deal Lead = projects.responsible_user_id (reused).
  sponsor_user_id           uuid not null references public.profiles(id),
  -- Mandate state machine (AC-4): draft -> submitted -> approved.
  mandate_status            text not null default 'draft'
                              check (mandate_status in ('draft', 'submitted', 'approved')),
  -- Strategic grounds (AC-2). Length-capped as defense-in-depth.
  deal_rationale            text check (deal_rationale is null or char_length(deal_rationale) <= 20000),
  search_profile            text check (search_profile is null or char_length(search_profile) <= 20000),
  exclusion_criteria        text check (exclusion_criteria is null or char_length(exclusion_criteria) <= 20000),
  investment_frame_amount   numeric(18, 2) check (investment_frame_amount is null or investment_frame_amount >= 0),
  investment_frame_currency text check (investment_frame_currency is null or char_length(investment_frame_currency) = 3),
  investment_frame_note     text check (investment_frame_note is null or char_length(investment_frame_note) <= 4000),
  -- Linked strategy document (AC-2). MVP = URL reference; DMS upload = PROJ-79.
  strategic_document_link   text check (strategic_document_link is null or char_length(strategic_document_link) <= 2048),
  -- PROJ-100a need-to-know level for the strategic foundation (may exceed the
  -- project shell's own level — strategic data is typically more sensitive).
  confidentiality_level     public.ma_confidentiality_level not null default 'standard',
  created_by                uuid not null references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (project_id)
);

create index if not exists ma_project_profiles_tenant_idx
  on public.ma_project_profiles (tenant_id);
create index if not exists ma_project_profiles_sponsor_idx
  on public.ma_project_profiles (sponsor_user_id);

alter table public.ma_project_profiles enable row level security;

-- Section 3: tenant RLS (permissive) ------------------------------------------
-- SELECT: any tenant member. UPDATE/DELETE: tenant-admin or project-lead
-- (strategic governance data — not editable by arbitrary editors).
-- No INSERT policy: creation funnels exclusively through the SECURITY DEFINER
-- RPC create_ma_project_profile (structurally blocks ad-hoc inserts).
drop policy if exists ma_profiles_select on public.ma_project_profiles;
create policy ma_profiles_select on public.ma_project_profiles
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists ma_profiles_update on public.ma_project_profiles;
create policy ma_profiles_update on public.ma_project_profiles
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists ma_profiles_delete on public.ma_project_profiles;
create policy ma_profiles_delete on public.ma_project_profiles
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

-- Section 4: need-to-know gate (RESTRICTIVE — AND-ed, never weakens tenant RLS)-
-- Exactly the PROJ-100a recipe applied to a new table. SELECT/UPDATE/DELETE are
-- gated by can_access_classified(project_id, confidentiality_level).
drop policy if exists ma_profiles_confidentiality_gate on public.ma_project_profiles;
create policy ma_profiles_confidentiality_gate on public.ma_project_profiles
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists ma_profiles_confidentiality_gate_write on public.ma_project_profiles;
create policy ma_profiles_confidentiality_gate_write on public.ma_project_profiles
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists ma_profiles_confidentiality_gate_delete on public.ma_project_profiles;
create policy ma_profiles_confidentiality_gate_delete on public.ma_project_profiles
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- Section 5: triggers (updated_at + field-level audit) ------------------------
drop trigger if exists ma_project_profiles_set_updated_at on public.ma_project_profiles;
create trigger ma_project_profiles_set_updated_at
  before update on public.ma_project_profiles
  for each row execute procedure extensions.moddatetime ('updated_at');

drop trigger if exists ma_project_profiles_audit_update on public.ma_project_profiles;
create trigger ma_project_profiles_audit_update
  after update on public.ma_project_profiles
  for each row execute function public.record_audit_changes();

-- Section 6: extend audit infrastructure for the new entity -------------------
-- 6a. audit_log_entries.entity_type CHECK must allow 'ma_project_profiles',
--     otherwise the AFTER UPDATE audit trigger aborts every UPDATE (this was
--     the PROJ-100a H-1 failure mode). Deployed list (45) + new value.
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
      'ma_confidentiality_clearances','ma_project_profiles'
    ]::text[])
  );

-- 6b. _tracked_audit_columns: add the ma_project_profiles whitelist so the
--     PROJ-10 trigger records field-level diffs (AC-5). Reproduced verbatim
--     from 20260616100000_proj100a with the one new branch appended.
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
    when 'ma_project_profiles' then array[
      'deal_side','sponsor_user_id','mandate_status',
      'deal_rationale','search_profile','exclusion_criteria',
      'investment_frame_amount','investment_frame_currency','investment_frame_note',
      'strategic_document_link','confidentiality_level'
    ]
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

-- 6c. can_read_audit_entry: resolve ma_project_profiles -> its project so the
--     change history is readable by project members. Reproduced verbatim from
--     20260522170000_proj65_eps3b with the one new branch added.
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
    when 'releases' then
      select project_id into v_project from public.releases where id = p_entity_id;
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
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
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
    -- PROJ-65 ε.3b: sprints audit-readable by project members.
    when 'sprints' then
      select project_id into v_project from public.sprints where id = p_entity_id;
    -- PROJ-94: M&A strategic profile audit-readable by project members.
    when 'ma_project_profiles' then
      select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

-- Section 7: create_ma_project_profile RPC ------------------------------------
-- Called by the wizard finalize route after the project row is inserted. Funnel
-- for creation (no INSERT policy on the table). SECURITY DEFINER, but enforces:
--   - caller (coalesced actor) is a member of the project's tenant
--   - the sponsor is a member of the same tenant (no cross-tenant sponsor)
-- Initial confidentiality is set freely by the creator (PROJ-100a leaves INSERT
-- ungated by design — a brand-new project has no clearances yet; gating create
-- would be a chicken-egg blocking non-admin deal leads). RAISING the level later
-- is an UPDATE via the PATCH route, gated by the RESTRICTIVE need-to-know policy.
-- Idempotent on project_id (1:1): re-running updates the existing row.
-- NO p_actor_user_id param: the caller is ALWAYS auth.uid(). The routes call
-- this via the user-context client (auth.uid() present); there is no
-- service-role path. An actor param would let any caller spoof the actor
-- (impersonation), so it is deliberately absent.
create or replace function public.create_ma_project_profile(
  p_project_id uuid,
  p_sponsor_user_id uuid,
  p_deal_side text default null,
  p_deal_rationale text default null,
  p_search_profile text default null,
  p_exclusion_criteria text default null,
  p_investment_frame_amount numeric default null,
  p_investment_frame_currency text default null,
  p_investment_frame_note text default null,
  p_strategic_document_link text default null,
  p_confidentiality_level public.ma_confidentiality_level default 'standard'
)
returns public.ma_project_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_row public.ma_project_profiles;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- caller must belong to the project's tenant
  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = v_caller
  ) then
    raise exception 'not a member of this tenant' using errcode = '42501';
  end if;

  -- sponsor must belong to the same tenant (no cross-tenant sponsor)
  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = p_sponsor_user_id
  ) then
    raise exception 'sponsor is not a member of this tenant' using errcode = '42501';
  end if;

  insert into public.ma_project_profiles (
    tenant_id, project_id, deal_side, sponsor_user_id,
    deal_rationale, search_profile, exclusion_criteria,
    investment_frame_amount, investment_frame_currency, investment_frame_note,
    strategic_document_link, confidentiality_level, created_by
  ) values (
    v_tenant, p_project_id, p_deal_side, p_sponsor_user_id,
    p_deal_rationale, p_search_profile, p_exclusion_criteria,
    p_investment_frame_amount, p_investment_frame_currency, p_investment_frame_note,
    p_strategic_document_link, p_confidentiality_level, v_caller
  )
  on conflict (project_id) do update set
    deal_side = excluded.deal_side,
    sponsor_user_id = excluded.sponsor_user_id,
    deal_rationale = excluded.deal_rationale,
    search_profile = excluded.search_profile,
    exclusion_criteria = excluded.exclusion_criteria,
    investment_frame_amount = excluded.investment_frame_amount,
    investment_frame_currency = excluded.investment_frame_currency,
    investment_frame_note = excluded.investment_frame_note,
    strategic_document_link = excluded.strategic_document_link,
    confidentiality_level = excluded.confidentiality_level,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_ma_project_profile(uuid, uuid, text, text, text, text, numeric, text, text, text, public.ma_confidentiality_level) from public, anon;
grant execute on function public.create_ma_project_profile(uuid, uuid, text, text, text, text, numeric, text, text, text, public.ma_confidentiality_level) to authenticated;

-- Section 8: transition_mandate_status RPC (AC-4) -----------------------------
-- Mandate state machine: draft -> {submitted, approved}; submitted -> {approved,
-- draft}; approved is terminal (MVP). Authority: tenant-admin OR project-lead OR
-- the sponsor OR the deal lead (projects.responsible_user_id). The UPDATE fires
-- the AFTER UPDATE audit trigger (mandate_status is in the whitelist) so every
-- transition is field-level audited automatically.
-- SECURITY DEFINER bypasses table RLS, so this RPC explicitly mirrors the
-- ma_project_profiles need-to-know gate before mutating mandate_status.
-- NO p_actor_user_id param (impersonation-safe): caller is always auth.uid().
create or replace function public.transition_mandate_status(
  p_project_id uuid,
  p_to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_responsible uuid;
  v_from_status text;
  v_sponsor uuid;
  v_confidentiality_level public.ma_confidentiality_level;
  v_authorized boolean;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_to_status not in ('draft', 'submitted', 'approved') then
    raise exception 'unknown mandate_status: %', p_to_status using errcode = '23514';
  end if;

  select
      p.tenant_id,
      p.responsible_user_id,
      mp.mandate_status,
      mp.sponsor_user_id,
      mp.confidentiality_level
    into
      v_tenant,
      v_responsible,
      v_from_status,
      v_sponsor,
      v_confidentiality_level
    from public.projects p
    join public.ma_project_profiles mp on mp.project_id = p.id
    where p.id = p_project_id;
  if not found then
    raise exception 'M&A project profile not found' using errcode = 'P0002';
  end if;

  v_authorized :=
    exists (
      select 1 from public.tenant_memberships
      where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
    )
    or exists (
      select 1 from public.project_memberships
      where project_id = p_project_id and user_id = v_caller and role = 'lead'
    )
    or v_caller = v_responsible
    or v_caller = v_sponsor;
  if not v_authorized then
    raise exception 'insufficient role to change mandate status' using errcode = '42501';
  end if;

  if not public.can_access_classified(p_project_id, v_confidentiality_level) then
    raise exception 'insufficient clearance to change mandate status' using errcode = '42501';
  end if;

  case v_from_status
    when 'draft' then
      if p_to_status not in ('submitted', 'approved') then
        raise exception 'cannot transition mandate from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'submitted' then
      if p_to_status not in ('approved', 'draft') then
        raise exception 'cannot transition mandate from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'approved' then
      raise exception 'mandate already approved (terminal)' using errcode = '23514';
    else
      raise exception 'unknown mandate_status: %', v_from_status using errcode = '23514';
  end case;

  update public.ma_project_profiles
    set mandate_status = p_to_status, updated_at = now()
    where project_id = p_project_id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'mandate_status', p_to_status,
    'from_status', v_from_status
  );
end;
$$;

revoke execute on function public.transition_mandate_status(uuid, text) from public, anon;
grant execute on function public.transition_mandate_status(uuid, text) to authenticated;

comment on table public.ma_project_profiles is
  'PROJ-94: 1:1 M&A strategic-foundation extension of projects (deal rationale, search profile, exclusion criteria, investment frame, mandate state machine). Field-level audited (PROJ-10) and need-to-know gated (PROJ-100a). Orthogonal to Class-3.';
