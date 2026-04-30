-- =============================================================================
-- PROJ-22: Budget-Modul (3 Ebenen + Vendor-Invoice + Multi-Currency)
-- =============================================================================
-- Architecture decisions locked in /architecture (all "A" recommendations):
--   1. Eigene `vendor_invoices`-Tabelle in PROJ-22 (saubere Trennung zu PROJ-15)
--   2. SQL-View `budget_item_totals` für Aggregation
--   3. Manueller FX-Rate-Pflegedialog (kein EZB-Auto-Refresh)
--   4. Synthetische Audit-Einträge per API-Route (kein Postgres-Trigger)
--   5. Posten-Currency in Tabelle, Sammelwährung im Footer
--
-- Five new tables + one view:
--   budget_categories  — Top-Level-Gruppen pro Projekt
--   budget_items       — Posten innerhalb einer Kategorie (Plan-Wert)
--   budget_postings    — IMMUTABLE Buchungen (Storno via reversal)
--   vendor_invoices    — Vendor-Rechnungs-Master (NEU, separat zu vendor_documents)
--   fx_rates           — Multi-Currency-Umrechnungstabelle (manuelle Pflege v1)
--   View budget_item_totals — pro Posten Plan/Ist/Reservation/Traffic-Light
--
-- Plus: tenant_settings.budget_settings JSONB column + `budget` module key
-- backfilled idempotent for every tenant.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- ISO-4217 currency whitelist (v1: 5 major currencies)
-- ---------------------------------------------------------------------------
-- Used as CHECK constraints across budget_items, budget_postings,
-- vendor_invoices, fx_rates. v1 supports EUR/USD/CHF/GBP/JPY only.

create or replace function public._is_supported_currency(p_currency text)
returns boolean
language sql
immutable
parallel safe
as $func$
  select p_currency in ('EUR','USD','CHF','GBP','JPY')
$func$;


-- ---------------------------------------------------------------------------
-- budget_categories — Top-Level-Gruppen pro Projekt
-- ---------------------------------------------------------------------------
create table public.budget_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  project_id   uuid not null,
  name         text not null,
  description  text,
  position     int not null default 0,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budget_categories_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint budget_categories_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint budget_categories_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint budget_categories_name_length
    check (char_length(name) between 1 and 100),
  constraint budget_categories_description_length
    check (description is null or char_length(description) <= 2000)
);

create index budget_categories_project_idx
  on public.budget_categories (project_id, position);

alter table public.budget_categories enable row level security;

create policy "budget_categories_select_member"
  on public.budget_categories for select
  using (public.is_project_member(project_id));

create policy "budget_categories_insert_editor_or_lead_or_admin"
  on public.budget_categories for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "budget_categories_update_editor_or_lead_or_admin"
  on public.budget_categories for update
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

create policy "budget_categories_delete_editor_or_lead_or_admin"
  on public.budget_categories for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger budget_categories_set_updated_at
  before update on public.budget_categories
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- budget_items — Posten innerhalb einer Kategorie
-- ---------------------------------------------------------------------------
create table public.budget_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  project_id         uuid not null,
  category_id        uuid not null,
  name               text not null,
  description        text,
  planned_amount     numeric(14,2) not null default 0,
  planned_currency   char(3) not null,
  is_active          boolean not null default true,
  position           int not null default 0,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint budget_items_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint budget_items_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint budget_items_category_fkey
    foreign key (category_id) references public.budget_categories(id) on delete cascade,
  constraint budget_items_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint budget_items_name_length
    check (char_length(name) between 1 and 100),
  constraint budget_items_description_length
    check (description is null or char_length(description) <= 2000),
  constraint budget_items_planned_amount_nonneg
    check (planned_amount >= 0),
  constraint budget_items_currency_supported
    check (public._is_supported_currency(planned_currency))
);

create index budget_items_project_idx
  on public.budget_items (project_id, category_id, position);
create index budget_items_active_idx
  on public.budget_items (project_id, is_active);

alter table public.budget_items enable row level security;

create policy "budget_items_select_member"
  on public.budget_items for select
  using (public.is_project_member(project_id));

create policy "budget_items_insert_editor_or_lead_or_admin"
  on public.budget_items for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "budget_items_update_editor_or_lead_or_admin"
  on public.budget_items for update
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

create policy "budget_items_delete_editor_or_lead_or_admin"
  on public.budget_items for delete
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger budget_items_set_updated_at
  before update on public.budget_items
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- budget_postings — IMMUTABLE Buchungen
-- ---------------------------------------------------------------------------
-- INSERT-only via RLS. Storno = neue Buchung mit kind='reversal' +
-- amount = -original.amount + reverses_posting_id = original.id.
-- UNIQUE(reverses_posting_id) verhindert Doppel-Storno.
-- ---------------------------------------------------------------------------
create table public.budget_postings (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  project_id             uuid not null,
  item_id                uuid not null,
  kind                   text not null,
  amount                 numeric(14,2) not null,
  currency               char(3) not null,
  posted_at              date not null,
  note                   text,
  source                 text not null default 'manual',
  source_ref_id          uuid,
  reverses_posting_id    uuid,
  created_by             uuid not null,
  created_at             timestamptz not null default now(),
  constraint budget_postings_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint budget_postings_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint budget_postings_item_fkey
    foreign key (item_id) references public.budget_items(id) on delete cascade,
  constraint budget_postings_reverses_fkey
    foreign key (reverses_posting_id) references public.budget_postings(id) on delete restrict,
  constraint budget_postings_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint budget_postings_kind_check
    check (kind in ('actual','reservation','reversal')),
  constraint budget_postings_source_check
    check (source in ('manual','vendor_invoice')),
  constraint budget_postings_currency_supported
    check (public._is_supported_currency(currency)),
  constraint budget_postings_note_length
    check (note is null or char_length(note) <= 500),
  -- reversal MUST point to a parent; non-reversal MUST NOT
  constraint budget_postings_reversal_consistency
    check (
      (kind = 'reversal' and reverses_posting_id is not null)
      or (kind <> 'reversal' and reverses_posting_id is null)
    ),
  -- posted_at within ±5 years past, +1 year future (sanity)
  constraint budget_postings_posted_at_window
    check (
      posted_at >= (current_date - interval '5 years')
      and posted_at <= (current_date + interval '1 year')
    )
);

-- One reversal per original posting
create unique index budget_postings_reverses_unique
  on public.budget_postings (reverses_posting_id)
  where reverses_posting_id is not null;

create index budget_postings_item_posted_idx
  on public.budget_postings (item_id, posted_at);
create index budget_postings_source_ref_idx
  on public.budget_postings (source_ref_id)
  where source_ref_id is not null;

alter table public.budget_postings enable row level security;

-- Project members can read; project-editor/lead/admin can INSERT.
-- DELIBERATELY: NO UPDATE policy, NO DELETE policy (immutability).

create policy "budget_postings_select_member"
  on public.budget_postings for select
  using (public.is_project_member(project_id));

create policy "budget_postings_insert_editor_or_lead_or_admin"
  on public.budget_postings for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );


-- ---------------------------------------------------------------------------
-- vendor_invoices — Vendor-Rechnungs-Master (PROJ-22-eigen)
-- ---------------------------------------------------------------------------
-- Sauber getrennt zu PROJ-15 vendor_documents (Verträge/NDAs/Referenzen).
-- Eine Rechnung kann project-globally angelegt sein (project_id NULL) oder
-- einem konkreten Projekt zugeordnet (project_id NOT NULL).
-- ---------------------------------------------------------------------------
create table public.vendor_invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  vendor_id          uuid not null,
  project_id         uuid,
  invoice_number     text not null,
  invoice_date       date not null,
  gross_amount       numeric(14,2) not null,
  currency           char(3) not null,
  file_storage_key   text,
  note               text,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint vendor_invoices_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint vendor_invoices_vendor_fkey
    foreign key (vendor_id) references public.vendors(id) on delete cascade,
  constraint vendor_invoices_project_fkey
    foreign key (project_id) references public.projects(id) on delete set null,
  constraint vendor_invoices_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint vendor_invoices_number_length
    check (char_length(invoice_number) between 1 and 100),
  constraint vendor_invoices_amount_nonneg
    check (gross_amount >= 0),
  constraint vendor_invoices_currency_supported
    check (public._is_supported_currency(currency)),
  constraint vendor_invoices_note_length
    check (note is null or char_length(note) <= 2000),
  constraint vendor_invoices_file_storage_https_only
    check (file_storage_key is null or char_length(file_storage_key) between 1 and 1000)
);

create index vendor_invoices_vendor_idx
  on public.vendor_invoices (vendor_id, invoice_date desc);
create index vendor_invoices_project_idx
  on public.vendor_invoices (project_id) where project_id is not null;
create index vendor_invoices_tenant_idx
  on public.vendor_invoices (tenant_id);

alter table public.vendor_invoices enable row level security;

-- Tenant-member SELECT (Lesen); Schreiben:
--   - Wenn project_id gesetzt: project-editor / lead / tenant-admin
--   - Wenn project_id null:    tenant-admin only
create policy "vendor_invoices_select_tenant_member"
  on public.vendor_invoices for select
  using (public.is_tenant_member(tenant_id));

create policy "vendor_invoices_insert_editor_or_admin"
  on public.vendor_invoices for insert
  with check (
    case
      when project_id is not null then
        public.has_project_role(project_id, 'editor')
        or public.is_project_lead(project_id)
        or public.is_tenant_admin(tenant_id)
      else
        public.is_tenant_admin(tenant_id)
    end
  );

create policy "vendor_invoices_update_editor_or_admin"
  on public.vendor_invoices for update
  using (
    case
      when project_id is not null then
        public.has_project_role(project_id, 'editor')
        or public.is_project_lead(project_id)
        or public.is_tenant_admin(tenant_id)
      else
        public.is_tenant_admin(tenant_id)
    end
  )
  with check (
    case
      when project_id is not null then
        public.has_project_role(project_id, 'editor')
        or public.is_project_lead(project_id)
        or public.is_tenant_admin(tenant_id)
      else
        public.is_tenant_admin(tenant_id)
    end
  );

create policy "vendor_invoices_delete_admin_or_lead"
  on public.vendor_invoices for delete
  using (
    case
      when project_id is not null then
        public.is_project_lead(project_id)
        or public.is_tenant_admin(tenant_id)
      else
        public.is_tenant_admin(tenant_id)
    end
  );

create trigger vendor_invoices_set_updated_at
  before update on public.vendor_invoices
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- fx_rates — Multi-Currency-Umrechnungstabelle (manuelle Pflege v1)
-- ---------------------------------------------------------------------------
-- v1: Tenant-Admin pflegt manuell. Daily-Refresh aus EZB-API ist PROJ-22b.
-- Composite PK ermöglicht Historie pro Pair.
-- Tenant-scoped: jeder Tenant kann eigene Raten pflegen.
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  from_currency   char(3) not null,
  to_currency     char(3) not null,
  rate            numeric(18,8) not null,
  valid_on        date not null,
  source          text not null default 'manual',
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  constraint fx_rates_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint fx_rates_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint fx_rates_from_currency_supported
    check (public._is_supported_currency(from_currency)),
  constraint fx_rates_to_currency_supported
    check (public._is_supported_currency(to_currency)),
  constraint fx_rates_different_currencies
    check (from_currency <> to_currency),
  constraint fx_rates_rate_positive
    check (rate > 0),
  constraint fx_rates_source_check
    check (source in ('manual','tenant_override'))
);

create unique index fx_rates_pair_unique
  on public.fx_rates (tenant_id, from_currency, to_currency, valid_on, source);
create index fx_rates_tenant_lookup_idx
  on public.fx_rates (tenant_id, from_currency, to_currency, valid_on desc);

alter table public.fx_rates enable row level security;

create policy "fx_rates_select_tenant_member"
  on public.fx_rates for select
  using (public.is_tenant_member(tenant_id));

create policy "fx_rates_insert_admin"
  on public.fx_rates for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "fx_rates_delete_admin"
  on public.fx_rates for delete
  using (public.is_tenant_admin(tenant_id));

-- No UPDATE policy — Raten sind versioniert via valid_on, nicht überschrieben.


-- ---------------------------------------------------------------------------
-- View budget_item_totals — pro Posten Plan/Ist/Reservation/Traffic-Light
-- ---------------------------------------------------------------------------
-- Live-View. Performant bis ~10k Buchungen pro Projekt.
-- Materialized-View mit Trigger-Refresh ist PROJ-22b, falls nötig.
--
-- Aggregation berücksichtigt nur Buchungen in derselben Currency wie der
-- Posten (Multi-Currency-Hinweis sieht der Caller via separater Spalte).
-- ---------------------------------------------------------------------------
create or replace view public.budget_item_totals
with (security_invoker = true)
as
select
  i.id                                                  as item_id,
  i.tenant_id,
  i.project_id,
  i.category_id,
  i.planned_amount,
  i.planned_currency,
  i.is_active,
  -- Ist-Summe in Posten-Currency: actual minus reversal
  coalesce(sum(
    case
      when p.currency = i.planned_currency and p.kind = 'actual' then p.amount
      when p.currency = i.planned_currency and p.kind = 'reversal' then p.amount
      else 0
    end
  ), 0)::numeric(14,2)                                  as actual_amount,
  -- Reservierungen in Posten-Currency
  coalesce(sum(
    case
      when p.currency = i.planned_currency and p.kind = 'reservation' then p.amount
      else 0
    end
  ), 0)::numeric(14,2)                                  as reservation_amount,
  -- Multi-Currency: Anzahl Buchungen mit anderer Währung als der Posten
  count(*) filter (where p.currency <> i.planned_currency)::int
                                                        as multi_currency_postings_count,
  -- Traffic-light state berechnet aus actual / planned
  case
    when i.planned_amount = 0 then 'green'
    when (
      coalesce(sum(
        case
          when p.currency = i.planned_currency and p.kind = 'actual' then p.amount
          when p.currency = i.planned_currency and p.kind = 'reversal' then p.amount
          else 0
        end
      ), 0) / nullif(i.planned_amount, 0)
    ) > 1.0 then 'red'
    when (
      coalesce(sum(
        case
          when p.currency = i.planned_currency and p.kind = 'actual' then p.amount
          when p.currency = i.planned_currency and p.kind = 'reversal' then p.amount
          else 0
        end
      ), 0) / nullif(i.planned_amount, 0)
    ) >= 0.9 then 'yellow'
    else 'green'
  end                                                   as traffic_light_state
from public.budget_items i
left join public.budget_postings p on p.item_id = i.id
group by i.id;


-- ---------------------------------------------------------------------------
-- tenant_settings.budget_settings — JSONB-Spalte für Budget-Defaults
-- ---------------------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists budget_settings jsonb not null default '{"default_currency":"EUR"}'::jsonb;


-- ---------------------------------------------------------------------------
-- Module-Toggle: budget für jeden bestehenden Tenant idempotent anhängen
-- ---------------------------------------------------------------------------
update public.tenant_settings
set active_modules = active_modules || '["budget"]'::jsonb
where not (active_modules ? 'budget');


-- ---------------------------------------------------------------------------
-- Audit-Whitelist erweitert
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
      'compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings','vendor_invoices'
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
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings']
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
    when 'budget_categories' then array['name','description','position']
    when 'budget_items' then array['name','description','planned_amount','planned_currency','is_active','position']
    when 'vendor_invoices' then array['invoice_number','invoice_date','gross_amount','currency','note','project_id']
    -- budget_postings is INSERT-only and audit happens via API-route synthetic entries; no tracked columns here.
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
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      -- Vendor-Rechnung kann project-globally sein; in dem Fall nur tenant-admin (oben abgehandelt).
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
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$func$;


-- ---------------------------------------------------------------------------
-- Audit-Trigger für die UPDATE-trackbaren Tabellen
-- (budget_postings hat KEINEN Trigger — INSERT-only, audit via API-route)
-- ---------------------------------------------------------------------------
create trigger audit_changes_budget_categories
  after update on public.budget_categories
  for each row execute function public.record_audit_changes();

create trigger audit_changes_budget_items
  after update on public.budget_items
  for each row execute function public.record_audit_changes();

create trigger audit_changes_vendor_invoices
  after update on public.vendor_invoices
  for each row execute function public.record_audit_changes();
