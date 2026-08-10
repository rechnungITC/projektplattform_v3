-- ---------------------------------------------------------------------------
-- PROJ-Y-115c — Need-to-know gate for the document layer.
--
-- Closes a standing confidentiality hole found while reviewing PROJ-115
-- (CIA finding F4) and confirmed live: the whole DMS chain carried NO
-- confidentiality dimension at all.
--
--   * `document_tree_nodes` / `documents` had no `confidentiality_level`
--     column, so a strict M&A document could not even be marked as such;
--     every project member could read every document in the project.
--   * `storage.objects` policy `documents_bucket_select` only parses the
--     object PATH (tenant seg1 + project seg2) and never touches the
--     `documents` table. A project member could therefore call
--     `createSignedUrl()` with their own authenticated client and bypass
--     the API download proxy entirely — the proxy was the only place that
--     ever resolved a document row, i.e. a sham gate.
--   * `dms_move_node` / `dms_soft_delete_subtree` are SECURITY DEFINER and
--     bypass RLS, so a table-level gate alone would have been circumventable.
--   * `work_item_documents` (the originally registered PROJ-Y-115c scope)
--     was membership-only although `work_items.confidentiality_level` has
--     existed since PROJ-100a.
--
-- Model (user-locked): the level lives on `document_tree_nodes` ONLY.
-- `documents` inherit through `tree_node_id`. Folder semantics:
--   - INSERT inherits upward from the parent (child >= parent, coerced).
--   - explicit downgrade below the parent is rejected (23514).
--   - raising a folder cascades the raise down its whole subtree.
--
-- Reference precedent: PROJ-100a (can_access_classified + RESTRICTIVE
-- sublayer), PROJ-113 (floor rule), PROJ-115 (`external_link_parent_ctx`
-- resolver), PROJ-104 (`deliverable_documents` gate shape).
--
-- Audit functions are patched with the anchor-replace-from-live pattern
-- (never transcribed wholesale) and their EXECUTE grants are restored in
-- the same statement — recreating them silently drops the `authenticated`
-- grant and breaks the PROJ-10 HistoryTab.
--
-- Idempotent throughout. No new dependency.
-- ---------------------------------------------------------------------------

-- Section 1: confidentiality column on the tree ------------------------------
alter table public.document_tree_nodes
  add column if not exists confidentiality_level public.ma_confidentiality_level
    not null default 'standard';

comment on column public.document_tree_nodes.confidentiality_level is
  'PROJ-Y-115c need-to-know level. Documents inherit this via tree_node_id. '
  'Children are floor-enforced >= parent (see _dms_enforce_confidentiality_floor).';

-- Section 2: floor + inheritance triggers ------------------------------------
-- BEFORE: INSERT inherits upward from the parent; UPDATE rejects an explicit
-- downgrade below the parent but still inherits upward on a move.
create or replace function public._dms_enforce_confidentiality_floor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_level public.ma_confidentiality_level;
begin
  if new.parent_id is null then
    return new;
  end if;

  select confidentiality_level into v_parent_level
    from public.document_tree_nodes where id = new.parent_id;

  if v_parent_level is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Inheritance: a node created inside a confidential folder is confidential.
    new.confidentiality_level := greatest(new.confidentiality_level, v_parent_level);
    return new;
  end if;

  -- UPDATE: moving into a higher-classified folder inherits upward.
  if new.parent_id is distinct from old.parent_id then
    new.confidentiality_level := greatest(new.confidentiality_level, v_parent_level);
  end if;

  if new.confidentiality_level < v_parent_level then
    raise exception
      'Vertraulichkeitsstufe (%) darf nicht unter der des uebergeordneten Ordners (%) liegen.',
      new.confidentiality_level, v_parent_level using errcode = '23514';
  end if;

  return new;
end;
$$;
-- Trigger-internal only: Postgres does not check EXECUTE on a trigger function
-- when a trigger fires it, so revoking `authenticated` closes the
-- /rest/v1/rpc surface without breaking the trigger (PROJ-68 precedent).
revoke all on function public._dms_enforce_confidentiality_floor() from public;
revoke all on function public._dms_enforce_confidentiality_floor() from anon;
revoke execute on function public._dms_enforce_confidentiality_floor() from authenticated;

drop trigger if exists document_tree_nodes_confidentiality_floor on public.document_tree_nodes;
create trigger document_tree_nodes_confidentiality_floor
  before insert or update on public.document_tree_nodes
  for each row execute function public._dms_enforce_confidentiality_floor();

-- AFTER: raising a folder raises its whole subtree, so the floor invariant
-- stays true without forcing the caller to walk the tree. Terminates because
-- the recursive CTE already covers all descendants, so re-entrant firings
-- find nothing left below the new level.
create or replace function public._dms_cascade_confidentiality_raise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.confidentiality_level <= old.confidentiality_level then
    return null;
  end if;

  with recursive subtree as (
    select id from public.document_tree_nodes where parent_id = new.id
    union all
    select c.id from public.document_tree_nodes c join subtree s on c.parent_id = s.id
  )
  update public.document_tree_nodes t
     set confidentiality_level = new.confidentiality_level
   where t.id in (select id from subtree)
     and t.confidentiality_level < new.confidentiality_level;

  return null;
end;
$$;
revoke all on function public._dms_cascade_confidentiality_raise() from public;
revoke all on function public._dms_cascade_confidentiality_raise() from anon;
revoke execute on function public._dms_cascade_confidentiality_raise() from authenticated;

drop trigger if exists document_tree_nodes_confidentiality_cascade on public.document_tree_nodes;
create trigger document_tree_nodes_confidentiality_cascade
  after update of confidentiality_level on public.document_tree_nodes
  for each row execute function public._dms_cascade_confidentiality_raise();

-- Section 3: node context resolver (mirror of external_link_parent_ctx) ------
-- Lets the `documents` policies read the owning node's project + level
-- without depending on nested RLS evaluation.
create or replace function public._dms_node_ctx(p_node_id uuid)
returns table (project_id uuid, confidentiality_level public.ma_confidentiality_level)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.project_id, n.confidentiality_level
  from public.document_tree_nodes n
  where n.id = p_node_id;
$$;
revoke all on function public._dms_node_ctx(uuid) from public;
revoke all on function public._dms_node_ctx(uuid) from anon;
grant execute on function public._dms_node_ctx(uuid) to authenticated, service_role;

-- Section 4: RESTRICTIVE need-to-know sublayer on the tree -------------------
-- Additive to the existing PERMISSIVE membership/role policies (PROJ-100a
-- recipe): both must pass. Default level 'standard' makes this a no-op for
-- every non-M&A project.
drop policy if exists document_tree_nodes_confidentiality_select on public.document_tree_nodes;
create policy document_tree_nodes_confidentiality_select on public.document_tree_nodes
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists document_tree_nodes_confidentiality_insert on public.document_tree_nodes;
create policy document_tree_nodes_confidentiality_insert on public.document_tree_nodes
  as restrictive for insert to authenticated
  with check (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists document_tree_nodes_confidentiality_update on public.document_tree_nodes;
create policy document_tree_nodes_confidentiality_update on public.document_tree_nodes
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level))
  with check (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists document_tree_nodes_confidentiality_delete on public.document_tree_nodes;
create policy document_tree_nodes_confidentiality_delete on public.document_tree_nodes
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- Section 5: RESTRICTIVE sublayer on documents (inherited via the node) ------
-- A missing node yields no rows from the resolver -> fail closed.
drop policy if exists documents_confidentiality_select on public.documents;
create policy documents_confidentiality_select on public.documents
  as restrictive for select to authenticated
  using (exists (
    select 1 from public._dms_node_ctx(tree_node_id) c
    where public.can_access_classified(c.project_id, c.confidentiality_level)));

drop policy if exists documents_confidentiality_insert on public.documents;
create policy documents_confidentiality_insert on public.documents
  as restrictive for insert to authenticated
  with check (exists (
    select 1 from public._dms_node_ctx(tree_node_id) c
    where public.can_access_classified(c.project_id, c.confidentiality_level)));

drop policy if exists documents_confidentiality_update on public.documents;
create policy documents_confidentiality_update on public.documents
  as restrictive for update to authenticated
  using (exists (
    select 1 from public._dms_node_ctx(tree_node_id) c
    where public.can_access_classified(c.project_id, c.confidentiality_level)))
  with check (exists (
    select 1 from public._dms_node_ctx(tree_node_id) c
    where public.can_access_classified(c.project_id, c.confidentiality_level)));

drop policy if exists documents_confidentiality_delete on public.documents;
create policy documents_confidentiality_delete on public.documents
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public._dms_node_ctx(tree_node_id) c
    where public.can_access_classified(c.project_id, c.confidentiality_level)));

-- Section 6: storage.objects — resolve the level from the path --------------
-- The object path is `{tenant}/{project}/{tree_node_id}/{filename}`, so
-- segment 3 IS the node id and the policy can resolve the classification.
-- Fail-closed on malformed paths and on tenant/project/node disagreement
-- (no path smuggling). `p_allow_orphan` exists ONLY for the delete branch:
-- once a node is hard-deleted its object carries no classification, and
-- refusing the delete would leave permanently untouchable garbage in the
-- bucket. An orphan reveals nothing about a live confidential document.
create or replace function public._dms_object_access(
  p_name text,
  p_allow_orphan boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_seg  text := split_part(p_name, '/', 1);
  v_project_seg text := split_part(p_name, '/', 2);
  v_node_seg    text := split_part(p_name, '/', 3);
  v_tenant uuid;
  v_project uuid;
  v_node uuid;
  v_node_tenant uuid;
  v_node_project uuid;
  v_level public.ma_confidentiality_level;
begin
  if v_tenant_seg  !~ '^[0-9a-f-]{36}$'
  or v_project_seg !~ '^[0-9a-f-]{36}$'
  or v_node_seg    !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;

  begin
    v_tenant  := v_tenant_seg::uuid;
    v_project := v_project_seg::uuid;
    v_node    := v_node_seg::uuid;
  exception when others then
    return false;
  end;

  -- Retain the PROJ-79 tenant + project defense-in-depth.
  if not public.is_tenant_member(v_tenant) then return false; end if;
  if not public.is_project_member(v_project) then return false; end if;

  select n.tenant_id, n.project_id, n.confidentiality_level
    into v_node_tenant, v_node_project, v_level
    from public.document_tree_nodes n
   where n.id = v_node;

  if not found then
    return p_allow_orphan;
  end if;

  if v_node_tenant <> v_tenant or v_node_project <> v_project then
    return false;
  end if;

  return public.can_access_classified(v_node_project, v_level);
end;
$$;
revoke all on function public._dms_object_access(text, boolean) from public;
revoke all on function public._dms_object_access(text, boolean) from anon;
grant execute on function public._dms_object_access(text, boolean) to authenticated, service_role;

drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select on storage.objects
  for select to authenticated using (
    bucket_id = 'documents' and public._dms_object_access(name));

drop policy if exists documents_bucket_insert on storage.objects;
create policy documents_bucket_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents' and public._dms_object_access(name));

drop policy if exists documents_bucket_update on storage.objects;
create policy documents_bucket_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public._dms_object_access(name))
  with check (bucket_id = 'documents' and public._dms_object_access(name));

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'documents' and public._dms_object_access(name, true));

-- Section 7: close the SECURITY DEFINER RPC bypass ---------------------------
-- Both RPCs run with RLS bypassed, so the table sublayer above does not
-- constrain them. They now re-check clearance explicitly (PROJ-Y-112c
-- precedent). `dms_move_node` additionally requires clearance for the TARGET
-- folder — otherwise an uncleared editor could relocate a node into, or read
-- the name of, a classified folder via the returned row.
create or replace function public.dms_move_node(p_node_id uuid, p_new_parent_id uuid)
returns public.document_tree_nodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_row public.document_tree_nodes;
  v_level public.ma_confidentiality_level;
  v_p_tenant uuid; v_p_project uuid; v_p_type text; v_p_deleted timestamptz;
  v_p_level public.ma_confidentiality_level;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, confidentiality_level
    into v_tenant, v_project, v_level
    from public.document_tree_nodes where id = p_node_id and deleted_at is null;
  if not found then raise exception 'node not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to move node' using errcode='42501';
  end if;
  -- PROJ-Y-115c: need-to-know re-check (RLS is bypassed in here).
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'insufficient clearance for this node' using errcode='42501';
  end if;
  if p_new_parent_id is not null then
    if p_new_parent_id = p_node_id then
      raise exception 'cannot move a node into itself' using errcode='23514';
    end if;
    select tenant_id, project_id, node_type, deleted_at, confidentiality_level
      into v_p_tenant, v_p_project, v_p_type, v_p_deleted, v_p_level
      from public.document_tree_nodes where id = p_new_parent_id;
    if not found or v_p_deleted is not null then
      raise exception 'target parent not found' using errcode='P0002';
    end if;
    if v_p_project <> v_project then
      raise exception 'cannot move node across projects' using errcode='23514';
    end if;
    if v_p_type <> 'folder' then
      raise exception 'target parent must be a folder' using errcode='23514';
    end if;
    -- PROJ-Y-115c: an uncleared caller must not learn about, or write into,
    -- a classified target folder.
    if not public.can_access_classified(v_p_project, v_p_level) then
      raise exception 'target parent not found' using errcode='P0002';
    end if;
    if exists (
      with recursive descendants as (
        select id from public.document_tree_nodes where parent_id = p_node_id
        union all
        select c.id from public.document_tree_nodes c
        join descendants d on c.parent_id = d.id
      )
      select 1 from descendants where id = p_new_parent_id
    ) then
      raise exception 'cannot move a node into its own descendant' using errcode='23514';
    end if;
  end if;
  -- The BEFORE trigger inherits the level upward when the parent changes.
  update public.document_tree_nodes
    set parent_id = p_new_parent_id, updated_at = now()
    where id = p_node_id returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.dms_move_node(uuid, uuid) from public;
revoke all on function public.dms_move_node(uuid, uuid) from anon;
grant execute on function public.dms_move_node(uuid, uuid) to authenticated, service_role;

-- Deleting a subtree must require clearance for the MOST classified node in
-- it: the floor rule permits a `strict` child under a `confidential` folder,
-- so checking only the root would let a confidential-cleared editor destroy
-- strict content.
create or replace function public.dms_soft_delete_subtree(p_node_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_count integer;
  v_max_level public.ma_confidentiality_level;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.document_tree_nodes where id = p_node_id;
  if not found then raise exception 'node not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to delete node' using errcode='42501';
  end if;
  -- PROJ-Y-115c: clearance for the highest level anywhere in the subtree.
  with recursive subtree as (
    select id, confidentiality_level from public.document_tree_nodes where id = p_node_id
    union all
    select c.id, c.confidentiality_level from public.document_tree_nodes c
    join subtree s on c.parent_id = s.id
  )
  select max(confidentiality_level) into v_max_level from subtree;
  if not public.can_access_classified(v_project, v_max_level) then
    raise exception 'insufficient clearance for this subtree' using errcode='42501';
  end if;
  with recursive subtree as (
    select id from public.document_tree_nodes where id = p_node_id
    union all
    select c.id from public.document_tree_nodes c
    join subtree s on c.parent_id = s.id
  ),
  del_docs as (
    update public.documents d set deleted_at = now()
    where d.tree_node_id in (select id from subtree) and d.deleted_at is null
    returning 1
  ),
  del_nodes as (
    update public.document_tree_nodes n set deleted_at = now()
    where n.id in (select id from subtree) and n.deleted_at is null
    returning 1
  )
  select count(*) into v_count from del_nodes;
  return v_count;
end;
$$;
revoke all on function public.dms_soft_delete_subtree(uuid) from public;
revoke all on function public.dms_soft_delete_subtree(uuid) from anon;
grant execute on function public.dms_soft_delete_subtree(uuid) to authenticated, service_role;

-- Section 8: work_item_documents (original registered PROJ-Y-115c scope) ----
-- `work_items.confidentiality_level` exists since PROJ-100a, so this is a
-- pure policy addition. Shape mirrors the working `deliverable_documents`
-- gate from PROJ-104.
drop policy if exists wid_confidentiality_select on public.work_item_documents;
create policy wid_confidentiality_select on public.work_item_documents
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.work_items wi
    where wi.id = work_item_id
      and public.can_access_classified(wi.project_id, wi.confidentiality_level)));

drop policy if exists wid_confidentiality_insert on public.work_item_documents;
create policy wid_confidentiality_insert on public.work_item_documents
  as restrictive for insert to authenticated
  with check (exists (
    select 1 from public.work_items wi
    where wi.id = work_item_id
      and public.can_access_classified(wi.project_id, wi.confidentiality_level)));

drop policy if exists wid_confidentiality_update on public.work_item_documents;
create policy wid_confidentiality_update on public.work_item_documents
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.work_items wi
    where wi.id = work_item_id
      and public.can_access_classified(wi.project_id, wi.confidentiality_level)))
  with check (exists (
    select 1 from public.work_items wi
    where wi.id = work_item_id
      and public.can_access_classified(wi.project_id, wi.confidentiality_level)));

drop policy if exists wid_confidentiality_delete on public.work_item_documents;
create policy wid_confidentiality_delete on public.work_item_documents
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.work_items wi
    where wi.id = work_item_id
      and public.can_access_classified(wi.project_id, wi.confidentiality_level)));

-- Section 9: audit surface ---------------------------------------------------
-- Both functions are patched by ANCHOR-REPLACE-FROM-LIVE rather than
-- transcribed: `_tracked_audit_columns` has 63 CASE branches and
-- `can_read_audit_entry` 57, so a hand-copy would silently drop sibling
-- entities (including ones added by concurrently-developed slices).
--
-- The anchors are matched WHITESPACE-TOLERANTLY (`\s+` between every token).
-- This matters because `pg_get_functiondef` returns the body as it was
-- written: prod carries these branches on one line, while a fresh apply from
-- the repo files reproduces PROJ-115's multi-line formatting. A literal
-- `replace()` matched prod but aborted the schema-drift shadow DB.
--
-- The hard raise is deliberately KEPT: if a branch exists but no longer has
-- the expected shape, the classification gate would be silently missing, so
-- the migration must fail loudly instead of leaving the audit trail ungated.

-- 9a. Track the new column so a classification change is auditable.
do $patch_tracked$
declare
  v_def text;
  v_pat text := 'when\s+''document_tree_nodes''\s+then\s+array\[''name'',''parent_id'',''sort_order'',''deleted_at''\]';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tracked_audit_columns';
  if v_def is null then
    raise exception 'PROJ-Y-115c: _tracked_audit_columns not found';
  end if;

  -- Idempotency: skip once the column is already tracked. Matching the pair
  -- (not just the column name) keeps this specific to the DMS branch — other
  -- entities legitimately track `confidentiality_level` too.
  if v_def !~ 'deleted_at''\s*,\s*''confidentiality_level' then
    if v_def !~ v_pat then
      raise exception 'PROJ-Y-115c: document_tree_nodes anchor not found in live _tracked_audit_columns';
    end if;
    v_def := regexp_replace(v_def, v_pat, 'when ''document_tree_nodes'' then array[''name'',''parent_id'',''sort_order'',''deleted_at'',''confidentiality_level'']');
    execute v_def;
    -- Recreating drops the grants; restore exactly what was live.
    execute 'grant execute on function public._tracked_audit_columns(text) to authenticated, service_role';
  end if;
end
$patch_tracked$;

-- 9b. The audit trail itself must not leak classified rows. `can_read_audit_entry`
-- is SECURITY DEFINER, so its lookups bypass RLS: without an explicit check an
-- uncleared member could read a strict folder's name (and now its classification
-- changes) through the PROJ-10 history tab. Adding the predicate to the lookup
-- leaves v_project NULL, which the function already treats as "deny".
do $patch_audit_read$
declare
  v_def text;
  v_pat_document_tree_nodes text := 'when\s+''document_tree_nodes''\s+then\s+select\s+project_id\s+into\s+v_project\s+from\s+public\.document_tree_nodes\s+where\s+id\s+=\s+p_entity_id;';
  v_pat_documents text := 'when\s+''documents''\s+then\s+select\s+n\.project_id\s+into\s+v_project\s+from\s+public\.documents\s+dd\s+join\s+public\.document_tree_nodes\s+n\s+on\s+n\.id\s+=\s+dd\.tree_node_id\s+where\s+dd\.id\s+=\s+p_entity_id;';
  v_pat_work_item_documents text := 'when\s+''work_item_documents''\s+then\s+select\s+wi\.project_id\s+into\s+v_project\s+from\s+public\.work_item_documents\s+wid\s+join\s+public\.work_items\s+wi\s+on\s+wi\.id\s+=\s+wid\.work_item_id\s+where\s+wid\.id\s+=\s+p_entity_id;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_read_audit_entry';
  if v_def is null then
    raise exception 'PROJ-Y-115c: can_read_audit_entry not found';
  end if;

  if position('projy115c' in v_def) = 0 then
    if v_def !~ v_pat_document_tree_nodes then
      raise exception 'PROJ-Y-115c: document_tree_nodes audit anchor not found (shape changed?)';
    end if;
    v_def := regexp_replace(v_def, v_pat_document_tree_nodes, 'when ''document_tree_nodes'' then select n.project_id into v_project from public.document_tree_nodes n where n.id = p_entity_id and public.can_access_classified(n.project_id, n.confidentiality_level); /* projy115c */');
    if v_def !~ v_pat_documents then
      raise exception 'PROJ-Y-115c: documents audit anchor not found (shape changed?)';
    end if;
    v_def := regexp_replace(v_def, v_pat_documents, 'when ''documents'' then select n.project_id into v_project from public.documents dd join public.document_tree_nodes n on n.id = dd.tree_node_id where dd.id = p_entity_id and public.can_access_classified(n.project_id, n.confidentiality_level);');
    if v_def !~ v_pat_work_item_documents then
      raise exception 'PROJ-Y-115c: work_item_documents audit anchor not found (shape changed?)';
    end if;
    v_def := regexp_replace(v_def, v_pat_work_item_documents, 'when ''work_item_documents'' then select wi.project_id into v_project from public.work_item_documents wid join public.work_items wi on wi.id = wid.work_item_id where wid.id = p_entity_id and public.can_access_classified(wi.project_id, wi.confidentiality_level);');
    execute v_def;
    execute 'grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated, service_role';
  end if;
end
$patch_audit_read$;

-- Section 10: post-conditions -----------------------------------------------
do $verify$
declare
  v_missing text := '';
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='document_tree_nodes'
      and column_name='confidentiality_level') then
    v_missing := v_missing || ' confidentiality_level';
  end if;

  -- 4 tree + 4 document + 4 work_item_documents restrictive policies
  if (select count(*) from pg_policy p
        join pg_class c on c.oid=p.polrelid
        join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public'
         and c.relname in ('document_tree_nodes','documents','work_item_documents')
         and p.polpermissive = false) <> 12 then
    v_missing := v_missing || ' restrictive_policies';
  end if;

  -- every documents-bucket policy must route through the resolver
  if (select count(*) from pg_policy p
        join pg_class c on c.oid=p.polrelid
        join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='storage' and c.relname='objects'
         and p.polname like 'documents_bucket_%'
         and (coalesce(pg_get_expr(p.polqual, p.polrelid), '')
              || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
             like '%_dms_object_access%') <> 4 then
    v_missing := v_missing || ' bucket_policies';
  end if;

  if position('confidentiality_level' in
      array_to_string(public._tracked_audit_columns('document_tree_nodes'), ',')) = 0 then
    v_missing := v_missing || ' audit_tracked_column';
  end if;

  if v_missing <> '' then
    raise exception 'PROJ-Y-115c post-condition failed:%', v_missing;
  end if;
end
$verify$;
