-- PROJ-Y-148d — `construction_defect_events` hält seine append-only-Zusage jetzt
-- auch beim Projekt-Abriss.
--
-- BEFUND
-- ---------------------------------------------------------------------------
-- `enforce_construction_defect_event_immutability` (PROJ-45-β, Migration
-- `20260818104358`) lässt ein `DELETE` durch, sobald der Eltern-Mangel fehlt —
-- ohne jede weitere Bedingung. Ein Kaskaden-Löschen entfernt die Elternzeile
-- aber zuerst, die Ausnahme greift also bei **jedem** Projekt-Abriss von selbst.
-- Die Mängel-Historie ging damit mit dem Projekt, während ihre vier
-- Geschwister-Inseln (PROJ-31/33/100c/105) den Abriss verweigern.
--
-- WARUM DER FORK AUS DEM REGISTER ENTSCHIEDEN IST
-- ---------------------------------------------------------------------------
-- Das Followup fragte: gewollt oder übersehener Kaskadenweg? Beides ist
-- inzwischen beantwortet, und zwar nicht durch Abwägung, sondern durch zwei
-- Ereignisse:
--
-- 1. Die Begründung im PROJ-45-β-Kommentar lautet, der Zweig sei „über die
--    Anwendung ohnehin unerreichbar (keine DELETE-Policy auf
--    `construction_defects`)". Das trifft den **direkten** Weg. Der reale Weg
--    ist die Kaskade `projects → construction_defects → construction_defect_events`,
--    und die braucht keine Policy. Die Begründung deckt den Fall also nicht ab,
--    den sie zu decken scheint — das spricht für Versehen, nicht für Absicht.
--
-- 2. Der zweite, ausdrücklich genannte Grund war: „Ohne das wäre jeder
--    Projekt-Hard-Delete an einem Bauprojekt mit Mängeln blockiert — genau die
--    Klasse Blocker, die PROJ-148 gerade behoben hat … Eine neue Instanz davon
--    anzulegen wäre ein Rückschritt." Das war richtig gedacht, **solange
--    PROJ-Y-148a offen war**. Es ist seit dem 2026-08-19 entschieden: Variante 1
--    sagt, die Blockade IST die richtige Antwort, sie wird nur ehrlich
--    kommuniziert (422 mit benannter Ursache statt 500 mit DB-Meldung). Damit
--    ist ein Blocker kein Rückschritt mehr, sondern das gewollte Verhalten mit
--    fertiger Oberfläche.
--
-- Die im Register vorgeschlagene Lösung — „die `_project_teardown_active()`-
-- Bedingung nachziehen" — ist **nicht mehr baubar**: PROJ-Y-148c hat diese
-- Funktion entfernt, weil sie zu einer verworfenen Variante gehörte. Der Ausweg
-- entfällt deshalb ganz, statt an eine Bedingung geknüpft zu werden. Danach sind
-- alle fünf Inseln gleich behandelt, und die Zusage hängt nicht mehr davon ab,
-- welche Tabelle betroffen ist.
--
-- ZEITPUNKT
-- ---------------------------------------------------------------------------
-- Live gemessen: **0** Mängel, **0** Mängel-Ereignisse, 4 Bauprojekte (3 im
-- Papierkorb), **0** Papierkorb-Projekte mit Mängel-Historie. Die Änderung
-- betrifft heute also niemanden — und sie ist nur heute so billig, weil
-- gelöschte Historie nicht rückholbar ist und die Zahl mit der Nutzung wächst.
--
-- PROJ-45-βs Migration bleibt unangetastet (append-only). Ihr Kommentar
-- beschreibt ab hier einen überholten Stand; die Korrektur steht in ihrer Spec
-- und in dieser Migration.

-- `SECURITY DEFINER` und `search_path` bleiben wie in PROJ-45-β: DEFINER war
-- dort bewusst gewählt (als INVOKER könnte RLS-Unsichtbarkeit sich als „Mangel
-- ist weg" tarnen). Mit dem Wegfall des Zweigs ist das nicht mehr tragend, aber
-- eine Änderung daran gehört nicht in diese Slice.
create or replace function public.enforce_construction_defect_event_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  raise exception 'construction defect events are append-only'
    using errcode = '42501';
end;
$$;

do $$
declare
  v_ausweg int;
  v_trigger int;
  v_andere int;
begin
  -- (a) Kein Ausweg mehr: keine Bedingung, kein `return OLD`.
  select count(*) into v_ausweg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enforce_construction_defect_event_immutability'
     and (pg_get_functiondef(p.oid) like '%not exists%'
          or pg_get_functiondef(p.oid) like '%return OLD%');
  if v_ausweg <> 0 then
    raise exception 'PROJ-Y-148d: der Guard traegt noch einen Ausweg';
  end if;

  -- (b) Der Trigger hängt weiter. `create or replace function` lässt ihn in
  --     Ruhe — geprüft ist trotzdem besser als angenommen.
  select count(*) into v_trigger
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname = 'construction_defect_events';
  if v_trigger < 1 then
    raise exception 'PROJ-Y-148d: kein Immutability-Trigger auf construction_defect_events';
  end if;

  -- (c) Die vier Geschwister aus PROJ-Y-148c sind unberührt und weiterhin
  --     ausnahmslos — diese Slice darf dort nichts verändert haben.
  select count(*) into v_andere
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('enforce_approval_event_immutability',
                       'enforce_stakeholder_profile_audit_immutability',
                       'enforce_deliverable_approval_event_immutability',
                       'enforce_clearance_event_immutability')
     and (pg_get_functiondef(p.oid) like '%return OLD%'
          or pg_get_functiondef(p.oid) like '%project_teardown%');
  if v_andere <> 0 then
    raise exception 'PROJ-Y-148d: % Geschwister-Guard(s) unerwartet mit Ausweg', v_andere;
  end if;

  raise notice 'PROJ-Y-148d: alle fuenf Governance-Inseln verweigern jetzt ausnahmslos';
end $$;
