-- =============================================================================
-- PROJ-31 follow-up — extend decision_approval_events check constraint with
-- the new 'approver_requested_info' event type emitted when an approver
-- asks the PM for more info instead of approving/rejecting outright.
--
-- This pairs with 20260504020000 (request_info_comment / request_info_at
-- columns on decision_approvers) and the API route extension that emits
-- the audit event.
-- =============================================================================

alter table public.decision_approval_events
  drop constraint if exists decision_approval_events_event_type_check;

alter table public.decision_approval_events
  add constraint decision_approval_events_event_type_check
  check (event_type in (
    'submitted_for_approval',
    'approver_responded',
    'quorum_reached',
    'quorum_unreachable',
    'withdrawn',
    'revised',
    'token_renewed',
    'approver_withdrawn',
    'approver_requested_info'
  ));
