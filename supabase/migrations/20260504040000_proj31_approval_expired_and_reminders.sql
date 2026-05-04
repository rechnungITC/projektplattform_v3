-- =============================================================================
-- PROJ-31 follow-up — auto-expire status + reminder idempotency
-- =============================================================================
-- Adds 'expired' to the approval status enum (set automatically when the
-- deadline passes while still pending) and a `last_reminder_at` timestamp
-- so the daily cron can avoid re-sending the same reminder repeatedly.
--
-- Existing 'rejected' stays for *explicit* rejections by an approver.
-- 'expired' is reserved for *automatic* deadline expiry.
-- =============================================================================

alter table public.decision_approval_state
  drop constraint if exists decision_approval_state_status_check;

alter table public.decision_approval_state
  add constraint decision_approval_state_status_check check (
    status in (
      'draft',
      'pending',
      'approved',
      'rejected',
      'withdrawn',
      'expired'
    )
  );

alter table public.decision_approval_state
  add column if not exists last_reminder_at timestamptz;

comment on column public.decision_approval_state.last_reminder_at is
  'PROJ-31 follow-up — timestamp of the last deadline-reminder dispatch. NULL = never reminded. Used by /api/cron/approval-reminders to avoid duplicates.';
