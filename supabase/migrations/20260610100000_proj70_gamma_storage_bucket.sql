-- =============================================================================
-- PROJ-70-γ — Storage Bucket + RLS + context_sources file-upload columns
-- =============================================================================
-- Adds Supabase Storage bucket `context-source-uploads` for kickoff
-- artefact raw files (PDF/DOCX/TXT/MD) plus 3 file-metadata columns
-- on `context_sources`. RLS on `storage.objects` keeps every tenant
-- inside its own path prefix.
--
-- CIA-approved 2026-06-04 with substitution: pdf-parse → pdfjs-dist.
-- 8 Hardening-AC enforced at the API layer; bucket-level guards (size +
-- MIME) are belt-and-suspenders.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Bucket — private, 25 MB cap, MIME allowlist
-- ---------------------------------------------------------------------------
-- Universal-columns INSERT (id/name/public) works on stripped-down
-- postgres shadow-DBs (schema-drift CI). The optional Supabase Storage
-- extension columns `file_size_limit` + `allowed_mime_types` are wired
-- via a tolerant DO-block so the same migration applies cleanly both
-- to real Supabase + plain postgres.
insert into storage.buckets (id, name, public)
values ('context-source-uploads', 'context-source-uploads', false)
on conflict (id) do update set public = excluded.public;

do $bucket_limits$
begin
  -- file_size_limit (25 MB) — only set if the column exists.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 26214400
    where id = 'context-source-uploads';
  end if;

  -- allowed_mime_types — only set if the column exists.
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
      'text/markdown'
    ]
    where id = 'context-source-uploads';
  end if;
end
$bucket_limits$;

-- ---------------------------------------------------------------------------
-- 2. RLS on storage.objects — tenant-prefix-match
-- ---------------------------------------------------------------------------
-- Path layout: `{tenant_id_uuid}/{context_source_id_uuid}/{filename}`.
-- A row's `name` column carries this full path; we extract the tenant_id
-- from the first segment and check `is_tenant_member`.

drop policy if exists context_source_uploads_select on storage.objects;
create policy context_source_uploads_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'context-source-uploads'
    and (
      -- safe-parse the first path-segment as uuid
      split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
      and is_tenant_member((split_part(name, '/', 1))::uuid)
    )
  );

drop policy if exists context_source_uploads_insert on storage.objects;
create policy context_source_uploads_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'context-source-uploads'
    and (
      split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
      and is_tenant_member((split_part(name, '/', 1))::uuid)
    )
  );

drop policy if exists context_source_uploads_update on storage.objects;
create policy context_source_uploads_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'context-source-uploads'
    and (
      split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
      and is_tenant_member((split_part(name, '/', 1))::uuid)
    )
  )
  with check (
    bucket_id = 'context-source-uploads'
    and (
      split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
      and is_tenant_member((split_part(name, '/', 1))::uuid)
    )
  );

drop policy if exists context_source_uploads_delete on storage.objects;
create policy context_source_uploads_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'context-source-uploads'
    and (
      split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
      and is_tenant_member((split_part(name, '/', 1))::uuid)
    )
  );


-- ---------------------------------------------------------------------------
-- 3. context_sources — 3 new file-metadata columns
-- ---------------------------------------------------------------------------
-- All nullable: legacy JSON-path uploads have no file. The size-check
-- constraint enforces non-zero file_size when set (defense-in-depth
-- against bug-injected empty rows).

alter table public.context_sources
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes integer
    check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 26214400));

comment on column public.context_sources.original_filename is
  'PROJ-70-γ: filename as uploaded by user; null when ingested via JSON path.';
comment on column public.context_sources.mime_type is
  'PROJ-70-γ: MIME type validated by magic-byte sniff (not Content-Type-Header trust).';
comment on column public.context_sources.file_size_bytes is
  'PROJ-70-γ: raw file size in bytes. Bucket-cap is 25 MB; CHECK enforces > 0.';


-- =============================================================================
-- Smoke checks (static)
-- =============================================================================
do $smoke$
declare
  v_bucket_count int;
  v_policy_count int;
  v_columns_count int;
begin
  -- 1. Bucket exists with the right base config (only universal columns
  --    checked here; the Storage-extension columns file_size_limit +
  --    allowed_mime_types are set via the DO-block above and are not
  --    available on the schema-drift shadow-DB).
  select count(*) into v_bucket_count from storage.buckets
  where id = 'context-source-uploads' and public = false;
  if v_bucket_count <> 1 then
    raise exception 'smoke-fail: bucket context-source-uploads missing or misconfigured';
  end if;

  -- 2. All 4 storage.objects policies present.
  select count(*) into v_policy_count from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'context_source_uploads_select',
      'context_source_uploads_insert',
      'context_source_uploads_update',
      'context_source_uploads_delete'
    );
  if v_policy_count <> 4 then
    raise exception 'smoke-fail: expected 4 context_source_uploads RLS policies, found %', v_policy_count;
  end if;

  -- 3. All 3 new context_sources columns present.
  select count(*) into v_columns_count from information_schema.columns
  where table_schema = 'public'
    and table_name = 'context_sources'
    and column_name in ('original_filename', 'mime_type', 'file_size_bytes');
  if v_columns_count <> 3 then
    raise exception 'smoke-fail: expected 3 new context_sources columns, found %', v_columns_count;
  end if;

  raise notice 'PROJ-70 gamma smoke checks passed (bucket + 4 policies + 3 columns)';
end
$smoke$;
