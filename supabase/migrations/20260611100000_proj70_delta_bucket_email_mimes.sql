-- =============================================================================
-- PROJ-70-δ — extend context-source-uploads bucket MIME allowlist by the
-- two email formats (.eml RFC822 + .msg Outlook CFB).
-- =============================================================================
-- CIA-approved 2026-06-06: mailparser@3.9.9 + @kenjiuno/msgreader@1.28.0
-- (both APPROVED_WITH_FOLLOWUPS). No table-schema change in δ — email
-- headers land in the existing `context_sources.source_metadata` JSONB
-- (Lock-5). This migration only widens the bucket-level MIME guard that
-- γ introduced as belt-and-suspenders below the API-layer allowlist.
--
-- Same tolerant DO-block pattern as the γ bucket migration: the Storage
-- extension column `allowed_mime_types` doesn't exist on the
-- schema-drift shadow-DB, so we only touch it when present.
-- =============================================================================

do $bucket_email_mimes$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'message/rfc822',
      'application/vnd.ms-outlook'
    ]
    where id = 'context-source-uploads';
  end if;
end
$bucket_email_mimes$;

-- =============================================================================
-- Smoke checks (static)
-- =============================================================================
do $smoke$
declare
  v_bucket_count int;
begin
  -- Bucket still exists and stays private (universal columns only —
  -- allowed_mime_types is unavailable on the shadow-DB).
  select count(*) into v_bucket_count from storage.buckets
  where id = 'context-source-uploads' and public = false;
  if v_bucket_count <> 1 then
    raise exception 'smoke-fail: bucket context-source-uploads missing or misconfigured';
  end if;

  raise notice 'PROJ-70 delta smoke checks passed (bucket present + private)';
end
$smoke$;
