-- =============================================================================
-- PROJ-31 fix M1: harden two new functions with SET search_path = public
-- =============================================================================
-- QA found that the two new functions introduced by 20260502120000 lacked
-- `SET search_path = public`, re-opening the `function_search_path_mutable`
-- Supabase advisor class that PROJ-29 had closed (baseline = 0). Both
-- functions are non-SECURITY-DEFINER so privilege-escalation impact is
-- limited, but the V3 hygiene rule is "all new functions get search_path".
--
-- This migration drops + re-creates both functions with the SET clause.
-- Triggers attached to them are unaffected (they reference the function
-- by name; CREATE OR REPLACE rewrites the body in place).
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create or replace function public.enforce_approval_event_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'decision_approval_events are append-only. UPDATE and DELETE forbidden.'
    using errcode = 'check_violation';
end;
$$;

revoke execute on function public.enforce_approval_event_immutability()
  from public, anon, authenticated;
