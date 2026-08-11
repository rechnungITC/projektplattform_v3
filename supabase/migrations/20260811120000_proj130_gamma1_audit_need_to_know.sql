-- PROJ-130-γ1 — Der Audit-Trail ist kein Need-to-know-Seitenkanal mehr.
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- Baut auf α (20260811093000) und β (20260811104500). CIA-Befund F-6.
--
-- BEFUND (live erhoben)
-- 20 Tabellen tragen `confidentiality_level`. 17 davon haben einen Zweig in
-- `can_read_audit_entry` — aber nur DREI Zweige prüfen die Stufe überhaupt
-- (`work_item_documents`, `document_tree_nodes`, `documents`, alle aus
-- PROJ-Y-115c). Die übrigen 16 lösen nur das Projekt auf und geben dann
-- `is_project_member(projekt)` zurück.
--
-- Folge: ein Projektmitglied OHNE Vertraulichkeits-Freischaltung konnte die
-- Vorher-/Nachher-Werte von `strict`-Objekten im Audit-Trail lesen, obwohl die
-- Objekte selbst durch die RESTRICTIVE-Policies aus PROJ-100a vor ihm verborgen
-- sind. Der Trail war damit ein Umweg um das Vertraulichkeits-Tor.
--
-- ENTSCHEIDUNG: Zeile verbergen, nicht Werte maskieren.
-- Das Tech Design sah eine Wertmaskierung vor. Die Live-Erhebung hat sie
-- widerlegt: `can_access_classified` gibt für Tenant-Admins unbedingt `true`
-- zurück (produktweit, PROJ-100a). Für Admins würde eine Maskierung im Trail
-- nichts schützen, was sie nicht ohnehin am Objekt selbst sehen — sie wäre
-- Theater und würde eine zweite, abweichende Semantik neben PROJ-100a stellen.
-- Für Nicht-Admins ist das Verbergen der Zeile strenger als eine Maskierung,
-- weil auch die Metadaten (welches Objekt, welches Feld) die Existenz eines
-- vertraulichen Vorgangs verraten würden.
-- Zweiter Grund: es gibt SECHS Leseflächen auf den Trail (Historie, Bericht,
-- Export, Stakeholder-Risk-Trend, Undo, Restore). Eine Maskierung pro Route
-- hätte drei davon verfehlt; das Row-Gate greift für alle, weil es in der
-- RLS-Policy sitzt.
--
-- UMSETZUNG: EIN Anker statt 21 Einzel-Ersetzungen.
-- Die naive Variante wäre, in 21 Zweigen je einen `can_access_classified`-Aufruf
-- einzuflechten — 21 formabhängige Regexe auf der historisch am häufigsten
-- geclobberten Funktion des Projekts. Stattdessen wird die Stufen-Auflösung in
-- EINE neue Funktion gezogen und `can_read_audit_entry` an genau EINER Stelle
-- erweitert: an ihrem gemeinsamen Ausgang.
--
-- Der Preis ist ein neues Register (die Stufen-Auflösung). Anders als die vier
-- bestehenden ist dieses aber gegen Drift PRÜFBAR: welche Tabellen es abdecken
-- muss, ist aus dem Katalog berechenbar (Spalte `confidentiality_level` UND
-- Zweig in `can_read_audit_entry`). Genau das prüft der Block am Ende — nicht
-- gegen eine gepflegte Liste, sondern gegen die Datenbank selbst.

-- =====================================================================
-- 1. Stufen-Auflösung für Audit-Einträge
-- =====================================================================
create or replace function public._audit_entry_classified_ok(
  p_entity_type text,
  p_entity_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_level public.ma_confidentiality_level;
begin
  case p_entity_type
    -- Objekte mit eigener Stufe
    when 'projects' then
      select confidentiality_level into v_level from public.projects where id = p_entity_id;
    when 'phases' then
      select confidentiality_level into v_level from public.phases where id = p_entity_id;
    when 'work_items' then
      select confidentiality_level into v_level from public.work_items where id = p_entity_id;
    when 'risks' then
      select confidentiality_level into v_level from public.risks where id = p_entity_id;
    when 'dd_streams' then
      select confidentiality_level into v_level from public.dd_streams where id = p_entity_id;
    when 'dd_questions' then
      select confidentiality_level into v_level from public.dd_questions where id = p_entity_id;
    when 'dd_findings' then
      select confidentiality_level into v_level from public.dd_findings where id = p_entity_id;
    when 'deliverables' then
      select confidentiality_level into v_level from public.deliverables where id = p_entity_id;
    when 'workstreams' then
      select confidentiality_level into v_level from public.workstreams where id = p_entity_id;
    when 'committees' then
      select confidentiality_level into v_level from public.committees where id = p_entity_id;
    when 'committee_meetings' then
      select confidentiality_level into v_level from public.committee_meetings where id = p_entity_id;
    when 'communication_matrix_entries' then
      select confidentiality_level into v_level from public.communication_matrix_entries where id = p_entity_id;
    when 'ma_project_profiles' then
      select confidentiality_level into v_level from public.ma_project_profiles where id = p_entity_id;
    when 'ma_stage_gates' then
      select confidentiality_level into v_level from public.ma_stage_gates where id = p_entity_id;
    when 'ma_valuations' then
      select confidentiality_level into v_level from public.ma_valuations where id = p_entity_id;
    when 'spa_issues' then
      select confidentiality_level into v_level from public.spa_issues where id = p_entity_id;
    when 'document_tree_nodes' then
      select confidentiality_level into v_level from public.document_tree_nodes where id = p_entity_id;

    -- Objekte, die ihre Stufe vom Elternobjekt erben
    when 'documents' then
      select n.confidentiality_level into v_level
        from public.documents d
        join public.document_tree_nodes n on n.id = d.tree_node_id
       where d.id = p_entity_id;
    when 'work_item_documents' then
      select w.confidentiality_level into v_level
        from public.work_item_documents wd
        join public.work_items w on w.id = wd.work_item_id
       where wd.id = p_entity_id;
    when 'deliverable_documents' then
      select d.confidentiality_level into v_level
        from public.deliverable_documents dd
        join public.deliverables d on d.id = dd.deliverable_id
       where dd.id = p_entity_id;
    when 'committee_members' then
      select c.confidentiality_level into v_level
        from public.committee_members cm
        join public.committees c on c.id = cm.committee_id
       where cm.id = p_entity_id;
    when 'committee_meeting_attendees' then
      select m.confidentiality_level into v_level
        from public.committee_meeting_attendees a
        join public.committee_meetings m on m.id = a.meeting_id
       where a.id = p_entity_id;
    when 'committee_meeting_documents' then
      select m.confidentiality_level into v_level
        from public.committee_meeting_documents md
        join public.committee_meetings m on m.id = md.meeting_id
       where md.id = p_entity_id;
    when 'external_document_links' then
      select (public.external_link_parent_ctx(l.entity_type, l.entity_id)).level into v_level
        from public.external_document_links l
       where l.id = p_entity_id;

    else
      -- Objekt ohne Vertraulichkeitsachse: das Tor ist hier nicht zuständig.
      return true;
  end case;

  -- Objekt weg (Hard-Delete, Lifecycle-Eintrag aus β): nichts mehr zu schützen,
  -- die Membership-Prüfung des Aufrufers hat bereits gegriffen.
  if v_level is null then
    return true;
  end if;

  return public.can_access_classified(p_project_id, v_level);
end;
$fn$;

revoke all on function public._audit_entry_classified_ok(text, uuid, uuid) from public;
revoke all on function public._audit_entry_classified_ok(text, uuid, uuid) from anon;
grant execute on function public._audit_entry_classified_ok(text, uuid, uuid) to postgres, service_role, authenticated;

comment on function public._audit_entry_classified_ok(text, uuid, uuid) is
  'PROJ-130-γ1: löst die Vertraulichkeitsstufe des Objekts hinter einem Audit-Eintrag auf (eigene Stufe oder vom Elternobjekt geerbt) und legt sie can_access_classified vor. Einziger Erweiterungspunkt von can_read_audit_entry für die Vertraulichkeitsachse — die Abdeckung ist aus dem Katalog berechenbar und wird beim Anlegen geprüft.';

-- =====================================================================
-- 2. can_read_audit_entry an genau EINER Stelle erweitern
-- =====================================================================
do $$
declare
  v_def text;
  v_new text;
  v_branches_before int;
  v_branches_after int;
  v_anchor_hits int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'can_read_audit_entry'
    and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-γ1: can_read_audit_entry nicht gefunden — Abbruch statt Raten';
  end if;

  if position('_audit_entry_classified_ok' in v_def) > 0 then
    raise notice 'PROJ-130-γ1: can_read_audit_entry bereits erweitert — übersprungen';
    return;
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, 'when ''', ''))) / length('when ''');

  -- Der Anker MUSS eindeutig sein. `if v_project is null then return false` kommt
  -- auch im vendor_invoices-Zweig vor; `regexp_replace` ersetzt ohne 'g' nur das
  -- ERSTE Vorkommen. Träfe das Muster zweimal, würde die falsche Stelle
  -- erweitert, der Ausgang bliebe ungegated — und die Zweig-Zählung würde das
  -- nicht bemerken. Deshalb zählen statt hoffen.
  select count(*) into v_anchor_hits
  from regexp_matches(
    v_def,
    'if\s+v_project\s+is\s+null\s+then\s+return\s+false;\s*end\s+if;\s*return\s+public\.is_project_member\(v_project\);',
    'g'
  );

  if v_anchor_hits <> 1 then
    raise exception
      'PROJ-130-γ1: Anker nicht eindeutig (% Treffer) — Ersetzung abgebrochen, statt die falsche Stelle zu treffen',
      v_anchor_hits;
  end if;

  -- Anker: der gemeinsame Ausgang der case-Kette. Whitespace-tolerant, weil die
  -- Shadow-DB des Schema-Drift-Guards die Funktion aus den Migrationsdateien neu
  -- aufbaut und deren Formatierung von der Prod-Normalisierung abweichen kann.
  v_new := regexp_replace(
    v_def,
    'if\s+v_project\s+is\s+null\s+then\s+return\s+false;\s*end\s+if;\s*return\s+public\.is_project_member\(v_project\);',
    'if v_project is null then return false; end if;'
    || E'\n  if not public.is_project_member(v_project) then return false; end if;'
    || E'\n  return public._audit_entry_classified_ok(p_entity_type, p_entity_id, v_project);'
  );

  if position('_audit_entry_classified_ok' in v_new) = 0 then
    raise exception 'PROJ-130-γ1: Anker-Ersetzung an can_read_audit_entry fehlgeschlagen — gemeinsamer Ausgang nicht gefunden';
  end if;

  v_branches_after := (length(v_new) - length(replace(v_new, 'when ''', ''))) / length('when ''');
  if v_branches_after <> v_branches_before then
    raise exception 'PROJ-130-γ1: Zweig-Zahl verändert (vorher %, nachher %) — Ersetzung hat mehr getroffen als den Ausgang',
      v_branches_before, v_branches_after;
  end if;

  execute v_new;
  raise notice 'PROJ-130-γ1: can_read_audit_entry erweitert, % Zweige unverändert', v_branches_after;
end $$;

-- Re-Grant in derselben Migration (Projektkonvention; CREATE OR REPLACE erhält
-- die ACL, aber die Funktion ist der historisch am häufigsten geclobberte
-- Einstiegspunkt und soll nicht davon abhängen).
revoke all on function public.can_read_audit_entry(text, uuid, uuid) from public;
revoke all on function public.can_read_audit_entry(text, uuid, uuid) from anon;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to postgres, service_role, authenticated;

-- =====================================================================
-- 3. Berechneter Drift-Wächter statt gepflegter Liste
-- =====================================================================
do $$
declare
  v_gate_def text;
  v_res_def text;
  v_missing text;
  v_count int;
begin
  select pg_get_functiondef(oid) into v_gate_def
  from pg_proc where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace;
  select pg_get_functiondef(oid) into v_res_def
  from pg_proc where proname = '_audit_entry_classified_ok' and pronamespace = 'public'::regnamespace;

  -- Jede Tabelle, die eine Vertraulichkeitsstufe trägt UND im Audit-Lesetor
  -- einen Zweig hat, MUSS in der Stufen-Auflösung vorkommen. Diese Menge wird
  -- aus dem Katalog berechnet, nicht gepflegt.
  select string_agg(t, ', ' order by t), count(*) into v_missing, v_count
  from (
    select c.relname::text as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = 'public'
     and col.table_name = c.relname::text
     and col.column_name = 'confidentiality_level'
    where n.nspname = 'public' and c.relkind = 'r'
      and position('when ''' || c.relname::text || '''' in v_gate_def) > 0
      and position('when ''' || c.relname::text || '''' in v_res_def) = 0
  ) s;

  if v_count > 0 then
    raise exception
      'PROJ-130-γ1: % Tabelle(n) mit Vertraulichkeitsstufe haben einen Audit-Zweig, aber keine Stufen-Auflösung: %',
      v_count, v_missing;
  end if;

  -- Positiv-Kontrolle: die Erweiterung ist wirklich verdrahtet.
  if position('_audit_entry_classified_ok' in v_gate_def) = 0 then
    raise exception 'PROJ-130-γ1: can_read_audit_entry ruft die Stufen-Auflösung nicht auf';
  end if;

  -- α/β-Zusagen halten weiterhin.
  if exists (
    select 1 from pg_constraint
    where conname = 'audit_log_tenant_fkey'
      and conrelid = 'public.audit_log_entries'::regclass
  ) then
    raise exception 'PROJ-130-γ1: Mandanten-FK wieder aufgetaucht';
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-γ1: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  -- Die RLS-Policy muss weiterhin genau über das Tor lesen.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_log_entries'
      and policyname = 'audit_log_select_member_or_admin'
      and qual like '%can_read_audit_entry%'
  ) then
    raise exception 'PROJ-130-γ1: Leseweg-Policy auf audit_log_entries verändert';
  end if;

  raise notice 'PROJ-130-γ1: Post-Conditions erfüllt — Stufen-Auflösung deckt alle katalogseitig betroffenen Tabellen';
end $$;
