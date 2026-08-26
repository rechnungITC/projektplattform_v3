-- PROJ-Y-45q — die β-Regel für Fotos wirklich einlösen (QA-Befund F-1, High).
--
-- BEFUND. AC-45ε.16/.17 sagen zu, dass JEDES Projektmitglied Fotos hinzufügen
-- darf, Betrachter eingeschlossen. Über die echte Route war das unmöglich: der
-- Betrachter bekam `42501` aus `document_tree_nodes_insert`, weil L31 das Foto
-- als echtes DMS-Dokument ablegt und PROJ-79 dort nur `lead`/`editor`/Admin
-- schreiben lässt. Live gemessen: Betrachter 422, Bauleitung 201.
--
-- NUTZER-ENTSCHEID. Über eine `SECURITY DEFINER`-Funktion lösen, L31 bleibt.
-- Die Alternative (Kriterium auf `lead`/`editor` verengen) hätte L15s Begründung
-- zurückgenommen — wer einen Mangel melden darf, darf ihn auch fotografieren.
--
-- WAS HIER **NICHT** PASSIERT, und das ist der Kern: PROJ-79s Policies bleiben
-- unangetastet. Ein Betrachter bekommt KEIN allgemeines Schreibrecht auf den
-- Dokumentenbaum — er bekommt genau drei eng geschnittene Wege, und die Enge ist
-- die Sicherheitsaussage:
--
--   1. Knoten entstehen ausschliesslich UNTER dem Fotoordner des Projekts. Der
--      Aufrufer kann den Zielordner nicht wählen; die Funktion setzt ihn.
--   2. Eine Dokumentzeile entsteht nur an einem Knoten, dessen Elternteil GENAU
--      dieser Fotoordner ist, und nur mit einem Bild-Format. Ein beliebiger
--      fremder Knoten ist damit unerreichbar.
--   3. Gelöscht werden darf nur ein HALB angelegter Knoten — ohne Dokumentzeile
--      und ohne Fotoverknüpfung. Nichts mit Inhalt.
--
-- REIHENFOLGE. Unverändert die von PROJ-79: Knoten -> Objekt -> Dokumentzeile.
-- Gemessen, warum das so bleiben muss: `documents_bucket_insert` prüft
-- `_dms_object_access(name)` mit `p_allow_orphan = false`, ein Hochladen VOR dem
-- Knoten wird also abgewiesen. Und die Dokumentzeile zuerst zu schreiben wäre
-- schlechter, weil der Quota-Trigger auf ihrem INSERT feuert und es (Befund F-2,
-- PROJ-Y-45p) kein Dekrement gibt — ein fehlgeschlagener Upload würde dauerhaft
-- Speicherplatz kosten.

-- ---------------------------------------------------------------------------
-- 1) Knoten anlegen — Ordner wird gesetzt, nicht gewählt
-- ---------------------------------------------------------------------------
create or replace function public.create_construction_photo_node(
  p_project_id uuid,
  p_name text,
  p_slug text
) returns table (folder_id uuid, node_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_folder uuid;
  v_node uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select tenant_id into v_tenant
    from public.projects where id = p_project_id and is_deleted = false;
  if v_tenant is null then
    raise exception 'PROJ-45-e: Projekt nicht gefunden' using errcode = 'P0002';
  end if;
  -- Die EINE Rechtefrage: Projektmitgliedschaft. Bewusst nicht `lead`/`editor`
  -- (das ist der Befund) und bewusst nicht `is_tenant_admin`-only.
  if not public.is_project_member(p_project_id) then
    raise exception 'PROJ-45-e: keine Projektmitgliedschaft' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'PROJ-45-e: Name und Kennung sind erforderlich' using errcode = '22023';
  end if;

  -- Fotoordner: idempotent. Der Wettlauf wird nicht per Sperre gelöst, sondern
  -- vom Unique-Index `document_tree_nodes_root_slug_uk` entschieden — der
  -- Verlierer liest den Gewinner.
  select id into v_folder
    from public.document_tree_nodes
   where project_id = p_project_id and parent_id is null
     and slug = 'baufotos' and deleted_at is null;
  if v_folder is null then
    begin
      insert into public.document_tree_nodes
        (tenant_id, project_id, parent_id, node_type, name, slug, created_by)
      values (v_tenant, p_project_id, null, 'folder', 'Baufotos', 'baufotos', v_caller)
      returning id into v_folder;
    exception when unique_violation then
      select id into v_folder
        from public.document_tree_nodes
       where project_id = p_project_id and parent_id is null
         and slug = 'baufotos' and deleted_at is null;
    end;
  end if;
  if v_folder is null then
    raise exception 'PROJ-45-e: Fotoordner konnte nicht aufgeloest werden' using errcode = 'P0002';
  end if;

  insert into public.document_tree_nodes
    (tenant_id, project_id, parent_id, node_type, name, slug, created_by)
  values (v_tenant, p_project_id, v_folder, 'document', btrim(p_name), btrim(p_slug), v_caller)
  returning id into v_node;

  return query select v_folder, v_node;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Dokumentzeile — nur an einem Knoten IM Fotoordner, nur als Bild
-- ---------------------------------------------------------------------------
create or replace function public.record_construction_photo_document(
  p_node_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_original_filename text,
  p_checksum text,
  p_mime_unsupported_for_rag boolean default true
) returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_node public.document_tree_nodes;
  v_parent public.document_tree_nodes;
  v_row public.documents;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_node from public.document_tree_nodes where id = p_node_id;
  if not found or v_node.deleted_at is not null then
    raise exception 'PROJ-45-e: Knoten nicht gefunden' using errcode = 'P0002';
  end if;
  if not public.is_project_member(v_node.project_id) then
    raise exception 'PROJ-45-e: keine Projektmitgliedschaft' using errcode = '42501';
  end if;

  -- DIE Einschränkung: der Knoten muss im Fotoordner SEINES Projekts liegen.
  -- Ohne sie wäre dies ein allgemeines „jedes Projektmitglied darf jedem
  -- beliebigen Dokumentknoten eine Datei anhängen" und damit eine stille
  -- Aufweichung von PROJ-79 für alle Flächen.
  if v_node.node_type <> 'document' then
    raise exception 'PROJ-45-e: nur Dokumentknoten' using errcode = '22023';
  end if;
  if v_node.parent_id is null then
    raise exception 'PROJ-45-e: Knoten liegt nicht im Fotoordner' using errcode = '42501';
  end if;
  select * into v_parent from public.document_tree_nodes where id = v_node.parent_id;
  if v_parent.slug <> 'baufotos' or v_parent.parent_id is not null
     or v_parent.project_id <> v_node.project_id then
    raise exception 'PROJ-45-e: Knoten liegt nicht im Fotoordner' using errcode = '42501';
  end if;

  -- Nur Bilder. Derselbe Satz, den der Sniffer der Route zulässt.
  if p_mime_type not in ('image/jpeg', 'image/png') then
    raise exception 'PROJ-45-e: nur JPEG und PNG' using errcode = '22023';
  end if;
  if coalesce(p_size_bytes, 0) <= 0 then
    raise exception 'PROJ-45-e: Groesse fehlt' using errcode = '22023';
  end if;

  insert into public.documents
    (tenant_id, tree_node_id, storage_backend, storage_path, mime_type, size_bytes,
     original_filename, checksum, mime_unsupported_for_rag, created_by)
  values
    (v_node.tenant_id, v_node.id, 'internal', p_storage_path, p_mime_type, p_size_bytes,
     p_original_filename, p_checksum, coalesce(p_mime_unsupported_for_rag, true), v_caller)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Aufräumen — nur ein HALB angelegter Knoten
-- ---------------------------------------------------------------------------
create or replace function public.discard_construction_photo_node(
  p_node_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_node public.document_tree_nodes;
  v_parent public.document_tree_nodes;
  v_n int;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_node from public.document_tree_nodes where id = p_node_id;
  if not found then
    return 0;
  end if;
  if not public.is_project_member(v_node.project_id) then
    raise exception 'PROJ-45-e: keine Projektmitgliedschaft' using errcode = '42501';
  end if;
  if v_node.parent_id is null then
    raise exception 'PROJ-45-e: kein Foto-Knoten' using errcode = '42501';
  end if;
  select * into v_parent from public.document_tree_nodes where id = v_node.parent_id;
  if v_parent.slug <> 'baufotos' or v_parent.parent_id is not null then
    raise exception 'PROJ-45-e: kein Foto-Knoten' using errcode = '42501';
  end if;

  -- Nur ein halb angelegter Knoten. Alles mit Inhalt bleibt stehen — dieser Weg
  -- ist die Rücknahme eines fehlgeschlagenen Uploads, kein Löschpfad.
  select count(*) into v_n from public.documents where tree_node_id = p_node_id;
  if v_n > 0 then
    raise exception 'PROJ-45-e: Knoten traegt eine Datei' using errcode = '42501';
  end if;

  delete from public.document_tree_nodes where id = p_node_id;
  return 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte: `authenticated` darf rufen, `anon` UND PUBLIC nicht.
-- PUBLIC rendert mit LEEREM Empfaenger und beginnt daher mit `=` — ein Muster
-- `%=X/%` traefe auch `authenticated=X/postgres` (γ-Lehre B-γ1).
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  for v_sig in
    select unnest(array[
      'public.create_construction_photo_node(uuid, text, text)',
      'public.record_construction_photo_document(uuid, text, text, bigint, text, text, boolean)',
      'public.discard_construction_photo_node(uuid)'
    ])
  loop
    execute format('revoke all on function %s from public', v_sig);
    execute format('revoke all on function %s from anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-Conditions — laut scheitern statt still danebengehen
-- ---------------------------------------------------------------------------
do $$
declare
  v_names constant text[] := array[
    'create_construction_photo_node',
    'record_construction_photo_document',
    'discard_construction_photo_node'
  ];
  v_n int;
begin
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = any(v_names);
  if v_n <> 3 then
    raise exception 'PROJ-Y-45q: erwartet 3 Funktionen, gefunden %', v_n;
  end if;

  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = any(v_names)
     and not prosecdef;
  if v_n <> 0 then
    raise exception 'PROJ-Y-45q: % Funktion(en) nicht SECURITY DEFINER', v_n;
  end if;

  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = any(v_names)
     and not exists (select 1 from unnest(coalesce(proconfig, '{}'::text[])) c
                      where c like 'search_path=%');
  if v_n <> 0 then
    raise exception 'PROJ-Y-45q: % Funktion(en) ohne search_path', v_n;
  end if;

  select count(*) into v_n
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl
   where p.pronamespace = 'public'::regnamespace and p.proname = any(v_names)
     and (acl::text like 'anon=%' or acl::text like '=%');
  if v_n <> 0 then
    raise exception 'PROJ-Y-45q: % ACL-Eintrag(e) fuer anon oder PUBLIC', v_n;
  end if;

  select count(*) into v_n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = any(v_names)
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'PROJ-Y-45q: % Funktion(en) fuer authenticated nicht aufrufbar', v_n;
  end if;

  -- PROJ-79 bleibt unangetastet: die drei Schreib-Policies auf dem
  -- Dokumentenbaum und den Dokumenten muessen unveraendert `lead`/`editor`
  -- fordern. Waere hier etwas aufgeweicht, wuerde diese Migration die Enge
  -- verlieren, die ihre Sicherheitsaussage traegt.
  select count(*) into v_n from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname in ('document_tree_nodes', 'documents')
     and p.polname in ('document_tree_nodes_insert', 'documents_insert')
     and pg_get_expr(p.polwithcheck, p.polrelid) like '%''lead''%'
     and pg_get_expr(p.polwithcheck, p.polrelid) like '%''editor''%';
  if v_n <> 2 then
    raise exception 'PROJ-Y-45q: PROJ-79-Schreibpolicies veraendert (gefunden %)', v_n;
  end if;
end;
$$;

comment on function public.create_construction_photo_node(uuid, text, text) is
  'PROJ-Y-45q: legt einen Dokumentknoten im Fotoordner des Projekts an. Jedes '
  'Projektmitglied darf das (beta-Regel, AC-45e.16/.17); der Zielordner wird '
  'gesetzt, nicht gewaehlt.';
comment on function public.record_construction_photo_document(uuid, text, text, bigint, text, text, boolean) is
  'PROJ-Y-45q: schreibt die Dokumentzeile zu einem Foto. Nur an Knoten IM '
  'Fotoordner und nur fuer JPEG/PNG — diese Enge haelt PROJ-79 unberuehrt.';
comment on function public.discard_construction_photo_node(uuid) is
  'PROJ-Y-45q: nimmt einen HALB angelegten Foto-Knoten zurueck (ohne Datei). '
  'Kein Loeschpfad fuer Inhalte.';
