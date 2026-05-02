-- =============================================================================
-- PROJ-33 Phase 33-α: qualitative Stakeholder-Felder + Audit-Tracking
-- =============================================================================
-- Adds 8 new columns to public.stakeholders and extends the PROJ-10 audit
-- trigger's tracked-columns whitelist to cover them.
--
-- Decisions Reuse:
--   - kind (person/organization) and stakeholder_type_key
--     (promoter/critic/...) are ORTHOGONAL dimensions. Both stay.
--   - All new columns are nullable with safe defaults so existing rows
--     are unaffected.
--   - Catalog table `stakeholder_type_catalog` arrives in 33-β; until
--     then `stakeholder_type_key` is just a free text reference column.
--   - is_approver (PROJ-31) was missing from the audit-tracked set;
--     this migration also adds it for hygiene.
-- =============================================================================

alter table public.stakeholders
  add column if not exists reasoning text;

alter table public.stakeholders
  add column if not exists stakeholder_type_key text;

alter table public.stakeholders
  add column if not exists management_level text
    check (management_level is null or management_level in (
      'top','upper','middle','lower','operational'
    ));

alter table public.stakeholders
  add column if not exists decision_authority text
    check (decision_authority is null or decision_authority in (
      'none','advisory','recommending','deciding'
    ))
    default 'none';

alter table public.stakeholders
  add column if not exists attitude text
    check (attitude is null or attitude in (
      'supportive','neutral','critical','blocking'
    ))
    default 'neutral';

alter table public.stakeholders
  add column if not exists conflict_potential text
    check (conflict_potential is null or conflict_potential in (
      'low','medium','high','critical'
    ));

alter table public.stakeholders
  add column if not exists communication_need text
    check (communication_need is null or communication_need in (
      'low','normal','high','critical'
    ));

alter table public.stakeholders
  add column if not exists preferred_channel text
    check (preferred_channel is null or preferred_channel in (
      'meeting','email','chat','report','dashboard'
    ));

-- Length constraints for free-text columns
alter table public.stakeholders
  add constraint stakeholders_reasoning_length
    check (reasoning is null or char_length(reasoning) <= 5000);

alter table public.stakeholders
  add constraint stakeholders_stakeholder_type_key_length
    check (stakeholder_type_key is null or char_length(stakeholder_type_key) <= 64);

-- Documentation
comment on column public.stakeholders.reasoning is
  'PROJ-33 — Begründung / Treiber: warum dieser Stakeholder den dokumentierten Einfluss/Impact hat. Class-2 (kann Personenbezug enthalten).';
comment on column public.stakeholders.stakeholder_type_key is
  'PROJ-33 — Schlüssel auf stakeholder_type_catalog (33-β). Werte: promoter/supporter/critic/blocker plus tenant-eigene.';
comment on column public.stakeholders.management_level is
  'PROJ-33 — Management-Ebene: top/upper/middle/lower/operational.';
comment on column public.stakeholders.decision_authority is
  'PROJ-33 — Entscheidungsbefugnis: none/advisory/recommending/deciding.';
comment on column public.stakeholders.attitude is
  'PROJ-33 — Haltung: supportive/neutral/critical/blocking. Default neutral für Backfill.';
comment on column public.stakeholders.conflict_potential is
  'PROJ-33 — Konflikt-Potenzial-Skala (gleicher Wertebereich wie influence/impact).';
comment on column public.stakeholders.communication_need is
  'PROJ-33 — Kommunikationsbedarf: low/normal/high/critical.';
comment on column public.stakeholders.preferred_channel is
  'PROJ-33 — bevorzugter Kommunikationskanal: meeting/email/chat/report/dashboard.';

-- Index for common filter "show me all critics + blockers"
create index if not exists stakeholders_attitude_idx
  on public.stakeholders (project_id, attitude)
  where attitude in ('critical','blocking');

-- =============================================================================
-- Extend PROJ-10 audit-tracked-columns whitelist to cover the new columns.
-- The function is extended-by-many-migrations; preserve ALL existing
-- entity-types and only update the `stakeholders` array.
-- =============================================================================
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      -- PROJ-8 base
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      -- PROJ-31 (was missing from the audit set)
      'is_approver',
      -- PROJ-33 qualitative fields
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel'
    ]
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes']
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
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;
