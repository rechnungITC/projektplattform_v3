-- PROJ-Y-114a (Fix-forward) — PUBLIC-Grant auf dem Waechter entziehen.
--
-- Befund aus dem Advisor-Lauf direkt nach der Hauptmigration:
-- `_dd_finding_source_question_guard()` war fuer `anon` UND `authenticated`
-- ausfuehrbar, obwohl die Hauptmigration ein
-- `revoke all ... from anon, authenticated` enthaelt.
--
-- Ursache: Postgres vergibt auf neuen Funktionen per Default `EXECUTE` an
-- **PUBLIC**. `anon`/`authenticated` erben daraus; ein Entzug, der nur die beiden
-- Rollen nennt, entfernt den PUBLIC-Grant nicht — die ACL blieb `=X/postgres`
-- (das fuehrende `=` IST der PUBLIC-Eintrag). Die beiden Schreib-RPCs waren
-- korrekt, weil sie `from public, anon` entziehen.
--
-- Nicht ausnutzbar (eine Trigger-Funktion bricht bei direktem Aufruf mit
-- "trigger functions can only be called as triggers" ab, und sie liest nur
-- `dd_questions.project_id`), aber die Hausnorm verlangt den ausdruecklichen
-- Entzug — gleiche Klasse wie die zwei vergessenen Revokes in PROJ-Y-130n.
-- Fix-forward statt Datei-Edit, weil die Hauptmigration bereits in Prod ist.

revoke all on function public._dd_finding_source_question_guard() from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public._dd_finding_source_question_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._dd_finding_source_question_guard()', 'EXECUTE') then
    raise exception 'PROJ-Y-114a: guard is still executable by anon/authenticated';
  end if;
  -- Der Trigger muss trotzdem feuern: er laeuft im Rechtekontext des
  -- Tabellen-Eigentuemers, nicht des Aufrufers. Gegenprobe im Pentest (Vektor D).
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.dd_findings'::regclass
                   and tgname = 'dd_findings_source_question_guard') then
    raise exception 'PROJ-Y-114a: guard trigger vanished';
  end if;
  -- Die beiden Schreibpfade bleiben fuer `authenticated` erreichbar.
  if not has_function_privilege('authenticated',
       'public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level, text, text, uuid)', 'EXECUTE') then
    raise exception 'PROJ-Y-114a: create_dd_finding lost the authenticated grant';
  end if;
end $$;
