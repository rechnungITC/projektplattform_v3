-- =============================================================================
-- PROJ-29 Block B — harden search_path on 3 SECURITY DEFINER / IMMUTABLE
-- functions flagged by Supabase advisor `function_search_path_mutable`.
-- =============================================================================
-- Each function below is `CREATE OR REPLACE`-d with the IDENTICAL body and
-- signature it had in its source migration; the only delta is an explicit
-- `SET search_path = public, pg_temp` clause. This pins the schema-resolution
-- so an attacker cannot shadow `public.<helper>` via a malicious schema on
-- the role's search_path.
--
-- Bodies copied verbatim from:
--   - public.enforce_decision_immutability        ← 20260429140000_proj20_decisions_immutability_trigger.sql
--   - public.enforce_ki_suggestion_immutability   ← 20260429180000_proj12_immutability_trigger_and_rls_fixes.sql
--   - public._is_supported_currency               ← 20260430200000_proj22_budget_modul.sql
--
-- Trigger wirings (created in the source migrations) are unaffected by
-- CREATE OR REPLACE FUNCTION — they continue to call the function body.
-- =============================================================================

-- 1) enforce_decision_immutability — PROJ-20 H1+M1 trigger fn
create or replace function public.enforce_decision_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_flip_token text;
begin
  v_flip_token := nullif(current_setting('decisions.allow_revise_flip', true), '');
  if v_flip_token = '1' then
    perform set_config('decisions.allow_revise_flip', '', true);

    if NEW.is_revised <> true or OLD.is_revised <> false then
      raise exception
        'enforce_decision_immutability: flip path may only set is_revised true (was %, now %)',
        OLD.is_revised, NEW.is_revised
        using errcode = 'check_violation';
    end if;
    if NEW.title                  is distinct from OLD.title
       or NEW.decision_text          is distinct from OLD.decision_text
       or NEW.rationale              is distinct from OLD.rationale
       or NEW.decided_at             is distinct from OLD.decided_at
       or NEW.decider_stakeholder_id is distinct from OLD.decider_stakeholder_id
       or NEW.context_phase_id       is distinct from OLD.context_phase_id
       or NEW.context_risk_id        is distinct from OLD.context_risk_id
       or NEW.supersedes_decision_id is distinct from OLD.supersedes_decision_id
       or NEW.tenant_id              is distinct from OLD.tenant_id
       or NEW.project_id             is distinct from OLD.project_id
       or NEW.created_by             is distinct from OLD.created_by
       or NEW.created_at             is distinct from OLD.created_at
    then
      raise exception
        'enforce_decision_immutability: flip path may only change is_revised'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  raise exception
    'decisions are immutable. Create a revision via POST /api/projects/[id]/decisions with supersedes_decision_id.'
    using errcode = 'check_violation';
end;
$$;


-- 2) enforce_ki_suggestion_immutability — PROJ-12 H2 trigger fn
create or replace function public.enforce_ki_suggestion_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.status in ('accepted', 'rejected') then
    raise exception
      'ki_suggestions in status % are sealed and cannot be updated', OLD.status
      using errcode = 'check_violation';
  end if;

  if NEW.tenant_id is distinct from OLD.tenant_id
     or NEW.project_id is distinct from OLD.project_id
     or NEW.ki_run_id is distinct from OLD.ki_run_id
     or NEW.purpose is distinct from OLD.purpose
     or NEW.original_payload is distinct from OLD.original_payload
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception
      'ki_suggestions: immutable columns cannot change'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;


-- 3) _is_supported_currency — PROJ-22 budget currency whitelist
create or replace function public._is_supported_currency(p_currency text)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $func$
  select p_currency in ('EUR','USD','CHF','GBP','JPY')
$func$;
