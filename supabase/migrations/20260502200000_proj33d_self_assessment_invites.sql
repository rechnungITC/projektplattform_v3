-- =============================================================================
-- PROJ-33 Phase 33-δ: Self-Assessment Magic-Link Invites
-- =============================================================================
-- Eine neue Tabelle: stakeholder_self_assessment_invites.
-- stakeholder_profile_audit_events ist bereits in Phase 33-γ pre-baked.
-- Magic-Link-Token-Pattern analog PROJ-31 decision_approvers (HMAC-signiert
-- + DB-persistierter Token als 2. Validierungs-Schicht), eigenes Side-by-Side-
-- Modul (kein Refactor von approval-token.ts wie in CIA-Fork-4 entschieden).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. stakeholder_self_assessment_invites — 1 Row pro Invite-Versand
-- ---------------------------------------------------------------------------
-- Lebenszyklus:
--   pending  → completed (Stakeholder hat Self-Assessment abgegeben)
--   pending  → revoked   (PM hat Invite zurückgezogen)
--   pending  → expired   (14 Tage ohne Submit; Status wird lazy beim
--                         Token-Verify gesetzt — kein Cron nötig)
-- ---------------------------------------------------------------------------
create table if not exists public.stakeholder_self_assessment_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  -- Server-side HMAC-signierter Token. Persistiert als 2. Validierungs-
  -- Schicht: ein replayed token mit gültiger HMAC + ungültigem DB-Match
  -- (z. B. nach Revoke) wird zurückgewiesen.
  magic_link_token text not null unique,
  magic_link_expires_at timestamptz not null,
  status text not null
    check (status in ('pending','completed','revoked','expired'))
    default 'pending',
  submitted_at timestamptz,
  -- JSON-Snapshot der eingereichten Skill+Big5-Werte (für Audit). Bleibt
  -- NULL bis Submit. Class-2 (keine personenbezogene Diagnose).
  submitted_payload jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stakeholder_self_assessment_invites_stakeholder_idx
  on public.stakeholder_self_assessment_invites (stakeholder_id, status);

create index if not exists stakeholder_self_assessment_invites_tenant_idx
  on public.stakeholder_self_assessment_invites (tenant_id);

-- Token wird per UNIQUE-Constraint indiziert.

comment on table public.stakeholder_self_assessment_invites is
  'PROJ-33 Phase 33-δ — Magic-Link-Workflow für Self-Assessment. '
  'Token HMAC-signiert + DB-persistiert (Replay-Defense). 14 Tage Lebensdauer. '
  'Status pending→completed|revoked|expired. submitted_payload als JSON-Audit-Snapshot.';

-- ---------------------------------------------------------------------------
-- 2. RLS — Tenant-Member SELECT, Editor+ INSERT/UPDATE.
-- ---------------------------------------------------------------------------
alter table public.stakeholder_self_assessment_invites enable row level security;

create policy "stakeholder_self_assessment_invites_select"
  on public.stakeholder_self_assessment_invites
  for select using (public.is_tenant_member(tenant_id));

-- INSERT/UPDATE: Tenant-Membership reicht; PM-Rolle wird im Application-Layer
-- via requireProjectAccess(..., "edit") gegated. RLS = Defense-in-Depth.
create policy "stakeholder_self_assessment_invites_insert"
  on public.stakeholder_self_assessment_invites
  for insert with check (public.is_tenant_member(tenant_id));

create policy "stakeholder_self_assessment_invites_update"
  on public.stakeholder_self_assessment_invites
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- DELETE: keine Policy. Invites werden via ON DELETE CASCADE
-- (Stakeholder/Tenant) entsorgt; manuelles Löschen ist nicht erlaubt
-- (Audit-Trail).

-- ---------------------------------------------------------------------------
-- 3. updated_at-Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists stakeholder_self_assessment_invites_touch_updated
  on public.stakeholder_self_assessment_invites;
create trigger stakeholder_self_assessment_invites_touch_updated
  before update on public.stakeholder_self_assessment_invites
  for each row execute function public.touch_updated_at();
