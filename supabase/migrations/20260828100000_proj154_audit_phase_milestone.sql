-- PROJ-154 — `work_items.phase_id` und `work_items.milestone_id` ins Feld-Audit.
--
-- BEFUND (live gemessen, 2026-08-28): `_tracked_audit_columns('work_items')`
-- fuehrte 18 Spalten, aber weder `phase_id` noch `milestone_id`. Eine
-- Phasenzuweisung war damit NICHT nachvollziehbar — beim Nachforschen, warum
-- Arbeitspakete nicht in der Phasenplanung erscheinen, liess sich deshalb
-- nicht rekonstruieren, was der Nutzer tatsaechlich zugewiesen hatte. Genau
-- die Luecke, die PROJ-Y-130s fuer 14 andere Objektarten geschlossen hat.
--
-- WARUM DIESE ZWEI UND NICHT MEHR: die Aufnahmeregel aus PROJ-Y-130s ist
-- "fachlich veraenderbar, kein Personenbezug, kein Freitext". Beide Spalten
-- sind Fremdschluessel auf projektinterne Strukturen (`phases`, `milestones`),
-- tragen also keinen Klartext und keine PII — und beide sind ueber die
-- Oberflaeche veraenderbar (Bearbeiten-Dialog, Bulk-Zuweisung im Backlog).
-- `sprint_id` ist die dritte Spalte derselben Klasse und wird bereits getrackt;
-- die drei Zeitachsen-Zuordnungen sind damit endlich vollstaendig.
--
-- VORAB GEMESSEN (Geisterspalten-Falle aus PROJ-Y-130s): beide Spalten
-- existieren wirklich auf `work_items`. Die Migration prueft das selbst — eine
-- Whitelist, die eine nicht existierende Spalte nennt, protokolliert LAUTLOS
-- nichts (`to_jsonb(OLD) -> spalte` ist NULL, `NULL is distinct from NULL` ist
-- false, keine Zeile, keine Fehlermeldung).
--
-- Anker-Ersetzung aus der LIVE-Definition (nicht aus einer Vorlage
-- transkribiert — 78 Zweige, gewachsen ueber 80 Migrationen), whitespace-
-- tolerant, mit Treffer-Eindeutigkeit und Post-Verifikation. Selbstpruefend.
do $$
declare
  v_def          text;
  v_new          text;
  v_hits         int;
  v_before       int;
  v_after        int;
  v_branches_pre int;
  v_branches_post int;
  v_missing      text;
begin
  -- (0) Spalten muessen existieren, sonst waere der Eintrag eine Geisterspalte.
  select string_agg(c.col, ', ')
    into v_missing
  from (values ('phase_id'), ('milestone_id')) as c(col)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'work_items'
      and column_name  = c.col
  );
  if v_missing is not null then
    raise exception 'PROJ-154: Spalte(n) fehlen auf work_items: %', v_missing;
  end if;

  select pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)
    into v_def;

  -- (1) Idempotenz: laeuft die Migration erneut, ist nichts zu tun.
  v_before := cardinality(public._tracked_audit_columns('work_items'));
  if 'phase_id' = any(public._tracked_audit_columns('work_items'))
     and 'milestone_id' = any(public._tracked_audit_columns('work_items')) then
    raise notice 'PROJ-154: work_items traegt phase_id und milestone_id bereits (% Spalten) — nichts zu tun.', v_before;
    return;
  end if;

  v_branches_pre := (select count(*) from regexp_matches(v_def, 'when ', 'g'));

  -- (2) Anker: das Ende des work_items-Zweiges. Whitespace-tolerant, weil die
  --     Live-Definition und der Datei-Replay unterschiedlich formatiert sein
  --     koennen (die Lehre aus PROJ-Y-115c: ein literaler Anker traf in Prod
  --     und brach im Fresh-Apply).
  v_hits := (
    select count(*) from regexp_matches(
      v_def, '''due_date''\s*,\s*''workstream_id''\s*\]', 'g')
  );
  if v_hits <> 1 then
    raise exception 'PROJ-154: Anker nicht eindeutig (% Treffer) — Abbruch statt Blindflug.', v_hits;
  end if;

  v_new := regexp_replace(
    v_def,
    '''due_date''\s*,\s*''workstream_id''\s*\]',
    '''due_date'',''workstream_id'',''phase_id'',''milestone_id'']'
  );

  if v_new = v_def then
    raise exception 'PROJ-154: Ersetzung war ein No-op.';
  end if;

  execute v_new;

  -- (3) Post-Verifikation: gewachsen um genau 2, Geschwister-Zweige intakt.
  v_after := cardinality(public._tracked_audit_columns('work_items'));
  if v_after <> v_before + 2 then
    raise exception 'PROJ-154: work_items-Whitelist % -> % (erwartet %).',
      v_before, v_after, v_before + 2;
  end if;
  if not ('phase_id' = any(public._tracked_audit_columns('work_items'))) then
    raise exception 'PROJ-154: phase_id fehlt nach der Ersetzung.';
  end if;
  if not ('milestone_id' = any(public._tracked_audit_columns('work_items'))) then
    raise exception 'PROJ-154: milestone_id fehlt nach der Ersetzung.';
  end if;

  v_branches_post := (
    select count(*) from regexp_matches(
      pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure),
      'when ', 'g')
  );
  if v_branches_post <> v_branches_pre then
    raise exception 'PROJ-154: Zweigzahl % -> % — ein fremder Zweig ist verloren gegangen.',
      v_branches_pre, v_branches_post;
  end if;

  -- (4) Stichprobe auf Geschwister, die dieselbe Funktion tragen. Die
  --     Zweigzahl allein wuerde einen ausgetauschten INHALT nicht bemerken.
  if cardinality(public._tracked_audit_columns('phases')) = 0
     or cardinality(public._tracked_audit_columns('risks')) = 0
     or cardinality(public._tracked_audit_columns('milestones')) = 0
     or cardinality(public._tracked_audit_columns('construction_defects')) = 0 then
    raise exception 'PROJ-154: ein Geschwister-Zweig ist leer geworden.';
  end if;

  raise notice 'PROJ-154: work_items-Whitelist % -> % Spalten, % Zweige unveraendert.',
    v_before, v_after, v_branches_post;
end $$;

-- Der Feld-Audit-Trigger auf `work_items` muss existieren, sonst waere die
-- erweiterte Whitelist nominell gesetzt und trotzdem stumm.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p  on p.oid = t.tgfoid
    where c.relname = 'work_items'
      and p.proname = 'record_audit_changes'
      and not t.tgisinternal
  ) then
    raise exception 'PROJ-154: kein record_audit_changes-Trigger auf work_items — Whitelist waere stumm.';
  end if;
end $$;
