-- =============================================================================
-- PROJ-35 Phase 35-α: Risk-Score-Engine + Eskalations-Pattern-Audit-Trigger
-- =============================================================================
-- 1. tenant_settings.risk_score_overrides — JSONB-Spalte für tenant-spezifische
--    Multiplikator-Overrides (CIA-Fork-6 lock).
-- 2. Audit-Event-CHECK erweitert um event_type='escalation_pattern_changed'
--    (CIA-Fork-4 lock) + actor_kind='system' für Trigger-getriebene Events.
-- 3. stakeholders.current_escalation_patterns — Snapshot-Array für Diff-Audit.
-- 4. compute_escalation_patterns() — pure SQL-Helper, mirror der TS-Logik.
-- 5. audit_escalation_patterns() — Trigger-Function, schreibt activated/
--    deactivated Audit-Events.
-- 6. Triggers auf stakeholders + stakeholder_personality_profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenant_settings.risk_score_overrides
-- ---------------------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists risk_score_overrides jsonb not null default '{}'::jsonb;

comment on column public.tenant_settings.risk_score_overrides is
  'PROJ-35 Phase 35-α — Tenant-spezifische Multiplikator-Overrides für Risk-Score. '
  'Schema validated by Zod in API-layer. Empty object = use TS-Defaults.';

-- ---------------------------------------------------------------------------
-- 2. Audit-Event CHECKs erweitern
--    a) event_type: + 'escalation_pattern_changed'
--    b) actor_kind: + 'system' (Trigger-getriebene Events ohne user/stakeholder)
--    c) actor_consistency: 3-Wege-OR
-- ---------------------------------------------------------------------------
alter table public.stakeholder_profile_audit_events
  drop constraint if exists stakeholder_profile_audit_events_event_type_check;
alter table public.stakeholder_profile_audit_events
  add constraint stakeholder_profile_audit_events_event_type_check
  check (event_type in (
    'fremd_updated','self_updated','self_assessed_via_token','reset',
    'escalation_pattern_changed'
  ));

alter table public.stakeholder_profile_audit_events
  drop constraint if exists stakeholder_profile_audit_events_actor_kind_check;
alter table public.stakeholder_profile_audit_events
  add constraint stakeholder_profile_audit_events_actor_kind_check
  check (actor_kind in ('user','stakeholder','system'));

alter table public.stakeholder_profile_audit_events
  drop constraint if exists actor_consistency;
alter table public.stakeholder_profile_audit_events
  add constraint actor_consistency check (
    (actor_kind = 'user' and actor_user_id is not null and actor_stakeholder_id is null)
    or (actor_kind = 'stakeholder' and actor_stakeholder_id is not null and actor_user_id is null)
    or (actor_kind = 'system' and actor_user_id is null and actor_stakeholder_id is null)
  );

-- profile_kind: extend to allow 'escalation' for pattern events
alter table public.stakeholder_profile_audit_events
  drop constraint if exists stakeholder_profile_audit_events_profile_kind_check;
alter table public.stakeholder_profile_audit_events
  add constraint stakeholder_profile_audit_events_profile_kind_check
  check (profile_kind in ('skill','personality','escalation'));

-- ---------------------------------------------------------------------------
-- 3. stakeholders.current_escalation_patterns — Snapshot für Diff-Audit
-- ---------------------------------------------------------------------------
alter table public.stakeholders
  add column if not exists current_escalation_patterns text[] not null default array[]::text[];

comment on column public.stakeholders.current_escalation_patterns is
  'PROJ-35 Phase 35-α — Snapshot der zuletzt-detected Eskalations-Pattern-Keys. '
  'Wird vom audit_escalation_patterns()-Trigger gepflegt. Read-only für UI.';

-- ---------------------------------------------------------------------------
-- 4. compute_escalation_patterns() — pure-SQL-Helper
-- ---------------------------------------------------------------------------
create or replace function public.compute_escalation_patterns(
  p_attitude text,
  p_conflict_potential text,
  p_decision_authority text,
  p_influence text,
  p_agreeableness integer,
  p_emotional_stability integer
) returns text[]
language sql immutable
set search_path = 'public', 'pg_temp'
as $$
  select array_remove(array[
    case when p_attitude = 'blocking' and p_decision_authority = 'deciding'
         then 'blocker_decider' end,
    case when p_conflict_potential = 'critical' and p_influence in ('high','critical')
         then 'amplified_conflict' end,
    case when p_agreeableness is not null
          and p_emotional_stability is not null
          and p_agreeableness < 30
          and p_emotional_stability < 30
          and p_attitude in ('critical','blocking')
         then 'dark_profile' end,
    case when p_attitude is null and p_influence = 'critical'
         then 'unknown_critical' end
  ], null);
$$;
revoke execute on function public.compute_escalation_patterns(text, text, text, text, integer, integer)
  from public, anon;

comment on function public.compute_escalation_patterns is
  'PROJ-35 Phase 35-α — pure-SQL-Pattern-Detector. Mirror der TS-Logik in '
  'src/lib/risk-score/escalation-patterns.ts. Returns Array von Pattern-Keys.';

-- ---------------------------------------------------------------------------
-- 5. audit_escalation_patterns() — Trigger-Function
-- ---------------------------------------------------------------------------
-- Fires AFTER UPDATE/INSERT auf stakeholders ODER stakeholder_personality_profiles.
-- Computes new pattern set, compares with stakeholders.current_escalation_patterns
-- snapshot, writes audit-event(s) für jede Activation/Deactivation.
-- ---------------------------------------------------------------------------
create or replace function public.audit_escalation_patterns()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_stakeholder_id uuid;
  v_tenant_id uuid;
  v_attitude text;
  v_conflict text;
  v_authority text;
  v_influence text;
  v_agreeableness integer;
  v_emotional_stability integer;
  v_old_patterns text[];
  v_new_patterns text[];
  v_pattern text;
begin
  -- Resolve stakeholder_id depending on which table fired the trigger
  if tg_table_name = 'stakeholders' then
    v_stakeholder_id := new.id;
    v_tenant_id := new.tenant_id;
  elsif tg_table_name = 'stakeholder_personality_profiles' then
    v_stakeholder_id := new.stakeholder_id;
    v_tenant_id := new.tenant_id;
  else
    return null;
  end if;

  -- Read joined state (most current values across both tables)
  select s.attitude, s.conflict_potential, s.decision_authority, s.influence,
         s.current_escalation_patterns,
         p.agreeableness_fremd, p.emotional_stability_fremd
  into v_attitude, v_conflict, v_authority, v_influence,
       v_old_patterns,
       v_agreeableness, v_emotional_stability
  from public.stakeholders s
  left join public.stakeholder_personality_profiles p on p.stakeholder_id = s.id
  where s.id = v_stakeholder_id;

  if v_old_patterns is null then
    v_old_patterns := array[]::text[];
  end if;

  -- Compute new patterns via the helper
  v_new_patterns := public.compute_escalation_patterns(
    v_attitude, v_conflict, v_authority, v_influence,
    v_agreeableness, v_emotional_stability
  );
  if v_new_patterns is null then
    v_new_patterns := array[]::text[];
  end if;

  -- No change → no audit, no snapshot update.
  if v_new_patterns = v_old_patterns then
    return null;
  end if;

  -- Write audit-event for each newly-activated pattern
  foreach v_pattern in array v_new_patterns loop
    if not (v_pattern = any(v_old_patterns)) then
      insert into public.stakeholder_profile_audit_events
        (tenant_id, stakeholder_id, profile_kind, event_type,
         actor_kind, actor_user_id, actor_stakeholder_id, payload)
      values
        (v_tenant_id, v_stakeholder_id, 'escalation', 'escalation_pattern_changed',
         'system', null, null,
         jsonb_build_object(
           'pattern_key', v_pattern,
           'action', 'activated',
           'snapshot', jsonb_build_object(
             'attitude', v_attitude,
             'conflict_potential', v_conflict,
             'decision_authority', v_authority,
             'influence', v_influence,
             'agreeableness_fremd', v_agreeableness,
             'emotional_stability_fremd', v_emotional_stability
           )
         ));
    end if;
  end loop;

  -- Write audit-event for each newly-deactivated pattern
  foreach v_pattern in array v_old_patterns loop
    if not (v_pattern = any(v_new_patterns)) then
      insert into public.stakeholder_profile_audit_events
        (tenant_id, stakeholder_id, profile_kind, event_type,
         actor_kind, actor_user_id, actor_stakeholder_id, payload)
      values
        (v_tenant_id, v_stakeholder_id, 'escalation', 'escalation_pattern_changed',
         'system', null, null,
         jsonb_build_object(
           'pattern_key', v_pattern,
           'action', 'deactivated',
           'snapshot', jsonb_build_object(
             'attitude', v_attitude,
             'conflict_potential', v_conflict,
             'decision_authority', v_authority,
             'influence', v_influence,
             'agreeableness_fremd', v_agreeableness,
             'emotional_stability_fremd', v_emotional_stability
           )
         ));
    end if;
  end loop;

  -- Update snapshot column. The trigger is OF-scoped to the relevant fields,
  -- so updating current_escalation_patterns does NOT re-fire the trigger.
  update public.stakeholders
  set current_escalation_patterns = v_new_patterns
  where id = v_stakeholder_id;

  return null;
end;
$$;
revoke execute on function public.audit_escalation_patterns()
  from public, anon, authenticated;

comment on function public.audit_escalation_patterns is
  'PROJ-35 Phase 35-α — Trigger-Function: re-computes escalation patterns and '
  'appends audit-events for activated/deactivated patterns. Maintains the '
  'current_escalation_patterns snapshot on stakeholders.';

-- ---------------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------------
-- Auf stakeholders: AFTER UPDATE OF relevant cols + AFTER INSERT.
-- Wichtig: `OF`-Klausel verhindert Recursion (current_escalation_patterns
-- ist NICHT in der Liste, also re-fired sich der Trigger nicht selbst).
drop trigger if exists stakeholders_audit_escalation_patterns_upd
  on public.stakeholders;
create trigger stakeholders_audit_escalation_patterns_upd
  after update of attitude, conflict_potential, decision_authority, influence
  on public.stakeholders
  for each row execute function public.audit_escalation_patterns();

drop trigger if exists stakeholders_audit_escalation_patterns_ins
  on public.stakeholders;
create trigger stakeholders_audit_escalation_patterns_ins
  after insert on public.stakeholders
  for each row execute function public.audit_escalation_patterns();

-- Auf stakeholder_personality_profiles: AFTER UPDATE OF Big5-fremd-cols + AFTER INSERT.
drop trigger if exists spp_audit_escalation_patterns_upd
  on public.stakeholder_personality_profiles;
create trigger spp_audit_escalation_patterns_upd
  after update of agreeableness_fremd, emotional_stability_fremd
  on public.stakeholder_personality_profiles
  for each row execute function public.audit_escalation_patterns();

drop trigger if exists spp_audit_escalation_patterns_ins
  on public.stakeholder_personality_profiles;
create trigger spp_audit_escalation_patterns_ins
  after insert on public.stakeholder_personality_profiles
  for each row execute function public.audit_escalation_patterns();
