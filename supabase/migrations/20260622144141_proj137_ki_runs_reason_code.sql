-- PROJ-137: machine-readable WHY a run produced no usable provider output.
-- Additive, nullable. No backfill (Non-Goal). Refines the WHY within error/external_blocked.
-- NOTE: applied to prod 2026-06-22 (registered version 20260622144141); file renamed to
-- match the prod-registered version per PROJ-134 migration-drift convention.
alter table public.ki_runs add column if not exists reason_code text;
alter table public.ki_runs drop constraint if exists ki_runs_reason_code_check;
alter table public.ki_runs add constraint ki_runs_reason_code_check
  check (reason_code is null or reason_code in
    ('no_provider','class3_blocked','provider_error','cost_cap_exceeded','external_ai_disabled'));
comment on column public.ki_runs.reason_code is
  'PROJ-137 — machine-readable WHY a run produced no usable provider output (no_provider / class3_blocked / provider_error / cost_cap_exceeded / external_ai_disabled). NULL = provider ran, empty/normal result is legit. Counterpart to the human-readable error_message.';
