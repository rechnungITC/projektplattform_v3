-- =============================================================================
-- PROJ-36 Phase 36-α follow-up — trigger function REST-RPC lockdown (RE-DEPLOY)
-- =============================================================================
-- Re-deploy of commit f6089f8's lockdown step. Pairs with the schema
-- re-deploy at 20260504400000.
--
-- Mirror the PROJ-24 `_resolve_role_rate_lockdown` pattern.
--
-- Trigger functions are SECURITY DEFINER (required so they bypass RLS when
-- propagating outline_path / wbs_code / derived_* changes). Without an
-- explicit REVOKE, Supabase exposes them via /rest/v1/rpc/ to both
-- `anon` and `authenticated` roles — the security advisor flags this as
-- a privilege-escalation risk (a signed-in user could call the trigger
-- function directly with crafted NEW/OLD records, bypassing RLS).
--
-- Trigger functions are server-only helpers; no caller code should reach
-- them via REST. Revoke the implicit PUBLIC EXECUTE grant.
-- =============================================================================

revoke execute on function public.tg_work_items_36a_outline_path_self_fn() from public, anon, authenticated;
revoke execute on function public.tg_work_items_36a_outline_path_cascade_fn() from public, anon, authenticated;
revoke execute on function public.tg_work_items_36a_wbs_code_autogen_fn() from public, anon, authenticated;
revoke execute on function public.tg_work_items_36a_rollup_recompute_fn() from public, anon, authenticated;

-- The trigger system itself runs these functions in the postgres role context
-- (SECURITY DEFINER inherits the function-owner's privileges, which is
-- postgres for migrations). Revoking PUBLIC/anon/authenticated does NOT
-- affect trigger execution — only the REST-RPC surface is closed.
