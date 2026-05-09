-- PROJ-54-γ — Async cost-line recompute marker.
--
-- A small status column on `resources` so the after()-hook in
-- PATCH /api/resources/[rid] can mark a recompute as 'pending' /
-- 'running' / 'failed', and the UI can surface a banner when the
-- async recompute didn't make it through.
--
-- NULL = idle/no-recompute-pending. The CHECK constraint allows
-- only the documented states. The column is intentionally NOT
-- added to `_tracked_audit_columns('resources')` — it's a
-- transient operational status, not a business-data field.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS recompute_status text NULL;

ALTER TABLE public.resources
  DROP CONSTRAINT IF EXISTS resources_recompute_status_check;

ALTER TABLE public.resources
  ADD CONSTRAINT resources_recompute_status_check
  CHECK (
    recompute_status IS NULL
    OR recompute_status IN ('pending', 'running', 'failed')
  );

COMMENT ON COLUMN public.resources.recompute_status IS
  'PROJ-54-γ — async cost-line recompute status. NULL = idle. '
  'Set by PATCH /api/resources/[rid] after()-hook. UI banner on failed.';
