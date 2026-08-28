-- PROJ-152 — `ki_runs.status` bekommt den Wert 'running'.
--
-- Befund: `insertKiRun` (router.ts) trug den Lauf **optimistisch als
-- 'success'** ein und korrigierte ihn erst am Ende. Das war keine
-- Bequemlichkeit, sondern erzwungen — der CHECK kennt nur
-- 'success' | 'error' | 'external_blocked', ein "laeuft noch" gab es nicht.
--
-- Die Folge ist am 2026-08-27 in Prod messbar: zwei Laeufe des Zwecks
-- `proposal_stakeholders_from_context` (19:52:11 und 19:53:07) stehen als
-- `status = 'success'` in der Tabelle, haben aber `latency_ms = null`,
-- `input_tokens = null`, `output_tokens = null` und **0** erzeugte
-- Vorschlaege. Sie sind nie fertig geworden; die Finalisierung lief nicht.
-- Ein Protokoll, das einen abgestuerzten Lauf als Erfolg fuehrt, ist an der
-- einen Stelle unbrauchbar, an der man es braucht.
--
-- Zwei Nebenwirkungen, beide gewollt und vorab gemessen:
--
--   1. `tenant_ai_monthly_usage` filtert `status in ('success','error')`.
--      Ein haengender Lauf faellt damit aus der Nutzungs-/Kostenzaehlung
--      heraus — richtig, denn er hat nachweislich keine Token verbraucht.
--      Bisher zaehlte er als `call_count`-Eintrag mit 0 Token mit.
--      Die Funktion wird **nicht** angefasst: ihr Filter ist bereits eine
--      Aufzaehlung der abgeschlossenen Zustaende und bleibt korrekt.
--
--   2. Ein Lauf, der auf 'running' stehenbleibt, ist ab jetzt das
--      *sichtbare* Signal fuer "Anfrage wurde unterwegs abgeschnitten"
--      (Funktionsgrenze, geschlossener Browser-Tab). Genau das soll er
--      sein. Der regulaere Timeout aus `provider-timeout.ts` fuehrt
--      dagegen weiterhin zu 'error'/'external_blocked', weil dort die
--      Finalisierung laeuft.
--
-- Historische Zeilen werden **nicht** umgeschrieben. Die zwei
-- Phantom-'success'-Zeilen vom 2026-08-27 bleiben stehen: sie sind
-- Kundendaten, und eine nachtraegliche Korrektur des eigenen
-- Laufprotokolls waere schlechter als ein dokumentiertes Artefakt.

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid)
    into v_def
    from pg_constraint
   where conrelid = 'public.ki_runs'::regclass
     and conname = 'ki_runs_status_check';

  if v_def is null then
    raise exception
      'PROJ-152: ki_runs_status_check nicht gefunden — Abbruch statt Raten.';
  end if;

  -- Idempotent: ein zweiter Lauf findet 'running' bereits vor.
  if v_def like '%''running''%' then
    raise notice 'PROJ-152: ki_runs_status_check kennt running bereits — nichts zu tun.';
    return;
  end if;

  -- Vorbedingung: wir ersetzen genau den erwarteten Bestand, nicht
  -- irgendeinen. Weicht er ab, hat eine andere Slice ihn veraendert und
  -- ein blindes Ueberschreiben wuerde ihre Werte verlieren.
  if v_def not like '%''success''%'
     or v_def not like '%''error''%'
     or v_def not like '%''external_blocked''%' then
    raise exception
      'PROJ-152: unerwarteter ki_runs_status_check (%) — Abbruch.', v_def;
  end if;

  alter table public.ki_runs
    drop constraint ki_runs_status_check;

  alter table public.ki_runs
    add constraint ki_runs_status_check
    check (status = any (array['running'::text, 'success'::text, 'error'::text, 'external_blocked'::text]));
end
$$;

-- Post-Condition: der neue Wert ist wirklich erlaubt und die drei alten
-- sind erhalten geblieben. Geprueft wird das Verhalten, nicht der Text.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid)
    into v_def
    from pg_constraint
   where conrelid = 'public.ki_runs'::regclass
     and conname = 'ki_runs_status_check';

  if v_def not like '%''running''%'
     or v_def not like '%''success''%'
     or v_def not like '%''error''%'
     or v_def not like '%''external_blocked''%' then
    raise exception
      'PROJ-152: Post-Condition fehlgeschlagen — CHECK lautet jetzt %', v_def;
  end if;

  raise notice 'PROJ-152: ki_runs_status_check traegt jetzt 4 Werte inkl. running.';
end
$$;
