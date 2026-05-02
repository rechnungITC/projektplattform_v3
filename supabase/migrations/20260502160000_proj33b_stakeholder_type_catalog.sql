-- =============================================================================
-- PROJ-33 Phase 33-β: stakeholder_type_catalog (global + tenant-erweiterbar)
-- =============================================================================
-- Adds the catalog table for Stakeholder-Types (promoter / supporter /
-- critic / blocker plus tenant-eigene Werte). Seeds 4 globale Defaults
-- (tenant_id IS NULL). Validation-Trigger auf stakeholders enforced
-- referenzielle Integrität ohne native Composite-FK (PostgreSQL kann
-- nicht "OR NULL" beim Composite-Match).
--
-- Phase-α-Daten-Cleanup: Free-Text-Werte aus Phase 33-α, die keinen
-- Catalog-Eintrag matchen, werden auf NULL gesetzt mit Audit-Log.
-- =============================================================================

-- 1. Catalog-Tabelle
create table if not exists public.stakeholder_type_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  key text not null,
  label_de text not null,
  label_en text,
  color text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- UNIQUE (tenant_id, key) — Tenant-A "champion" parallel zu Tenant-B "champion".
  -- NULL tenant_id = global; UNIQUE behandelt NULL korrekt (PostgreSQL nullen
  -- gelten als distinct in UNIQUE — was bei globalen Defaults erwünscht ist
  -- weil wir nur einmal global "promoter" haben wollen, das aber zu erzwingen
  -- braucht's einen partial unique index unten).
  constraint stakeholder_type_catalog_key_length check (char_length(key) between 1 and 64),
  constraint stakeholder_type_catalog_label_de_length check (char_length(label_de) between 1 and 100),
  constraint stakeholder_type_catalog_label_en_length check (label_en is null or char_length(label_en) <= 100),
  constraint stakeholder_type_catalog_color_format check (color ~* '^#[0-9a-f]{6}$')
);

-- Tenant-scoped uniqueness for non-global rows
create unique index if not exists stakeholder_type_catalog_tenant_key_idx
  on public.stakeholder_type_catalog (tenant_id, key)
  where tenant_id is not null;

-- Global uniqueness for the NULL-tenant_id rows (nullable-PG gotcha)
create unique index if not exists stakeholder_type_catalog_global_key_idx
  on public.stakeholder_type_catalog (key)
  where tenant_id is null;

create index if not exists stakeholder_type_catalog_active_idx
  on public.stakeholder_type_catalog (tenant_id, display_order, label_de)
  where is_active = true;

-- 2. RLS
alter table public.stakeholder_type_catalog enable row level security;

create policy "stakeholder_type_catalog_select"
  on public.stakeholder_type_catalog for select
  using (tenant_id is null or public.is_tenant_member(tenant_id));

-- Globale Defaults sind immutable: tenant_id IS NOT NULL ist Pflicht für CRUD.
create policy "stakeholder_type_catalog_insert_admin"
  on public.stakeholder_type_catalog for insert
  with check (tenant_id is not null and public.is_tenant_admin(tenant_id));

create policy "stakeholder_type_catalog_update_admin"
  on public.stakeholder_type_catalog for update
  using (tenant_id is not null and public.is_tenant_admin(tenant_id))
  with check (tenant_id is not null and public.is_tenant_admin(tenant_id));

create policy "stakeholder_type_catalog_delete_admin"
  on public.stakeholder_type_catalog for delete
  using (tenant_id is not null and public.is_tenant_admin(tenant_id));

-- 3. Default-Seeds (globale Einträge, tenant_id = NULL)
-- Idempotent: ON CONFLICT ON CONSTRAINT würde nicht funktionieren weil
-- der unique-index partial ist. Stattdessen WHERE NOT EXISTS.
insert into public.stakeholder_type_catalog (tenant_id, key, label_de, label_en, color, display_order)
select null, 'promoter', 'Promoter', 'Promoter', '#10b981', 10
where not exists (select 1 from public.stakeholder_type_catalog where tenant_id is null and key = 'promoter');

insert into public.stakeholder_type_catalog (tenant_id, key, label_de, label_en, color, display_order)
select null, 'supporter', 'Supporter', 'Supporter', '#3b82f6', 20
where not exists (select 1 from public.stakeholder_type_catalog where tenant_id is null and key = 'supporter');

insert into public.stakeholder_type_catalog (tenant_id, key, label_de, label_en, color, display_order)
select null, 'critic', 'Kritiker', 'Critic', '#f59e0b', 30
where not exists (select 1 from public.stakeholder_type_catalog where tenant_id is null and key = 'critic');

insert into public.stakeholder_type_catalog (tenant_id, key, label_de, label_en, color, display_order)
select null, 'blocker', 'Blockierer', 'Blocker', '#ef4444', 40
where not exists (select 1 from public.stakeholder_type_catalog where tenant_id is null and key = 'blocker');

-- 4. Validation-Trigger auf stakeholders
-- BEFORE INSERT/UPDATE OF stakeholder_type_key: lookup gegen Catalog.
create or replace function public.validate_stakeholder_type_key()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_match_count int;
begin
  if NEW.stakeholder_type_key is null then
    return NEW;
  end if;

  select count(*) into v_match_count
    from public.stakeholder_type_catalog
   where key = NEW.stakeholder_type_key
     and (tenant_id is null or tenant_id = NEW.tenant_id)
     and is_active = true;

  if v_match_count = 0 then
    raise exception
      'invalid_stakeholder_type_key: % is not in catalog (global or tenant=%)',
      NEW.stakeholder_type_key, NEW.tenant_id
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.validate_stakeholder_type_key() from public, anon, authenticated;

drop trigger if exists stakeholders_validate_type_key_insert on public.stakeholders;
create trigger stakeholders_validate_type_key_insert
  before insert on public.stakeholders
  for each row execute function public.validate_stakeholder_type_key();

drop trigger if exists stakeholders_validate_type_key_update on public.stakeholders;
create trigger stakeholders_validate_type_key_update
  before update of stakeholder_type_key on public.stakeholders
  for each row
  when (NEW.stakeholder_type_key is distinct from OLD.stakeholder_type_key)
  execute function public.validate_stakeholder_type_key();

-- 5. Phase-α-Daten-Cleanup
-- Free-Text-Werte aus Phase 33-α, die keinen Catalog-Eintrag matchen,
-- werden auf NULL gesetzt. Audit-Trigger fired automatisch (PROJ-10).
update public.stakeholders s
   set stakeholder_type_key = null
 where s.stakeholder_type_key is not null
   and not exists (
     select 1 from public.stakeholder_type_catalog c
      where c.key = s.stakeholder_type_key
        and (c.tenant_id is null or c.tenant_id = s.tenant_id)
        and c.is_active = true
   );

-- 6. updated_at-Trigger
drop trigger if exists stakeholder_type_catalog_touch_updated on public.stakeholder_type_catalog;
create trigger stakeholder_type_catalog_touch_updated
  before update on public.stakeholder_type_catalog
  for each row execute function public.touch_updated_at();

-- 7. Documentation
comment on table public.stakeholder_type_catalog is
  'PROJ-33 Phase 33-β — Catalog für Stakeholder-Typen. tenant_id IS NULL = globaler Default (immutable per RLS). tenant_id = X = Tenant-X-eigener Eintrag (nur Tenant-Admin CRUD).';
comment on column public.stakeholder_type_catalog.key is
  'Lookup-Schlüssel; UNIQUE per (tenant_id, key). Free-Text außerhalb dieses Catalogs wird vom Trigger validate_stakeholder_type_key abgelehnt.';
comment on column public.stakeholder_type_catalog.color is
  'Hex-Farb-Code, regex-validiert (#rrggbb).';
