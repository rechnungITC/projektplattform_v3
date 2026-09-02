-- PROJ-155-β.2 — Auto-Scheduling: Audit-Whitelist fuer den Schalter
--                 + transaktionale Uebernahme der Kaskade.
--
-- Zwei Teile, beide additiv. Kein Schema-Change: `projects.settings` existiert
-- bereits als `jsonb NOT NULL DEFAULT '{}'` und ist in Prod ein leerer,
-- ungenutzter Eimer (0 Zeilen belegt, 0 Schluessel in Benutzung — im CIA-Pass
-- unter F-1 gemessen).

-- Kein explizites `begin;`/`commit;`: `apply_migration` wickelt selbst, und keine
-- der 250 Bestandsmigrationen tut es (PROJ-Y-148c/D-2 hat das gemessen).

-- ---------------------------------------------------------------------------
-- Teil 1 — `settings` in die Audit-Whitelist von `projects`
--
-- Nutzer-Entscheid Q2. Der Whitelist-Eintrag ist Teil des Entscheids, nicht
-- Beiwerk: ohne ihn waere der Schalter UNAUDITIERT, und er stellt das
-- Schreibverhalten einer Kernentitaet um (Risiko R-B des Briefs). Das ist die
-- PROJ-Y-130h-Lehre — wer die Ausnahme setzt, soll seine eigene Spur nicht
-- verwischen koennen.
--
-- Anker-Ersetzung aus der LIVE-Definition (Hausnorm; Muster PROJ-154):
-- whitespace-tolerant, mit Trefferzaehlung, Delta-Pruefung und Post-Verifikation.
-- Eine Whitelist mit einer Spalte, die es nicht gibt, protokolliert LAUTLOS
-- nichts (PROJ-Y-130s: 58 solcher Geisterspalten), deshalb wird die Existenz
-- der Spalte vorher geprueft.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def text;
  v_new text;
  v_anchor text;
  v_hits int;
  v_before int;
  v_after int;
  v_col text;
begin
  -- Vorbedingung: die Spalte muss wirklich existieren.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'settings'
  ) then
    raise exception 'PROJ-155-beta2: projects.settings existiert nicht — Whitelist-Eintrag waere eine Geisterspalte';
  end if;

  v_before := array_length(public._tracked_audit_columns('projects'), 1);
  if 'settings' = any(public._tracked_audit_columns('projects')) then
    raise notice 'PROJ-155-beta2: settings steht bereits in der Whitelist — Teil 1 uebersprungen';
  else
    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

    -- Whitespace-tolerant: die Migrationsdateien und die Live-Definition
    -- formatieren diesen Zweig unterschiedlich (PROJ-Y-115c hat genau daran
    -- gebrochen — literaler Anker traf in Prod und scheiterte im Fresh-Apply).
    v_anchor := 'when\s+''projects''\s+then\s+array\[([^\]]*)\]';

    select count(*) into v_hits
    from regexp_matches(v_def, v_anchor, 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-155-beta2: Anker traf % mal statt genau 1 mal', v_hits;
    end if;

    v_new := regexp_replace(v_def, v_anchor, 'when ''projects'' then array[\1,''settings'']');
    if v_new = v_def then
      raise exception 'PROJ-155-beta2: Anker-Ersetzung war ein No-op';
    end if;
    execute v_new;

    -- Re-Grant: CREATE OR REPLACE erhaelt die ACL, aber verlassen wird sich
    -- darauf nicht (die Funktion ist ueber Slices hinweg mehrfach neu gebaut
    -- worden).
    revoke all on function public._tracked_audit_columns(text) from public, anon;
    grant execute on function public._tracked_audit_columns(text) to authenticated;
  end if;

  -- Post-Verifikation: Delta statt Absolutzahl (PROJ-130-alpha-Lehre — eine in
  -- einer Umgebung gemessene Absolutzahl ist in der anderen zwangslaeufig falsch).
  v_after := array_length(public._tracked_audit_columns('projects'), 1);
  if not ('settings' = any(public._tracked_audit_columns('projects'))) then
    raise exception 'PROJ-155-beta2: settings fehlt nach der Ersetzung';
  end if;
  if v_after <> v_before + 1 then
    raise exception 'PROJ-155-beta2: Spaltenzahl % statt % — Geschwister verloren?', v_after, v_before + 1;
  end if;

  -- Geschwister-Stichprobe: die zwoelf Bestandsspalten muessen alle erhalten sein.
  foreach v_col in array array['name','description','project_number','planned_start_date',
                                  'planned_end_date','responsible_user_id','project_type',
                                  'project_method','lifecycle_status','type_specific_data',
                                  'confidentiality_level','is_deleted']
  loop
    if not (v_col = any(public._tracked_audit_columns('projects'))) then
      raise exception 'PROJ-155-beta2: Bestandsspalte % verloren', v_col;
    end if;
  end loop;

  -- Und ein fremder Zweig als Gegenprobe, dass nur `projects` angefasst wurde.
  if array_length(public._tracked_audit_columns('risks'), 1) is null then
    raise exception 'PROJ-155-beta2: Zweig risks beschaedigt';
  end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- Teil 2 — `apply_schedule_shifts`: eine Transaktion fuer die ganze Kaskade
--
-- AC-15: „schreibt in EINER Anfrage; schlaegt sie fehl, ist KEIN Termin
-- geaendert." AC-20 zieht denselben Pfad fuer den Meilenstein-Mitzug der Phase
-- ein, der heute ueber `Promise.all` mit `.catch(() => undefined)` laeuft — N
-- Schreibvorgaenge, keine Transaktion, Fehler verschluckt.
--
-- **`SECURITY INVOKER`, und das ist die tragende Entscheidung.** Die Funktion
-- rechnet NICHT — sie schreibt eine fertige Liste. Damit gibt es keinen Grund,
-- die Rechte des Aufrufers zu verlassen: die RLS auf `work_items`, `phases` und
-- `milestones` entscheidet weiter (gemessen: 2 / 2 / 1 UPDATE-Policies). Eine
-- DEFINER-Fassung muesste die Projektrolle erneut hinschreiben und waere eine
-- zweite Berechtigungsstelle, die von den Policies abdriften kann — dieselbe
-- Begruendung wie bei `decrypt_user_mailbox_credential` (PROJ-Y-158a).
--
-- Die Rechnung bleibt bewusst in TypeScript (`lib/work-items/schedule-cascade.ts`),
-- damit Vorschau und autoritative Rechnung durch EINE Formel laufen und das
-- Risiko R-A des Briefs (zwei Kopien, PROJ-45-gamma-Klasse) nicht entsteht.
-- ---------------------------------------------------------------------------
create or replace function public.apply_schedule_shifts(
  p_project_id uuid,
  p_shifts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_shift jsonb;
  v_kind text;
  v_id uuid;
  v_rows int;
  v_work_items int := 0;
  v_phases int := 0;
  v_milestones int := 0;
begin
  if p_project_id is null then
    raise exception 'project_id is required' using errcode = '22023';
  end if;
  if p_shifts is null or jsonb_typeof(p_shifts) <> 'array' then
    raise exception 'shifts must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shifts) = 0 then
    raise exception 'shifts must not be empty' using errcode = '22023';
  end if;
  -- Obergrenze: eine Kaskade ueber mehr als 500 Objekte ist kein Zug mehr,
  -- sondern eine Umplanung. Ohne Deckel waere die Transaktion unbegrenzt.
  if jsonb_array_length(p_shifts) > 500 then
    raise exception 'too many shifts (max 500)' using errcode = '22023';
  end if;

  for v_shift in select * from jsonb_array_elements(p_shifts)
  loop
    v_kind := v_shift ->> 'kind';
    begin
      v_id := (v_shift ->> 'id')::uuid;
    exception when others then
      raise exception 'invalid id in shift: %', v_shift ->> 'id' using errcode = '22023';
    end;

    if v_kind = 'work_item' then
      update public.work_items
         set planned_start = (v_shift ->> 'start')::date,
             planned_end   = (v_shift ->> 'end')::date
       where id = v_id
         and project_id = p_project_id
         and is_deleted = false;
      get diagnostics v_rows = row_count;
      v_work_items := v_work_items + v_rows;

    elsif v_kind = 'phase' then
      update public.phases
         set planned_start = (v_shift ->> 'start')::date,
             planned_end   = (v_shift ->> 'end')::date
       where id = v_id
         and project_id = p_project_id;
      get diagnostics v_rows = row_count;
      v_phases := v_phases + v_rows;

    elsif v_kind = 'milestone' then
      update public.milestones
         set target_date = (v_shift ->> 'target')::date
       where id = v_id
         and project_id = p_project_id;
      get diagnostics v_rows = row_count;
      v_milestones := v_milestones + v_rows;

    else
      raise exception 'unknown shift kind: %', coalesce(v_kind, '<null>')
        using errcode = '22023';
    end if;

    -- **Kein Teilerfolg.** Traf ein UPDATE keine Zeile, ist die Anfrage falsch
    -- (fremdes Projekt, geloescht, oder von der RLS verborgen) — dann wird die
    -- ganze Transaktion verworfen statt die Haelfte zu schreiben. Genau das
    -- fordert AC-15, und genau das fehlt dem heutigen `Promise.all`-Pfad.
    if v_rows = 0 then
      raise exception 'shift target not writable: % %', v_kind, v_id
        using errcode = 'P0002';
    end if;
  end loop;

  return jsonb_build_object(
    'work_items', v_work_items,
    'phases', v_phases,
    'milestones', v_milestones,
    'total', v_work_items + v_phases + v_milestones
  );
end
$fn$;

revoke all on function public.apply_schedule_shifts(uuid, jsonb) from public, anon;
grant execute on function public.apply_schedule_shifts(uuid, jsonb) to authenticated;

comment on function public.apply_schedule_shifts(uuid, jsonb) is
  'PROJ-155-beta2: schreibt eine fertig berechnete Termin-Kaskade atomar. '
  'SECURITY INVOKER — die RLS des Aufrufers entscheidet, es gibt keine zweite '
  'Berechtigungsstelle. Rechnet NICHT; die Rechnung ist '
  'lib/work-items/schedule-cascade.ts, damit Vorschau und Uebernahme durch eine '
  'Formel laufen.';

-- Post-Verifikation: INVOKER und keine offenen Rechte.
do $chk$
begin
  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'apply_schedule_shifts') then
    raise exception 'PROJ-155-beta2: apply_schedule_shifts ist DEFINER — INVOKER war die Entscheidung';
  end if;
  if has_function_privilege('anon', 'public.apply_schedule_shifts(uuid, jsonb)', 'EXECUTE') then
    raise exception 'PROJ-155-beta2: anon darf apply_schedule_shifts ausfuehren';
  end if;
end
$chk$;

