-- ---------------------------------------------------------------------------
-- PROJ-100b — Security hygiene (AC-100b-10): revoke anon/public EXECUTE on the
-- three need-to-know RPCs. Defense-in-depth fail-closed: even if a route were
-- misconfigured to reach these as the anon role, the call is refused at the DB.
-- authenticated retains EXECUTE. Idempotent. Followup from the 100a QA.
--
-- Signatures reflect the current (post-100b) shapes:
--   can_access_classified(uuid, ma_confidentiality_level)
--   grant_confidentiality_clearance(uuid, uuid, ma_confidentiality_level, timestamptz, uuid)
--   revoke_confidentiality_clearance(uuid, uuid)
-- ---------------------------------------------------------------------------

revoke execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) from public, anon;
grant execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) to authenticated;

revoke execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz, uuid) from public, anon;
grant execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz, uuid) to authenticated;

revoke execute on function public.revoke_confidentiality_clearance(uuid, uuid) from public, anon;
grant execute on function public.revoke_confidentiality_clearance(uuid, uuid) to authenticated;
