-- =============================================================================
-- PROJ-31 follow-up — Approval deadline column
-- =============================================================================
-- Adds an optional response deadline to a decision's approval state. The
-- deadline is informational only in this slice (UI shows a countdown +
-- "Frist abgelaufen" badge). Auto-expiry / reminder e-mails are reserved
-- for a follow-up.
-- =============================================================================

alter table public.decision_approval_state
  add column if not exists deadline_at timestamptz;

comment on column public.decision_approval_state.deadline_at is
  'PROJ-31 follow-up — optional response deadline for the approver pool. NULL = no deadline. Currently informational; a worker may later flag overdue states.';
