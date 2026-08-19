-- PROJ-Y-148c — Rückbau der nie gemergten "Variante 3" (Governance-Teardown mit Grabstein).
--
-- BEFUND (live erhoben 2026-08-19, nicht aus einer Vorlage übernommen)
-- ---------------------------------------------------------------------------
-- Prod trug seit 2026-08-14 eine Migration, die es in `supabase/migrations/`
-- nie gegeben hat (registriert als `20260814131244`, gebaut auf dem WIP-Zweig
-- `proj-y-148a/governance-teardown-wip`, Commit `72cfecd`, Betreff
-- "Entscheidung offen"). Sie hat zwei Dinge getan:
--
--   (a) vier append-only-Guards um einen "Elternteil wird abgerissen"-Ausweg
--       erweitert, gekoppelt an den Sitzungsschalter `app.project_teardown`
--       (gelesen über `public._project_teardown_active()`);
--   (b) eine RPC `public.hard_delete_project(uuid)` angelegt: SECURITY DEFINER,
--       intern nur `is_tenant_admin`-gegatet, mit EXECUTE an `authenticated`.
--
-- Der Nutzer hat für PROJ-Y-148a **Variante 1** entschieden (endgültiges Löschen
-- ehrlich absagen). Damit ist dieser Weg verworfen — er wird zurückgebaut, nicht
-- nachträglich eingepflegt.
--
-- WARUM DAS NICHT NUR BUCHFÜHRUNG IST
-- ---------------------------------------------------------------------------
-- Die frühere Einschätzung "kein src/-Code ruft sie, also über die Anwendung
-- unerreichbar — kein offenes Loch" trägt nicht. Die Angriffsfläche einer
-- Supabase-RPC ist nicht, was die Anwendung aufruft, sondern wer EXECUTE hat:
-- der anon key steht im Browser-Bundle, ein angemeldeter Nutzer hat ein gültiges
-- JWT, und `supabase.rpc()` erreicht jede Funktion mit `authenticated`-EXECUTE.
-- Das interne Gate ist `is_tenant_admin` — und der Produktivmandant hat genau
-- ein Mitglied, das Admin ist.
--
-- Live bewiesen (zurückgerollt, 0 Rückstände: 52 Projekte / 23 Papierkorb /
-- 47 + 10 Ereigniszeilen / 0 Grabsteine unverändert): unter den Claims dieses
-- einen gewöhnlichen Nutzers liefert `hard_delete_project` `ok: true` und die
-- Stakeholder-Profil-Historie des Projekts geht von **2 auf 0**. Die
-- Unveränderlichkeits-Zusagen von PROJ-31 / 33 / 100c / 105 galten in Prod also
-- nicht wörtlich, ohne dass eine Slice das dokumentiert hätte.
--
-- Zweite, eigenständige Divergenz, hier mit geschlossen: `search_path` ist bei
-- `enforce_deliverable_approval_event_immutability` und
-- `enforce_clearance_event_immutability` in Prod gesetzt, in ihren
-- Repo-Migrationen (PROJ-105 / PROJ-100c) aber **nicht**. Ein wörtliches
-- Zurückschreiben der Repo-Form würde diese Härtung verlieren und zwei neue
-- Advisor-Warnungen erzeugen. Die Definitionen unten führen daher die
-- kanonische Semantik (immer `raise`, kein Ausweg) **mit** `search_path` —
-- danach stimmen Prod und Dateien in beiden Punkten überein.
--
-- BEWUSST NICHT ANGETASTET
-- ---------------------------------------------------------------------------
-- `enforce_construction_defect_event_immutability` (PROJ-45-β) trägt ebenfalls
-- einen Ausweg, aber **ohne** Schalter und aus einer echten Repo-Migration
-- (`20260818104358`). Er ist dort begründet (`construction_defects` hat keine
-- DELETE-Policy, über die Anwendung ist der Zweig unerreichbar) und Gegenstand
-- des eigenen Followups PROJ-Y-148d. Eine fremde, gerade gelandete Slice
-- nebenbei umzubauen wäre genau der Fehler, den PROJ-Y-148a vermieden hat.


-- ── 1. Die vier Guards zurück auf "immer verweigern" ────────────────────────
-- Meldungstexte und SQLSTATEs sind aus der Live-Definition übernommen und
-- bleiben unverändert: Pentests und die Vorabprüfung aus PROJ-Y-148a hängen
-- daran, dass `decision_approval_events`/`stakeholder_profile_audit_events`
-- `check_violation` (23514) werfen und die beiden anderen `42501`.

create or replace function public.enforce_approval_event_immutability()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception
    'decision_approval_events are append-only. UPDATE and DELETE forbidden.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.enforce_stakeholder_profile_audit_immutability()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception
    'stakeholder_profile_audit_events are append-only. UPDATE and DELETE forbidden.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.enforce_deliverable_approval_event_immutability()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception 'deliverable approval events are append-only'
    using errcode = '42501';
end;
$$;

create or replace function public.enforce_clearance_event_immutability()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception 'clearance request events are append-only'
    using errcode = '42501';
end;
$$;

-- ── 2. Die RPC und den Schalter entfernen ──────────────────────────────────
-- Reihenfolge: erst die RPC (der einzige Setzer), dann die Lesefunktion.
-- Kein `cascade` — bräuchte es eines, hinge noch etwas daran und der Rückbau
-- wäre nicht vollständig verstanden. Dann soll er laut scheitern.
drop function if exists public.hard_delete_project(uuid);
drop function if exists public._project_teardown_active();

-- ── 3. Post-Conditions — fail loud ─────────────────────────────────────────
do $$
declare
  v_ausweg int;
  v_rpc int;
  v_schalter int;
  v_trigger int;
  v_ohne_search_path int;
  v_bau int;
begin
  -- (a) Keine der vier Guards darf den Schalter noch erwähnen.
  select count(*) into v_ausweg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('enforce_approval_event_immutability',
                       'enforce_stakeholder_profile_audit_immutability',
                       'enforce_deliverable_approval_event_immutability',
                       'enforce_clearance_event_immutability')
     and pg_get_functiondef(p.oid) like '%project_teardown%';
  if v_ausweg <> 0 then
    raise exception 'PROJ-Y-148c: % Guard(s) erwaehnen den Teardown-Schalter noch', v_ausweg;
  end if;

  -- (b) RPC und Schalter sind weg.
  select count(*) into v_rpc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hard_delete_project';
  select count(*) into v_schalter from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='_project_teardown_active';
  if v_rpc <> 0 or v_schalter <> 0 then
    raise exception 'PROJ-Y-148c: hard_delete_project=%, _project_teardown_active=% (beide muessen 0 sein)',
      v_rpc, v_schalter;
  end if;

  -- (c) Die Trigger hängen weiter — `create or replace function` lässt sie in
  --     Ruhe, aber geprüft ist besser als angenommen. Erwartet: 6 (zwei
  --     Tabellen tragen je einen UPDATE- und einen DELETE-Trigger).
  select count(*) into v_trigger
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relname in ('decision_approval_events','stakeholder_profile_audit_events',
                       'deliverable_approval_events','ma_clearance_request_events');
  if v_trigger <> 6 then
    raise exception 'PROJ-Y-148c: % Immutability-Trigger auf den vier Tabellen, erwartet 6', v_trigger;
  end if;

  -- (d) Die Härtung ist nicht verloren gegangen.
  select count(*) into v_ohne_search_path
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('enforce_approval_event_immutability',
                       'enforce_stakeholder_profile_audit_immutability',
                       'enforce_deliverable_approval_event_immutability',
                       'enforce_clearance_event_immutability')
     and p.proconfig is null;
  if v_ohne_search_path <> 0 then
    raise exception 'PROJ-Y-148c: % Guard(s) ohne search_path', v_ohne_search_path;
  end if;

  -- (e) Die fremde Slice ist unberührt: PROJ-45-βs Guard existiert weiter und
  --     behält seinen (anders begründeten) Ausweg — Gegenstand von PROJ-Y-148d.
  select count(*) into v_bau
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enforce_construction_defect_event_immutability';
  if v_bau <> 1 then
    raise exception 'PROJ-Y-148c: construction-Guard unerwartet veraendert (gefunden %)', v_bau;
  end if;

  raise notice 'PROJ-Y-148c: Rueckbau vollstaendig — 0 Ausweg, RPC und Schalter entfernt, 6 Trigger, search_path erhalten, PROJ-45-beta unberuehrt';
end $$;

