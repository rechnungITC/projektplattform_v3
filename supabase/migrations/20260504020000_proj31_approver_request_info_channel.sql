alter table public.decision_approvers
  add column if not exists request_info_comment text,
  add column if not exists request_info_at timestamptz;
comment on column public.decision_approvers.request_info_comment is
  'PROJ-31 follow-up — most recent comment from the approver requesting more info from the PM. Overwritten on each new request.';
comment on column public.decision_approvers.request_info_at is
  'PROJ-31 follow-up — timestamp of the most recent info-request. NULL if the approver never asked for info.';
