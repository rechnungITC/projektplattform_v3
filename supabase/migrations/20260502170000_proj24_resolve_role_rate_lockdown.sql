-- =============================================================================
-- PROJ-24 Phase 24-α follow-up: lock down _resolve_role_rate
-- =============================================================================
-- Security advisor finding (lint 0029) on PROJ-24-α apply:
--
--   `public._resolve_role_rate(uuid, text, date)` is SECURITY DEFINER and was
--   granted to `authenticated`. Since the function returns a `role_rates` row
--   (which carries Class-3 `daily_rate`), this would let any signed-in user
--   query rates of any tenant via REST RPC — RLS does NOT apply to SECURITY
--   DEFINER calls.
--
-- Fix: revoke EXECUTE from `authenticated`. The cost-calc engine in
-- `src/lib/cost/role-rate-lookup.ts` (Phase 24-β) runs server-side with
-- service_role (admin-client), which already carries implicit execute
-- privilege. No call path from authenticated user code is needed.
--
-- Why not SECURITY INVOKER instead?
--   - INVOKER would let RLS handle the visibility, BUT the engine MUST run
--     with service_role anyway because the cost-line synthetic INSERT runs
--     under service_role (PROJ-22 budget-postings pattern). Two different
--     auth contexts inside the same engine path = bug surface.
--   - DEFINER + lockdown signals "internal server-only helper" cleanly.
-- =============================================================================

revoke execute on function public._resolve_role_rate(uuid, text, date)
  from authenticated;
