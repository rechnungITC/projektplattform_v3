-- PROJ-148 — „Endgültig löschen" scheitert an der Lead-Invariante
--
-- Befund (live gemessen 2026-08-14, zurückgerollt): `enforce_last_lead()` prüft im
-- DELETE-Zweig nur, ob nach dem Entfernen noch ein `lead` übrig bleibt — nicht, ob das
-- Elternprojekt gerade selbst abgerissen wird. Beim `ON DELETE CASCADE` von `projects` auf
-- `project_memberships` feuert der Trigger daher mit `23514 / project must have at least one
-- lead`, und der Hard-Delete schlägt fehl.
--
-- Reichweite, am Kundenmandanten simuliert: von 23 Projekten im Papierkorb waren **21 nicht
-- löschbar** — genau die zwei ohne Lead-Mitgliedschaft gingen durch. Jedes über den Wizard
-- angelegte Projekt bekommt eine Lead-Mitgliedschaft, ist also betroffen. Die Route
-- `src/app/api/projects/[id]/route.ts` (hard-Zweig, Service-Role-Client) gibt in dem Fall
-- `delete_failed` / 500 zurück: der Papierkorb füllt sich, ohne leerbar zu sein.
--
-- Warum es nicht auffiel: `tests/PROJ-1-2-live-closure.spec.ts` seedet sein Projekt direkt
-- per Service-Role **ohne** Mitgliedschaft — also genau die einzige Form, die durchgeht. Der
-- Test war grün, während der Produktionspfad brach (dieselbe Klasse blinder Fleck wie der
-- gemockte Parser in PROJ-142). Die Härtung des Tests gehört zu dieser Slice.
--
-- Fix: im DELETE-Zweig früh zurückkehren, wenn das Elternprojekt nicht mehr existiert.
-- Empirisch belegt (zurückgerollte Probe mit probeweise eingespieltem Fix): bei einem
-- Kaskaden-Delete ist die `projects`-Zeile bereits weg, wenn die Kind-Trigger laufen — die
-- Bedingung trifft also genau den Abriss und **nur** ihn.
--
-- Die Invariante selbst bleibt unangetastet: solange das Projekt lebt, sind sowohl das
-- Entfernen als auch das Degradieren des letzten Leads weiterhin `23514` (beides in derselben
-- Probe nachgemessen).
--
-- Bearbeitet wird die Live-Definition per Anker-Ersetzung statt sie abzutippen (Hausregel
-- "replace from live, never retype"); der Anker ist whitespace-tolerant und die Migration
-- bricht laut ab, wenn er nicht genau einmal trifft.

do $$
declare
  v_def   text;
  v_new   text;
  v_hits  int;
begin
  select pg_get_functiondef('public.enforce_last_lead()'::regprocedure) into v_def;

  -- Schon gepatcht? Dann ist nichts zu tun (Idempotenz fuer Fresh-Apply + Wiederholung).
  if position('PROJ-148' in v_def) > 0 then
    raise notice 'PROJ-148: enforce_last_lead traegt den Abriss-Zweig bereits - uebersprungen';
    return;
  end if;

  -- Anker: Beginn des DELETE-Zweigs, unmittelbar vor der Lead-Pruefung.
  select count(*) into v_hits
    from regexp_matches(
      v_def,
      'elsif\s*\(\s*tg_op\s*=\s*''DELETE''\s*\)\s*then\s+if\s+old\.role\s*=\s*''lead''\s+then',
      'g');

  if v_hits <> 1 then
    raise exception 'PROJ-148: Anker im DELETE-Zweig traf % mal (erwartet genau 1) - Live-Definition hat sich geaendert, Migration abgebrochen', v_hits;
  end if;

  v_new := regexp_replace(
    v_def,
    '(elsif\s*\(\s*tg_op\s*=\s*''DELETE''\s*\)\s*then\s+)(if\s+old\.role\s*=\s*''lead''\s+then)',
    E'\\1-- PROJ-148: Beim Abriss des Elternprojekts greift die Lead-Invariante nicht mehr.\n'
    || E'    -- Ohne diesen Zweig laesst der ON DELETE CASCADE von projects den Hard-Delete\n'
    || E'    -- mit 23514 scheitern. Fuer lebende Projekte bleibt die Regel unveraendert.\n'
    || E'    if not exists (select 1 from public.projects where id = old.project_id) then\n'
    || E'      return old;\n'
    || E'    end if;\n\n    \\2'
  );

  execute v_new;
end $$;

-- Post-Conditions: laut scheitern statt still danebenliegen.
do $$
declare v_def text; v_raises int;
begin
  select pg_get_functiondef('public.enforce_last_lead()'::regprocedure) into v_def;

  if position('PROJ-148' in v_def) = 0 then
    raise exception 'PROJ-148: Abriss-Zweig fehlt nach der Ersetzung';
  end if;

  -- Beide Schutzrichtungen muessen erhalten sein (UPDATE-Degradierung + DELETE-Entzug).
  select count(*) into v_raises
    from regexp_matches(v_def, 'project must have at least one lead', 'g');
  if v_raises <> 2 then
    raise exception 'PROJ-148: erwartet 2 Invarianten-Pruefungen in enforce_last_lead, gefunden % - eine Schutzrichtung ging verloren', v_raises;
  end if;

  -- Der neue Zweig darf nur im DELETE-Pfad stehen, nicht im UPDATE-Pfad.
  if position('PROJ-148' in split_part(v_def, 'elsif', 1)) > 0 then
    raise exception 'PROJ-148: Abriss-Zweig ist im UPDATE-Pfad gelandet';
  end if;

  raise notice 'PROJ-148: enforce_last_lead gepatcht (Abriss-Zweig gesetzt, beide Invarianten-Pruefungen erhalten)';
end $$;
