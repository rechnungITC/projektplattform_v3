-- PROJ-75: Class-3 re-classification after parse.
-- Additive columns supporting full-text privacy screening (ingestion) + the
-- one-shot backfill sweep over the existing truncated backlog.

alter table public.context_sources
  add column if not exists full_text_classified_at timestamptz,
  add column if not exists classification_unverified boolean not null default false;

comment on column public.context_sources.full_text_classified_at is
  'PROJ-75: timestamp when the FULL parsed document text (not only the 8000-char content_excerpt) was screened for PII. NULL = not yet full-text screened; drives backfill idempotency.';

comment on column public.context_sources.classification_unverified is
  'PROJ-75: true when the backfill could not re-derive the full text (missing storage file / re-parse error). Existing privacy_class is kept; the row is surfaced for manual DSGVO review.';

-- Partial index to drive the one-shot backfill sweep over not-yet-screened rows.
create index if not exists idx_context_sources_fulltext_pending
  on public.context_sources (tenant_id)
  where full_text_classified_at is null;
