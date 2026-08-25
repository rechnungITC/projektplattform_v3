-- PROJ-45-ε — Fotodokumentation: Datenschicht
--
-- Tech Design im ε-Block der Spec. Was hier entsteht:
--
--   1. `construction_photos` — die VERKNÜPFUNG. Die Bilddatei selbst ist ein
--      gewöhnliches DMS-Dokument (PROJ-79); dadurch erbt ε Magic-Byte-Prüfung,
--      50-MB-Grenze, Mandanten-Quota, Papierkorb, Vertraulichkeits-Gate und
--      Feld-Audit, ohne eine Zeile eigener Härtung.
--   2. Genau EIN Bezug je Zeile: Mangel ODER Abnahme ODER Bauabschnitt (L32),
--      erzwungen wie γ es für den Abnahme-Bezug führt.
--   3. Schreiben NUR über Funktionen — keine Schreib-Policies (β/γ/`dd_findings`-
--      Rezept). Damit lebt die abweichende Rechteregel an EINER prüfbaren Stelle.
--   4. Q-ε4 — Löschsperre als ADDITIVER Wächter am Dokument, nicht als Änderung
--      der deployten `dms_soft_delete_subtree`. Das DMS löscht WEICH; ein
--      Fremdschlüssel feuert dabei gar nicht (an der Funktion gemessen). Der
--      Wächter greift auf JEDEM Weg, auch bei direkter Änderung durch einen
--      Administrations-Client, und erzeugt KEINEN neuen Hart-Lösch-Blocker, weil
--      der Projekt-Abriss über echtes Löschen kaskadiert (PROJ-148-Lehre).
--   5. Q-ε5 — dritte Art `foto` in `construction_section_blocking_refs`. Die
--      Gewerk-Auskunft bleibt unberührt: an einem Gewerk hängen nie Fotos.
--   6. Q-ε7 — an einer protokollierten Abnahme gilt „Ergänzen ja, Entfernen
--      nein". Der γ-Einfrier-Wächter vergleicht die SPALTEN der Abnahmezeile und
--      sieht eine Verknüpfungstabelle GAR NICHT — ohne die Regel hier wären
--      Fotos nach dem Protokollieren frei löschbar.
--
-- `section_id` trägt bewusst NO ACTION, nicht RESTRICT: beide liefern für das
-- gezielte Entfernen 23503, aber unter RESTRICT entscheidet beim Projekt-Löschen
-- die Feuerreihenfolge der RI-Trigger über Erfolg oder Fehlschlag (in β belegt).
-- Die Zeile hängt zusätzlich per CASCADE am Projekt, wird beim Abriss also
-- zuerst entfernt.
--
-- `taken_on` ist ein DATUM, keine Zeitmarke: der EXIF-Wert `DateTimeOriginal`
-- trägt keine Zeitzone, und eine Zeitmarke daraus zu bauen hiesse, eine Zone zu
-- erfinden. Fachlich zählt der Tag.

create table if not exists public.construction_photos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  document_id   uuid not null references public.documents(id) on delete cascade,
  defect_id     uuid references public.construction_defects(id) on delete cascade,
  acceptance_id uuid references public.construction_acceptances(id) on delete cascade,
  section_id    uuid references public.construction_sections(id),
  caption       text,
  taken_on      date,
  sort_order    integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint construction_photos_one_anchor check (
    (case when defect_id     is not null then 1 else 0 end
   + case when acceptance_id is not null then 1 else 0 end
   + case when section_id    is not null then 1 else 0 end) = 1
  ),
  constraint construction_photos_caption_len check (
    caption is null or char_length(caption) <= 500
  ),
  constraint construction_photos_sort_range check (sort_order between 0 and 9999)
);

comment on table public.construction_photos is
  'PROJ-45-ε: verknuepft ein DMS-Dokument mit genau einem Bau-Bezug (Mangel, Abnahme oder Bauabschnitt). Schreiben nur ueber Funktionen.';

-- Dasselbe Foto zweimal an denselben Bezug zu haengen ist ein Bedienfehler,
-- nicht ein Anwendungsfall. Drei Teil-Indizes, weil der Bezug ein XOR ist.
create unique index if not exists construction_photos_defect_doc_uk
  on public.construction_photos (defect_id, document_id) where defect_id is not null;
create unique index if not exists construction_photos_acceptance_doc_uk
  on public.construction_photos (acceptance_id, document_id) where acceptance_id is not null;
create unique index if not exists construction_photos_section_doc_uk
  on public.construction_photos (section_id, document_id) where section_id is not null;

create index if not exists construction_photos_project_idx
  on public.construction_photos (project_id);
create index if not exists construction_photos_document_idx
  on public.construction_photos (document_id);

alter table public.construction_photos enable row level security;

-- EINE Lese-Policy, KEINE Schreib-Policy (β/γ-Rezept).
drop policy if exists construction_photos_select on public.construction_photos;
create policy construction_photos_select on public.construction_photos
  for select using (public.is_project_member(project_id));

create or replace trigger construction_photos_moddatetime
  before update on public.construction_photos
  for each row execute function extensions.moddatetime('updated_at');

-- ---------------------------------------------------------------------------
-- Wächter: Mandant, Projekt und Bezug muessen zusammenpassen
-- ---------------------------------------------------------------------------
create or replace function public.construction_photo_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project_tenant uuid;
  v_ref_project    uuid;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'PROJ-45-e: Projekt % existiert nicht', NEW.project_id using errcode = '23503';
  end if;
  if v_project_tenant <> NEW.tenant_id then
    raise exception 'PROJ-45-e: Mandant des Fotos passt nicht zum Projekt' using errcode = '23514';
  end if;

  if NEW.defect_id is not null then
    select project_id into v_ref_project from public.construction_defects where id = NEW.defect_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-e: Mangel % existiert nicht', NEW.defect_id using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-e: Mangel gehoert zu einem anderen Projekt' using errcode = '23514';
    end if;
  end if;

  if NEW.acceptance_id is not null then
    select project_id into v_ref_project from public.construction_acceptances where id = NEW.acceptance_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-e: Abnahme % existiert nicht', NEW.acceptance_id using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-e: Abnahme gehoert zu einem anderen Projekt' using errcode = '23514';
    end if;
  end if;

  if NEW.section_id is not null then
    select project_id into v_ref_project from public.construction_sections where id = NEW.section_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-e: Bauabschnitt % existiert nicht', NEW.section_id using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-e: Bauabschnitt gehoert zu einem anderen Projekt' using errcode = '23514';
    end if;
  end if;

  -- Das Dokument muss zu DIESEM Projekt gehoeren und darf nicht im Papierkorb
  -- liegen. Der Projektbezug haengt am Baumknoten, nicht am Dokument selbst.
  if not exists (
    select 1
      from public.documents d
      join public.document_tree_nodes n on n.id = d.tree_node_id
     where d.id = NEW.document_id
       and n.project_id = NEW.project_id
       and d.deleted_at is null
  ) then
    raise exception 'PROJ-45-e: Dokument gehoert nicht zu diesem Projekt oder liegt im Papierkorb'
      using errcode = '23514';
  end if;

  return NEW;
end;
$function$;

revoke all on function public.construction_photo_guard() from public;
revoke all on function public.construction_photo_guard() from anon;
revoke all on function public.construction_photo_guard() from authenticated;

create or replace trigger construction_photos_guard
  before insert or update of tenant_id, project_id, document_id, defect_id, acceptance_id, section_id
  on public.construction_photos
  for each row execute function public.construction_photo_guard();

-- ---------------------------------------------------------------------------
-- Q-ε7: an einer protokollierten Abnahme darf ERGAENZT, aber nicht ENTFERNT werden
-- ---------------------------------------------------------------------------
create or replace function public.construction_photo_removal_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
begin
  -- Beim Projekt-Abriss ist die Elternzeile schon weg; dann gibt es nichts zu
  -- schuetzen und der Waechter darf nicht zum Hart-Lösch-Blocker werden.
  if OLD.acceptance_id is null then
    return OLD;
  end if;
  select status into v_status from public.construction_acceptances where id = OLD.acceptance_id;
  if v_status is null then
    return OLD;
  end if;
  -- Drei der fuenf Statuswerte, `abgesagt` BEWUSST nicht: eine abgesagte Abnahme
  -- hat kein Ergebnis und keine Frist erzeugt (γ hat „absagen" als Korrekturweg
  -- gebaut, δ hat mit L27 entschieden, dass sie nicht blockiert). Fotos eines
  -- Termins, der nie stattgefunden hat, einzufrieren waere Ballast, nicht Schutz.
  if v_status in ('abgenommen', 'abgenommen_unter_vorbehalt', 'verweigert') then
    raise exception
      'PROJ-45-e: Fotos einer protokollierten Abnahme koennen ergaenzt, aber nicht entfernt werden'
      using errcode = '42501';
  end if;
  return OLD;
end;
$function$;

revoke all on function public.construction_photo_removal_guard() from public;
revoke all on function public.construction_photo_removal_guard() from anon;
revoke all on function public.construction_photo_removal_guard() from authenticated;

create or replace trigger construction_photos_removal_guard
  before delete on public.construction_photos
  for each row execute function public.construction_photo_removal_guard();

-- ---------------------------------------------------------------------------
-- Q-ε4: Löschsperre am Dokument (additiv, nicht in der deployten DMS-Funktion)
-- ---------------------------------------------------------------------------
create or replace function public.construction_photo_document_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_refs text;
begin
  -- Nur der Uebergang „nicht im Papierkorb" -> „im Papierkorb" ist gesperrt.
  if OLD.deleted_at is not null or NEW.deleted_at is null then
    return NEW;
  end if;

  select string_agg(label, ', ' order by label) into v_refs
  from (
    select distinct
           case
             when p.defect_id is not null
               then 'Mangel ' || (select d.defect_number::text from public.construction_defects d
                                   where d.id = p.defect_id)
             when p.acceptance_id is not null
               then 'Abnahme ' || (select a.acceptance_number::text from public.construction_acceptances a
                                    where a.id = p.acceptance_id)
             else 'Bauabschnitt ' || coalesce((select s.label from public.construction_sections s
                                                where s.id = p.section_id), '?')
           end as label
      from public.construction_photos p
     where p.document_id = NEW.id
  ) s;

  if v_refs is not null then
    raise exception
      'PROJ-45-e: Das Foto haengt noch an: %. Erst dort loesen, dann loeschen.', v_refs
      using errcode = '42501';
  end if;

  return NEW;
end;
$function$;

revoke all on function public.construction_photo_document_lock() from public;
revoke all on function public.construction_photo_document_lock() from anon;
revoke all on function public.construction_photo_document_lock() from authenticated;

create or replace trigger documents_construction_photo_lock
  before update of deleted_at on public.documents
  for each row execute function public.construction_photo_document_lock();

-- ---------------------------------------------------------------------------
-- Schreibwege (nur ueber Funktionen)
-- ---------------------------------------------------------------------------
-- Rechteregel wie β (L15, AC-45ε.17): ERFASSEN darf jedes Projektmitglied
-- einschliesslich Betrachter; AENDERN und ENTFERNEN nur Projektleitung/
-- Bauleitung oder Mandanten-Administration.
create or replace function public._construction_photo_may_manage(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.is_tenant_admin((select tenant_id from public.projects where id = p_project_id))
      or public.is_project_lead(p_project_id)
$function$;

revoke all on function public._construction_photo_may_manage(uuid) from public;
revoke all on function public._construction_photo_may_manage(uuid) from anon;
revoke all on function public._construction_photo_may_manage(uuid) from authenticated;

create or replace function public.link_construction_photo(
  p_project_id    uuid,
  p_document_id   uuid,
  p_defect_id     uuid default null,
  p_acceptance_id uuid default null,
  p_section_id    uuid default null,
  p_caption       text default null,
  p_taken_on      date default null
)
returns public.construction_photos
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_next   integer;
  v_row    public.construction_photos;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id and is_deleted = false;
  if v_tenant is null then
    raise exception 'PROJ-45-e: Projekt nicht gefunden' using errcode = 'P0002';
  end if;
  -- Erfassen: jedes Projektmitglied, ausdruecklich auch Betrachter (L15).
  if not public.is_project_member(p_project_id) then
    raise exception 'PROJ-45-e: keine Projektmitgliedschaft' using errcode = '42501';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next
    from public.construction_photos
   where (p_defect_id     is not null and defect_id     = p_defect_id)
      or (p_acceptance_id is not null and acceptance_id = p_acceptance_id)
      or (p_section_id    is not null and section_id    = p_section_id);

  insert into public.construction_photos
    (tenant_id, project_id, document_id, defect_id, acceptance_id, section_id,
     caption, taken_on, sort_order, created_by)
  values
    (v_tenant, p_project_id, p_document_id, p_defect_id, p_acceptance_id, p_section_id,
     nullif(btrim(coalesce(p_caption, '')), ''), p_taken_on, coalesce(v_next, 0), v_caller)
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.set_construction_photo_meta(
  p_photo_id       uuid,
  p_caption        text default null,
  p_taken_on       date default null,
  p_clear_caption  boolean default false,
  p_clear_taken_on boolean default false,
  p_sort_order     integer default null
)
returns public.construction_photos
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_row    public.construction_photos;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_row from public.construction_photos where id = p_photo_id;
  if not found then
    raise exception 'PROJ-45-e: Foto nicht gefunden' using errcode = 'P0002';
  end if;
  if not public._construction_photo_may_manage(v_row.project_id) then
    raise exception 'PROJ-45-e: nur Projektleitung, Bauleitung oder Mandanten-Administration'
      using errcode = '42501';
  end if;
  if p_clear_caption and p_caption is not null then
    raise exception 'PROJ-45-e: Bildunterschrift setzen und leeren gleichzeitig ist unzulaessig'
      using errcode = '22023';
  end if;
  if p_clear_taken_on and p_taken_on is not null then
    raise exception 'PROJ-45-e: Aufnahmedatum setzen und leeren gleichzeitig ist unzulaessig'
      using errcode = '22023';
  end if;

  update public.construction_photos
     set caption    = case when p_clear_caption then null
                           when p_caption is not null then nullif(btrim(p_caption), '')
                           else caption end,
         taken_on   = case when p_clear_taken_on then null
                           when p_taken_on is not null then p_taken_on
                           else taken_on end,
         sort_order = coalesce(p_sort_order, sort_order)
   where id = p_photo_id
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.remove_construction_photo(
  p_photo_id     uuid,
  p_delete_file  boolean default false
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_row    public.construction_photos;
  v_others integer;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_row from public.construction_photos where id = p_photo_id;
  if not found then
    raise exception 'PROJ-45-e: Foto nicht gefunden' using errcode = 'P0002';
  end if;
  if not public._construction_photo_may_manage(v_row.project_id) then
    raise exception 'PROJ-45-e: nur Projektleitung, Bauleitung oder Mandanten-Administration'
      using errcode = '42501';
  end if;

  -- Der Entfernen-Waechter (Q-ε7) entscheidet, ob das ueberhaupt zulaessig ist.
  delete from public.construction_photos where id = p_photo_id;

  if not p_delete_file then
    return 0;
  end if;

  -- Datei mit in den Papierkorb — aber nur, wenn kein anderer Bezug sie noch haelt.
  select count(*) into v_others
    from public.construction_photos where document_id = v_row.document_id;
  if v_others > 0 then
    raise exception 'PROJ-45-e: Die Datei haengt noch an % weiteren Stellen', v_others
      using errcode = '42501';
  end if;

  update public.documents set deleted_at = now()
   where id = v_row.document_id and deleted_at is null;
  update public.document_tree_nodes set deleted_at = now()
   where id = (select tree_node_id from public.documents where id = v_row.document_id)
     and deleted_at is null;

  return 1;
end;
$function$;

revoke all on function public.link_construction_photo(uuid, uuid, uuid, uuid, uuid, text, date) from public;
revoke all on function public.link_construction_photo(uuid, uuid, uuid, uuid, uuid, text, date) from anon;
grant execute on function public.link_construction_photo(uuid, uuid, uuid, uuid, uuid, text, date) to authenticated;

revoke all on function public.set_construction_photo_meta(uuid, text, date, boolean, boolean, integer) from public;
revoke all on function public.set_construction_photo_meta(uuid, text, date, boolean, boolean, integer) from anon;
grant execute on function public.set_construction_photo_meta(uuid, text, date, boolean, boolean, integer) to authenticated;

revoke all on function public.remove_construction_photo(uuid, boolean) from public;
revoke all on function public.remove_construction_photo(uuid, boolean) from anon;
grant execute on function public.remove_construction_photo(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lesende Auswertung: Fotozahl je Bezug (AC-45ε.15), SECURITY INVOKER
-- ---------------------------------------------------------------------------
create or replace function public.construction_photo_counts(p_project_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'project_id', p_project_id,
    'total', (select count(*) from public.construction_photos where project_id = p_project_id),
    'by_defect', coalesce((
      select jsonb_object_agg(defect_id::text, n) from (
        select defect_id, count(*) as n from public.construction_photos
         where project_id = p_project_id and defect_id is not null group by defect_id
      ) g), '{}'::jsonb),
    'by_acceptance', coalesce((
      select jsonb_object_agg(acceptance_id::text, n) from (
        select acceptance_id, count(*) as n from public.construction_photos
         where project_id = p_project_id and acceptance_id is not null group by acceptance_id
      ) g), '{}'::jsonb),
    'by_section', coalesce((
      select jsonb_object_agg(section_id::text, n) from (
        select section_id, count(*) as n from public.construction_photos
         where project_id = p_project_id and section_id is not null group by section_id
      ) g), '{}'::jsonb)
  )
$function$;

revoke all on function public.construction_photo_counts(uuid) from public;
revoke all on function public.construction_photo_counts(uuid) from anon;
grant execute on function public.construction_photo_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Q-ε5: dritte Art `foto` in der Abschnitts-Auskunft (Teilbaum bleibt!)
-- ---------------------------------------------------------------------------
create or replace function public.construction_section_blocking_refs(p_section_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with recursive subtree as (
    select id from public.construction_sections where id = p_section_id
    union all
    select s.id from public.construction_sections s join subtree st on s.parent_id = st.id
  )
  select coalesce(jsonb_agg(x order by x ->> 'kind', (x ->> 'ref_number')::int), '[]'::jsonb)
  from (
    select jsonb_build_object('kind', 'mangel', 'id', d.id,
                              'ref_number', d.defect_number, 'label', d.title) as x
      from public.construction_defects d
     where d.section_id in (select id from subtree)
    union all
    select jsonb_build_object('kind', 'abnahme', 'id', a.id,
                              'ref_number', a.acceptance_number,
                              'label', coalesce(a.title, 'Abnahme vom ' || a.scheduled_for::text))
      from public.construction_acceptances a
     where a.section_id in (select id from subtree)
    union all
    -- PROJ-45-ε: dritte Art. `ref_number` gibt es beim Foto nicht — die
    -- Sortierung braucht aber eine Zahl, also die Reihenfolge im Bezug.
    select jsonb_build_object('kind', 'foto', 'id', p.id,
                              'ref_number', p.sort_order,
                              'label', coalesce(nullif(btrim(p.caption), ''),
                                                'Foto ohne Bildunterschrift'))
      from public.construction_photos p
     where p.section_id in (select id from subtree)
  ) s
$function$;

revoke all on function public.construction_section_blocking_refs(uuid) from public;
revoke all on function public.construction_section_blocking_refs(uuid) from anon;
grant execute on function public.construction_section_blocking_refs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Register: Objektart, Feld-Whitelist, Lese-Tor — Anker-Ersetzung aus der
-- Live-Definition, whitespace-tolerant, mit Treffer-Eindeutigkeit UND
-- Post-Verifikation (AC-45εH-5).
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text; v_new text; v_n int; v_before int; v_after int;
begin
  -- (a) Objektart
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname = 'audit_log_entity_type_check';
  if v_def is null then raise exception 'PROJ-45-e: entity_type-CHECK nicht gefunden'; end if;
  v_before := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;
  if position('''construction_photos''' in v_def) = 0 then
    select count(*) into v_n from regexp_matches(v_def, '''construction_acceptances''::text\]', 'g');
    if v_n <> 1 then
      raise exception 'PROJ-45-e: Anker im entity_type-CHECK nicht eindeutig (%)', v_n;
    end if;
    v_new := regexp_replace(v_def, '''construction_acceptances''::text\]',
                            '''construction_acceptances''::text, ''construction_photos''::text]');
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
    select pg_get_constraintdef(oid) into v_def from pg_constraint
     where conname = 'audit_log_entity_type_check';
    v_after := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;
    if v_after <> v_before + 1 then
      raise exception 'PROJ-45-e: Objektarten % -> % (erwartet +1)', v_before, v_after;
    end if;
    if position('''construction_acceptances''' in v_def) = 0
       or position('''construction_defects''' in v_def) = 0
       or position('''construction_sections''' in v_def) = 0 then
      raise exception 'PROJ-45-e: ein Geschwister-Eintrag ist beim CHECK-Tausch verloren';
    end if;
  end if;
end
$$;

do $$
declare
  v_def text; v_new text; v_sib text; v_n int; v_before int; v_after int;
begin
  -- (b) Feld-Whitelist
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = '_tracked_audit_columns' and pronamespace = 'public'::regnamespace;
  v_before := array_length(regexp_split_to_array(v_def, 'when '''), 1) - 1;
  if position('''construction_photos''' in v_def) = 0 then
    -- ANKER KORRIGIERT: `'document_node_id']` allein kommt ZWEIMAL vor — auch in
    -- `skill_knowledge_links` (PROJ-77-γ hat ebenfalls einen Dokumentknoten).
    -- Der Eindeutigkeits-Waechter hat das beim ersten Anwendungsversuch gefangen
    -- und die Migration atomar zurueckgerollt; der Anker nennt jetzt die drei
    -- vorangehenden Abnahme-Spalten mit und ist damit eindeutig (live geprueft).
    select count(*) into v_n from regexp_matches(v_def,
      '''warranty_end_date'',''document_label'',''document_url'',''document_node_id''\]', 'g');
    if v_n <> 1 then
      raise exception 'PROJ-45-e: Anker in _tracked_audit_columns nicht eindeutig (%)', v_n;
    end if;
    v_new := regexp_replace(v_def,
      '''warranty_end_date'',''document_label'',''document_url'',''document_node_id''\]',
      '''warranty_end_date'',''document_label'',''document_url'',''document_node_id''] when ''construction_photos'' then array[''caption'',''taken_on'',''sort_order'']');
    execute v_new;
    select pg_get_functiondef(oid) into v_def from pg_proc
     where proname = '_tracked_audit_columns' and pronamespace = 'public'::regnamespace;
    v_after := array_length(regexp_split_to_array(v_def, 'when '''), 1) - 1;
    if v_after <> v_before + 1 then
      raise exception 'PROJ-45-e: Whitelist-Zweige % -> % (erwartet +1)', v_before, v_after;
    end if;
    if position('''construction_photos''' in v_def) = 0 then
      raise exception 'PROJ-45-e: Whitelist-Zweig fehlt nach der Ersetzung';
    end if;
    foreach v_sib in array array['construction_defects','construction_acceptances',
                                 'construction_sections','project_construction_trades',
                                 'work_items','risks','projects','phases',
                                 -- der zweite `document_node_id`-Traeger, der den
                                 -- ersten Anker uneindeutig gemacht hat
                                 'skill_knowledge_links'] loop
      if position('''' || v_sib || '''' in v_def) = 0 then
        raise exception 'PROJ-45-e: Geschwister-Zweig % in der Whitelist verloren', v_sib;
      end if;
    end loop;
    execute 'grant execute on function public._tracked_audit_columns(text) to authenticated';
  end if;
end
$$;

do $$
declare
  v_def text; v_new text; v_n int; v_before int; v_after int; v_sib text;
begin
  -- (c) Lese-Tor
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace;
  v_before := array_length(regexp_split_to_array(v_def, 'when '''), 1) - 1;
  if position('''construction_photos''' in v_def) = 0 then
    select count(*) into v_n from regexp_matches(v_def,
      'when\s+''construction_acceptances''\s+then\s+select\s+project_id\s+into\s+v_project\s+from\s+public\.construction_acceptances\s+where\s+id\s*=\s*p_entity_id;', 'g');
    if v_n <> 1 then
      raise exception 'PROJ-45-e: Anker im Lese-Tor nicht eindeutig (%)', v_n;
    end if;
    v_new := regexp_replace(v_def,
      '(when\s+''construction_acceptances''\s+then\s+select\s+project_id\s+into\s+v_project\s+from\s+public\.construction_acceptances\s+where\s+id\s*=\s*p_entity_id;)',
      '\1 when ''construction_photos'' then select project_id into v_project from public.construction_photos where id = p_entity_id;');
    execute v_new;
    select pg_get_functiondef(oid) into v_def from pg_proc
     where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace;
    v_after := array_length(regexp_split_to_array(v_def, 'when '''), 1) - 1;
    if v_after <> v_before + 1 then
      raise exception 'PROJ-45-e: Lese-Tor-Zweige % -> % (erwartet +1)', v_before, v_after;
    end if;
    foreach v_sib in array array['construction_defects','construction_acceptances',
                                 'construction_sections','project_construction_trades',
                                 'work_items','risks','spa_issues','ma_valuations'] loop
      if position('''' || v_sib || '''' in v_def) = 0 then
        raise exception 'PROJ-45-e: Geschwister-Zweig % im Lese-Tor verloren', v_sib;
      end if;
    end loop;
    execute 'grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated';
  end if;
end
$$;

create or replace trigger construction_photos_audit
  after update on public.construction_photos
  for each row execute function public.record_audit_changes();

create or replace trigger construction_photos_lifecycle
  after insert or delete on public.construction_photos
  for each row execute function public.record_audit_lifecycle();

-- ---------------------------------------------------------------------------
-- Post-Conditions
-- ---------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='construction_photos' and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'PROJ-45-e: es gibt eine Schreib-Policy (%)', v_n; end if;

  select count(*) into v_n from pg_class
   where relname='construction_photos' and relnamespace='public'::regnamespace and not relrowsecurity;
  if v_n <> 0 then raise exception 'PROJ-45-e: RLS ist nicht aktiv'; end if;

  -- `anon` UND PUBLIC ohne EXECUTE. Der PUBLIC-Eintrag rendert mit LEEREM
  -- Empfaenger, beginnt also mit `=` (γ-Lehre B-γ1).
  select count(*) into v_n
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl
   where p.pronamespace='public'::regnamespace
     and p.proname in ('construction_photo_guard','construction_photo_removal_guard',
                       'construction_photo_document_lock','_construction_photo_may_manage',
                       'link_construction_photo','set_construction_photo_meta',
                       'remove_construction_photo','construction_photo_counts',
                       'construction_section_blocking_refs')
     and (acl::text like 'anon=%' or acl::text like '=%');
  if v_n <> 0 then raise exception 'PROJ-45-e: anon oder PUBLIC hat EXECUTE (%)', v_n; end if;

  -- Auswertungen bleiben INVOKER, Schreibwege DEFINER, alle mit search_path.
  select count(*) into v_n from pg_proc
   where pronamespace='public'::regnamespace
     and ((proname in ('construction_photo_counts','construction_section_blocking_refs') and prosecdef)
       or (proname in ('link_construction_photo','set_construction_photo_meta',
                       'remove_construction_photo') and not prosecdef)
       or (proname in ('construction_photo_guard','construction_photo_removal_guard',
                       'construction_photo_document_lock','_construction_photo_may_manage',
                       'link_construction_photo','set_construction_photo_meta',
                       'remove_construction_photo','construction_photo_counts',
                       'construction_section_blocking_refs')
           and not exists (select 1 from unnest(coalesce(proconfig,'{}'::text[])) c
                            where c like 'search_path=%')));
  if v_n <> 0 then raise exception 'PROJ-45-e: Modus oder search_path falsch (%)', v_n; end if;

  select count(*) into v_n from pg_trigger
   where tgrelid='public.construction_photos'::regclass and not tgisinternal;
  -- moddatetime, guard, removal_guard, audit, lifecycle
  if v_n <> 5 then raise exception 'PROJ-45-e: erwartet 5 Trigger auf construction_photos, gefunden %', v_n; end if;

  select count(*) into v_n from pg_trigger
   where tgrelid='public.documents'::regclass and tgname='documents_construction_photo_lock';
  if v_n <> 1 then raise exception 'PROJ-45-e: Löschsperre am Dokument fehlt'; end if;
end
$$;
