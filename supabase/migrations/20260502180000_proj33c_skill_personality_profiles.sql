-- =============================================================================
-- PROJ-33 Phase 33-γ: Skill + Big5/OCEAN Profile + Pre-baked Audit-Events
-- =============================================================================
-- 2 separate Profile-Tabellen (Skill + Personality) mit fremd_*/self_*-Cols
-- pro 5 Dimensionen. Plus stakeholder_profile_audit_events als
-- append-only Audit-Trail mit actor_kind-Union — pre-baked für Phase δ
-- (Self-Assessment via Magic-Link).
-- =============================================================================

-- 1. stakeholder_skill_profiles (1:1 mit Stakeholder)
create table if not exists public.stakeholder_skill_profiles (
  stakeholder_id uuid primary key references public.stakeholders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 5 fachliche Dimensionen × {fremd (PM), self (Stakeholder)}
  domain_knowledge_fremd integer check (domain_knowledge_fremd is null or domain_knowledge_fremd between 0 and 100),
  domain_knowledge_self  integer check (domain_knowledge_self  is null or domain_knowledge_self  between 0 and 100),
  method_competence_fremd integer check (method_competence_fremd is null or method_competence_fremd between 0 and 100),
  method_competence_self  integer check (method_competence_self  is null or method_competence_self  between 0 and 100),
  it_affinity_fremd integer check (it_affinity_fremd is null or it_affinity_fremd between 0 and 100),
  it_affinity_self  integer check (it_affinity_self  is null or it_affinity_self  between 0 and 100),
  negotiation_skill_fremd integer check (negotiation_skill_fremd is null or negotiation_skill_fremd between 0 and 100),
  negotiation_skill_self  integer check (negotiation_skill_self  is null or negotiation_skill_self  between 0 and 100),
  decision_power_fremd integer check (decision_power_fremd is null or decision_power_fremd between 0 and 100),
  decision_power_self  integer check (decision_power_self  is null or decision_power_self  between 0 and 100),
  -- Audit-Felder
  fremd_assessed_by uuid references public.profiles(id) on delete set null,
  fremd_assessed_at timestamptz,
  self_assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stakeholder_skill_profiles_tenant_idx
  on public.stakeholder_skill_profiles (tenant_id);

alter table public.stakeholder_skill_profiles enable row level security;
create policy "stakeholder_skill_profiles_select" on public.stakeholder_skill_profiles
  for select using (public.is_tenant_member(tenant_id));
create policy "stakeholder_skill_profiles_insert" on public.stakeholder_skill_profiles
  for insert with check (public.is_tenant_member(tenant_id));
create policy "stakeholder_skill_profiles_update" on public.stakeholder_skill_profiles
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- 2. stakeholder_personality_profiles (1:1 mit Stakeholder, Big5/OCEAN)
create table if not exists public.stakeholder_personality_profiles (
  stakeholder_id uuid primary key references public.stakeholders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 5 OCEAN-Dimensionen × {fremd, self}
  -- Sprachregelung: emotional_stability statt neuroticism (positiv-framed).
  openness_fremd integer check (openness_fremd is null or openness_fremd between 0 and 100),
  openness_self  integer check (openness_self  is null or openness_self  between 0 and 100),
  conscientiousness_fremd integer check (conscientiousness_fremd is null or conscientiousness_fremd between 0 and 100),
  conscientiousness_self  integer check (conscientiousness_self  is null or conscientiousness_self  between 0 and 100),
  extraversion_fremd integer check (extraversion_fremd is null or extraversion_fremd between 0 and 100),
  extraversion_self  integer check (extraversion_self  is null or extraversion_self  between 0 and 100),
  agreeableness_fremd integer check (agreeableness_fremd is null or agreeableness_fremd between 0 and 100),
  agreeableness_self  integer check (agreeableness_self  is null or agreeableness_self  between 0 and 100),
  emotional_stability_fremd integer check (emotional_stability_fremd is null or emotional_stability_fremd between 0 and 100),
  emotional_stability_self  integer check (emotional_stability_self  is null or emotional_stability_self  between 0 and 100),
  fremd_assessed_by uuid references public.profiles(id) on delete set null,
  fremd_assessed_at timestamptz,
  self_assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stakeholder_personality_profiles_tenant_idx
  on public.stakeholder_personality_profiles (tenant_id);

alter table public.stakeholder_personality_profiles enable row level security;
create policy "stakeholder_personality_profiles_select" on public.stakeholder_personality_profiles
  for select using (public.is_tenant_member(tenant_id));
create policy "stakeholder_personality_profiles_insert" on public.stakeholder_personality_profiles
  for insert with check (public.is_tenant_member(tenant_id));
create policy "stakeholder_personality_profiles_update" on public.stakeholder_personality_profiles
  for update using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- 3. stakeholder_profile_audit_events (append-only, pre-baked für Phase δ)
create table if not exists public.stakeholder_profile_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('skill','personality')),
  event_type text not null check (event_type in (
    'fremd_updated','self_updated','self_assessed_via_token','reset'
  )),
  -- actor_kind union: 'user' (PM-edit) | 'stakeholder' (Self-Assessment via δ Magic-Link)
  actor_kind text not null check (actor_kind in ('user','stakeholder')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_stakeholder_id uuid references public.stakeholders(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now(),
  -- Konsistenz: actor_user_id is set iff actor_kind='user'; actor_stakeholder_id iff 'stakeholder'.
  constraint actor_consistency check (
    (actor_kind = 'user' and actor_user_id is not null and actor_stakeholder_id is null)
    or (actor_kind = 'stakeholder' and actor_stakeholder_id is not null and actor_user_id is null)
  )
);
create index if not exists stakeholder_profile_audit_events_stakeholder_idx
  on public.stakeholder_profile_audit_events (stakeholder_id, created_at desc);

alter table public.stakeholder_profile_audit_events enable row level security;
create policy "stakeholder_profile_audit_events_select" on public.stakeholder_profile_audit_events
  for select using (public.is_tenant_member(tenant_id));
create policy "stakeholder_profile_audit_events_insert" on public.stakeholder_profile_audit_events
  for insert with check (public.is_tenant_member(tenant_id));
-- No UPDATE/DELETE policies → blocked by RLS even if trigger weren't there.

create or replace function public.enforce_stakeholder_profile_audit_immutability()
returns trigger language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception
    'stakeholder_profile_audit_events are append-only. UPDATE and DELETE forbidden.'
    using errcode = 'check_violation';
end;
$$;
revoke execute on function public.enforce_stakeholder_profile_audit_immutability()
  from public, anon, authenticated;

drop trigger if exists stakeholder_profile_audit_events_immutability_update
  on public.stakeholder_profile_audit_events;
create trigger stakeholder_profile_audit_events_immutability_update
  before update on public.stakeholder_profile_audit_events
  for each row execute function public.enforce_stakeholder_profile_audit_immutability();

drop trigger if exists stakeholder_profile_audit_events_immutability_delete
  on public.stakeholder_profile_audit_events;
create trigger stakeholder_profile_audit_events_immutability_delete
  before delete on public.stakeholder_profile_audit_events
  for each row execute function public.enforce_stakeholder_profile_audit_immutability();

-- 4. updated_at-Triggers (touch_updated_at existiert seit PROJ-31)
drop trigger if exists stakeholder_skill_profiles_touch_updated on public.stakeholder_skill_profiles;
create trigger stakeholder_skill_profiles_touch_updated
  before update on public.stakeholder_skill_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_personality_profiles_touch_updated on public.stakeholder_personality_profiles;
create trigger stakeholder_personality_profiles_touch_updated
  before update on public.stakeholder_personality_profiles
  for each row execute function public.touch_updated_at();

-- 5. Documentation
comment on table public.stakeholder_skill_profiles is
  'PROJ-33 Phase 33-γ — fachliches Skill-Profil pro Stakeholder (5 Dimensionen × fremd/self). Class-2.';
comment on table public.stakeholder_personality_profiles is
  'PROJ-33 Phase 33-γ — Big5/OCEAN-Persönlichkeitsprofil (5 Dimensionen × fremd/self). Class-2 default; Tenant kann auf Class-3 hochstufen.';
comment on table public.stakeholder_profile_audit_events is
  'PROJ-33 Phase 33-γ — append-only Audit-Trail für Profile-Edits. actor_kind=user (PM via UI) oder stakeholder (Phase δ Self-Assessment via Magic-Link). UPDATE/DELETE rejected by trigger.';
