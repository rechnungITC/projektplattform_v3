-- PROJ-130-δ2 — Zugriffsprotokoll, zweite Stufe: Auswertungen und In-App-Lesen.
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
--              (Abschnitt „Tech Design — δ2")
-- Baut auf δ1 (`confidential_read_log` + `log_confidential_read`).
--
-- DIE REGEL, DIE δ2 EINFÜHRT
--   Austritt   (Download-Link, CSV-Export, Druckseite) -> protokolliert ab `confidential`
--   In-App-Lesen (Liste, Auswertungs-Ansicht)          -> protokolliert NUR bei `strict`
--
-- Das amendiert die veröffentlichte Negativliste eng und sichtbar: Listenansichten
-- bleiben unprotokolliert, AUSSER die Antwort enthält `strict`-Inhalte. `strict` ist
-- die Stufe, für die überhaupt Rechenschaft zugesagt ist, und sie ist selten — die
-- Mengenkurve bleibt flach und ein Nicht-M&A-Mandant trägt weiterhin null Zusatzlast.
-- Bei `confidential` wäre es umgekehrt: `ma_valuations` trägt `confidential` als
-- Default, jede Bewertungsliste würde schreiben.
--
-- Die Stufen-Entscheidung selbst liegt in der Anwendung (src/lib/audit/confidential-read.ts),
-- nicht hier: die Tabelle nimmt bewusst jede Stufe oberhalb von `standard` an, damit eine
-- künftige Ausweitung keine Migration braucht.
--
-- DREI EINGRIFFE
--   1. Vokabular: entity_type um die Inhalts-Listen und die drei Auswertungs-Flächen,
--      action um `list_read` und `report_read` erweitert.
--   2. Entprellung in der RPC: wiederholtes Lesen derselben Fläche erzeugt eine Zeile
--      pro 15-Minuten-Fenster. An die AKTION gebunden, nicht an einen neuen Parameter —
--      die Signatur bleibt unverändert. Append-only bleibt gewahrt (keine Zähler-Updates).
--   3. Die drei Auswertungs-Funktionen liefern einen Schlüssel `confidentiality`.
--      Grund: sie aggregieren Stage-Gates, Findings und Fragen zu Zählern, deren Stufen
--      in der Nutzlast NIE erscheinen. Ein aus der Nutzlast gerechneter Höchstwert würde
--      UNTERberichten — die gefährliche Richtung für ein forensisches Protokoll.
--      `dd_report_consolidated` führte die Stufe bisher an null Stellen.

-- =====================================================================
-- 1. Vokabular
-- =====================================================================
alter table public.confidential_read_log
  drop constraint if exists confidential_read_log_entity_type_check;
alter table public.confidential_read_log
  add constraint confidential_read_log_entity_type_check check (
    entity_type in (
      -- δ1: Austritt als Datei
      'documents',
      -- Inhalts-Listen (δ1 hatte dd_questions/spa_issues schon über die Exporte)
      'dd_streams', 'dd_questions', 'dd_findings', 'dd_finding_escalations',
      'spa_issues', 'ma_valuations', 'ma_project_profiles',
      'deliverables', 'risks', 'workstreams', 'committees', 'committee_meetings',
      -- Auswertungs-Flächen: keine Tabelle, sondern eine Auswertung als Ganzes
      'steering_report', 'operative_report', 'dd_report'
    )
  );

alter table public.confidential_read_log
  drop constraint if exists confidential_read_log_action_check;
alter table public.confidential_read_log
  add constraint confidential_read_log_action_check check (
    action in ('download_url_issued', 'export', 'list_read', 'report_read')
  );

comment on column public.confidential_read_log.action is
  'download_url_issued = signierter Link ausgegeben (nicht: Datei geladen) · export = Datei ausgeliefert · list_read = In-App-Liste mit strict-Inhalten gelesen · report_read = Auswertung gelesen (Ansicht oder Druckseite). list_read und report_read werden je (Akteur, Projekt, Objektart, Aktion, Stufe) auf eine Zeile pro 15 Minuten entprellt.';

-- =====================================================================
-- 2. Entprellung im einzigen Schreibweg (Signatur unverändert)
-- =====================================================================
create or replace function public.log_confidential_read(
  p_project_id uuid,
  p_entity_type text,
  p_max_level public.ma_confidentiality_level,
  p_object_count integer,
  p_action text,
  p_outcome text,
  p_entity_id uuid default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
begin
  if v_actor is null then
    raise exception 'PROJ-130-δ1: kein authentifizierter Aufrufer'
      using errcode = '42501';
  end if;

  -- `standard` wird nicht protokolliert. Kein Fehler, damit die Aufrufer nicht
  -- selbst filtern müssen und ein Nicht-M&A-Mandant keine Zusatzlast trägt.
  if p_max_level = 'standard' then
    return;
  end if;

  select p.tenant_id into v_tenant from public.projects p where p.id = p_project_id;
  if v_tenant is null then
    raise exception 'PROJ-130-δ1: unbekanntes Projekt %', p_project_id
      using errcode = 'P0002';
  end if;

  -- Wer protokolliert, muss auf das Projekt schauen dürfen — entweder als
  -- Mitglied oder über die Revisions-Freigabe aus γ2 (ein externer Prüfer ist
  -- bewusst kein Mitglied). Das verhindert, dass ein Fremder mit geratenen
  -- Projekt-IDs Einträge erzeugt.
  if not (public.is_project_member(p_project_id)
          or public.has_audit_reader_grant(v_tenant)) then
    raise exception 'PROJ-130-δ1: kein Zugriff auf Projekt %', p_project_id
      using errcode = '42501';
  end if;

  -- PROJ-130-δ2: Entprellung für wiederholtes Lesen derselben Fläche.
  -- Neuladen, ein React-Refetch oder ein doppelter Server-Render einer Druckseite
  -- sind EIN Lesevorgang, kein Dutzend. Bewusster Verlust: Wiederholungen innerhalb
  -- des Fensters sind nicht einzeln nachweisbar — dafür bleibt das Protokoll
  -- append-only (kein Zähler-Update, das den forensischen Wert beschädigen würde).
  -- Gilt NICHT für Austritts-Aktionen: jeder Download und jeder Export ist ein
  -- eigener Vorgang und wird einzeln festgehalten.
  if p_action in ('list_read', 'report_read') then
    if exists (
      select 1 from public.confidential_read_log l
      where l.actor_user_id = v_actor
        and l.project_id = p_project_id
        and l.entity_type = p_entity_type
        and l.action = p_action
        and l.max_level = p_max_level
        and l.created_at > now() - interval '15 minutes'
    ) then
      return;
    end if;
  end if;

  insert into public.confidential_read_log (
    tenant_id, project_id, entity_type, entity_id,
    max_level, object_count, action, outcome, actor_user_id, detail
  ) values (
    v_tenant, p_project_id, p_entity_type, p_entity_id,
    p_max_level, greatest(coalesce(p_object_count, 1), 1),
    p_action, p_outcome, v_actor, p_detail
  );
end;
$fn$;

revoke all on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) from public;
revoke all on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) from anon;
grant execute on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) to postgres, service_role, authenticated;

comment on function public.log_confidential_read is
  'PROJ-130-δ1/δ2: einziger Schreibweg in confidential_read_log. Liest auth.uid() intern (kein Actor-Parameter), verwirft `standard` still, verlangt Projekt-Sichtbarkeit oder eine Revisions-Freigabe. δ2: `list_read`/`report_read` werden auf eine Zeile pro 15-Minuten-Fenster entprellt, Austritts-Aktionen nicht.';

-- =====================================================================
-- 3. Die drei Auswertungen liefern ihre eigene Stufen-Zusammenfassung
-- =====================================================================
-- Eingriff über den EINEN Anker am Funktionsende (alle drei enden identisch auf
-- „\n  );\n$function$"), nicht durch Neutippen von 27 KB Funktionskörper und nicht
-- durch Regex-Chirurgie im Inneren. Die Definition kommt aus dem Katalog
-- (pg_get_functiondef), damit ein Repo/Prod-Unterschied nicht blind überschrieben
-- wird. Eindeutigkeits-Zählung, harter Abbruch bei unerwarteter Form, Idempotenz-
-- Sprung wenn der Schlüssel schon da ist.
--
-- Jede Zusammenfassung deckt GENAU die Quellen ab, die ihre Auswertung liest, in
-- der Granularität, in der sie sie liest — sie kann deshalb nicht unterberichten:
--   dd_report:        Streams, Findings, Fragen (alle drei nur projektweit gefiltert)
--   operative_report: die CTEs task_base/finding_open/deliverable_base (tragen die
--                     Nutzerfilter schon) + Fragen mit demselben Klassifikations-Filter
--   steering_report:  ALLE Stage-Gates (weil stage_gate_summary über alle zählt),
--                     aktuelle Bewertung, Red-Flag-Findings, Red-Flag-Risiken, Aufgaben
-- Sie läuft im INVOKER-Kontext der Auswertung, sieht also nur, was der Aufrufer
-- sehen darf (Aggregat-Leck-Probe im Pentest).
do $do$
declare
  v_target record;
  v_def text;
  v_anchor constant text := E'\n  );\n$function$';
  v_hits int;
begin
  for v_target in
    select * from (values
      (
        'dd_report_consolidated',
        $expr$      select jsonb_build_object(
        'max_level', coalesce(max(src.lvl)::text, 'standard'),
        'confidential_count', count(*) filter (where src.lvl <> 'standard')
      )
      from (
        select s.confidentiality_level as lvl
          from public.dd_streams s where s.project_id = p_project_id
        union all
        select f.confidentiality_level
          from public.dd_findings f where f.project_id = p_project_id
        union all
        select q.confidentiality_level
          from public.dd_questions q where q.project_id = p_project_id
      ) src$expr$
      ),
      (
        'operative_report',
        $expr$      select jsonb_build_object(
        'max_level', coalesce(max(src.lvl)::text, 'standard'),
        'confidential_count', count(*) filter (where src.lvl <> 'standard')
      )
      from (
        select t.confidentiality_level as lvl from task_base t
        union all
        select fo.confidentiality_level from finding_open fo
        union all
        select d.confidentiality_level from deliverable_base d
        union all
        select q.confidentiality_level
          from public.dd_questions q
         where q.project_id = p_project_id
           and (p_classification is null or q.confidentiality_level::text = p_classification)
      ) src$expr$
      ),
      (
        'steering_report',
        $expr$      select jsonb_build_object(
        'max_level', coalesce(max(src.lvl)::text, 'standard'),
        'confidential_count', count(*) filter (where src.lvl <> 'standard')
      )
      from (
        select g.confidentiality_level as lvl
          from public.ma_stage_gates g where g.project_id = p_project_id
        union all
        select v.confidentiality_level from valuation_current v
        union all
        select rf.confidentiality_level from rf_finding rf
        union all
        select rr.confidentiality_level from rf_risk rr
        union all
        select t.confidentiality_level from task_base t
      ) src$expr$
      )
    ) as t(fname, expr)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
     where p.proname = v_target.fname
       and p.pronamespace = 'public'::regnamespace;

    if v_def is null then
      raise exception 'PROJ-130-δ2: Auswertungs-Funktion % nicht gefunden', v_target.fname;
    end if;

    if position('PROJ-130-δ2' in v_def) > 0 then
      raise notice 'PROJ-130-δ2: % trägt die Zusammenfassung bereits — übersprungen', v_target.fname;
      continue;
    end if;

    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 1 then
      raise exception 'PROJ-130-δ2: Anker am Funktionsende von % % mal gefunden (erwartet genau 1) — keine Blindpatchung',
        v_target.fname, v_hits;
    end if;

    execute replace(
      v_def,
      v_anchor,
      E',\n    -- PROJ-130-δ2: Stufen-Zusammenfassung dieser Auswertung, im INVOKER-\n'
      || E'    -- Kontext des Aufrufers berechnet (siehe Migration 20260812093000).\n'
      || E'    ''confidentiality'', (\n'
      || v_target.expr
      || E'\n    )'
      || v_anchor
    );

    raise notice 'PROJ-130-δ2: % trägt jetzt die Stufen-Zusammenfassung', v_target.fname;
  end loop;
end $do$;

-- Rechte nach dem Ersetzen ausdrücklich wieder festschreiben. `create or replace`
-- erhält die ACL, aber das ist eine Zusage, auf die sich eine Sicherheitsschicht
-- nicht verlassen soll.
revoke execute on function public.dd_report_consolidated(uuid) from public, anon;
grant execute on function public.dd_report_consolidated(uuid) to authenticated;
revoke execute on function public.steering_report(uuid) from public, anon;
grant execute on function public.steering_report(uuid) to authenticated;
revoke execute on function public.operative_report(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.operative_report(uuid, uuid, uuid, uuid, text) to authenticated;

-- =====================================================================
-- 4. Post-Conditions
-- =====================================================================
do $do$
declare
  v_project uuid;
  v_def text;
  v_fn text;
  v_count int;
begin
  -- Vokabular
  if position('list_read' in pg_get_constraintdef(
       (select oid from pg_constraint where conname = 'confidential_read_log_action_check'))) = 0 then
    raise exception 'PROJ-130-δ2: action-CHECK kennt list_read nicht';
  end if;
  if position('steering_report' in pg_get_constraintdef(
       (select oid from pg_constraint where conname = 'confidential_read_log_entity_type_check'))) = 0 then
    raise exception 'PROJ-130-δ2: entity_type-CHECK kennt die Auswertungs-Flächen nicht';
  end if;
  -- δ1-Werte müssen erhalten sein, sonst hätte das Widening Bestand entwertet
  if position('documents' in pg_get_constraintdef(
       (select oid from pg_constraint where conname = 'confidential_read_log_entity_type_check'))) = 0 then
    raise exception 'PROJ-130-δ2: δ1-Objektart documents aus dem CHECK verloren';
  end if;

  -- Entprellung ist wirklich in der Funktion
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'log_confidential_read' and pronamespace = 'public'::regnamespace;
  if position('15 minutes' in v_def) = 0 or position('list_read' in v_def) = 0 then
    raise exception 'PROJ-130-δ2: Entprellung fehlt in log_confidential_read';
  end if;

  -- Die drei Auswertungen: Marker UND Verhalten. Eine reine Textprüfung würde
  -- einen kaputten Einbau nicht bemerken, deshalb wird jede Funktion aufgerufen.
  select id into v_project from public.projects where is_deleted = false limit 1;
  foreach v_fn in array array['dd_report_consolidated', 'operative_report', 'steering_report']
  loop
    select pg_get_functiondef(oid) into v_def from pg_proc
     where proname = v_fn and pronamespace = 'public'::regnamespace;
    if position('PROJ-130-δ2' in v_def) = 0 then
      raise exception 'PROJ-130-δ2: % trägt die Zusammenfassung nicht', v_fn;
    end if;

    -- Sicherheits-Eigenschaften dürfen der Ersetzung nicht zum Opfer gefallen sein
    if exists (
      select 1 from pg_proc where proname = v_fn and pronamespace = 'public'::regnamespace
        and (prosecdef or provolatile <> 's')
    ) then
      raise exception 'PROJ-130-δ2: % ist nicht mehr SECURITY INVOKER / STABLE', v_fn;
    end if;
  end loop;

  if v_project is not null then
    if not (public.dd_report_consolidated(v_project) ? 'confidentiality') then
      raise exception 'PROJ-130-δ2: dd_report_consolidated liefert keinen confidentiality-Schlüssel';
    end if;
    if not (public.steering_report(v_project) ? 'confidentiality') then
      raise exception 'PROJ-130-δ2: steering_report liefert keinen confidentiality-Schlüssel';
    end if;
    if not (public.operative_report(v_project, null, null, null, null) ? 'confidentiality') then
      raise exception 'PROJ-130-δ2: operative_report liefert keinen confidentiality-Schlüssel';
    end if;
  else
    raise notice 'PROJ-130-δ2: kein Projekt vorhanden — Verhaltensprüfung der Auswertungen übersprungen';
  end if;

  -- α/γ-Zusagen halten (dieselbe Prüfung wie in δ1)
  select count(*) into v_count from pg_trigger
   where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-δ2: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace
      and position('_audit_entry_classified_ok' in pg_get_functiondef(oid)) > 0
      and position('has_audit_reader_grant' in pg_get_functiondef(oid)) > 0
  ) then
    raise exception 'PROJ-130-δ2: γ1/γ2 aus dem Lesetor verschwunden';
  end if;

  -- Das Protokoll bleibt aus Sicht der Anwendung append-only
  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'confidential_read_log' and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'PROJ-130-δ2: % schreibende Policy(s) auf confidential_read_log', v_count;
  end if;

  raise notice 'PROJ-130-δ2: Post-Conditions erfüllt';
end $do$;
