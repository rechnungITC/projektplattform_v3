-- PROJ-45-δ — Bauspezifische Terminsignale (/backend)
--
-- Liefert die Auswertung hinter der Projektraum-Fläche „Terminsignale": Gewerk-Signale,
-- Abschnittsfortschritt, nächste Fristen und die Engpass-Sicht der überfälligen Mängel.
--
-- Keine neue Tabelle, kein Register-Eingriff, kein gespeicherter Signalzustand (L30).
-- Alle Auswertungen sind SECURITY INVOKER: die Sichtbarkeit erbt vom Aufrufer, ein
-- DEFINER-Aggregat über gegatete Zeilen wäre ein Leck (Hausregel „Aggregates leak").
--
-- D-δ4 (erweitert nach Messung): die beiden „offen"-Begriffe der Extension werden zu je
-- EINER SQL-Autorität. Live gemessen tragen vier Funktionen das Wort `in_bearbeitung`:
--   * `_construction_defect_is_overdue`      → 1× die Paar-Liste  ⇒ wird umgestellt
--   * `record_construction_acceptance`       → 1× die Dreier-Liste ⇒ wird umgestellt
--   * `construction_defect_summary`          → 1× als Einzelstatus-Zählung, keine Regel
--   * `transition_construction_defect_status`→ 4× als Zustandsübergänge, keine Regel
-- Die letzten zwei bleiben unberührt; sie kopieren keine Regel.

-- ── 1) Die zwei Prädikate als geteilte Autorität ─────────────────────────────────────

-- β-Regel: ein Mangel ist „offen" in `offen` und `in_bearbeitung`.
-- `erledigt` gehört bewusst NICHT dazu — dort ist fertiggemeldet und die Prüfung wartet;
-- die Verspätung läge dann bei der Bauleitung, nicht beim Nachunternehmer.
create or replace function public._construction_defect_is_open(p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_status in ('offen','in_bearbeitung')
$$;

revoke execute on function public._construction_defect_is_open(text) from public, anon;
grant execute on function public._construction_defect_is_open(text) to authenticated;

-- γ-Regel: für eine Abnahme ist ein Vorbehalt offen, solange niemand nachgesehen hat —
-- `erledigt` zählt hier ALSO MIT. Das ist die bewusste Gegenrichtung zur Regel oben;
-- wer beide verwechselt, liegt an genau einer Stelle falsch und zwar unauffällig.
create or replace function public._construction_reservation_is_open(p_status text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_status in ('offen','in_bearbeitung','erledigt')
$$;

revoke execute on function public._construction_reservation_is_open(text) from public, anon;
grant execute on function public._construction_reservation_is_open(text) to authenticated;

-- ── 2) Bestand auf die Autoritäten umstellen (Anker-Ersetzung aus der Live-Definition) ──
-- Whitespace-tolerant, Treffer gezählt, Post-Verifikation, Re-Grant. Ein Anker darf nie
-- auf Text prüfen, den die Migration selbst schreibt (PROJ-45-α-Lehre).
do $mig$
declare
  v_def   text;
  v_new   text;
  v_hits  integer;
  v_sig   text;
  v_anchor text;
begin
  -- (a) β-Überfälligkeitshelfer → `_construction_defect_is_open`
  v_anchor := 'and\s+p_status\s+in\s*\(\s*''offen''\s*,\s*''in_bearbeitung''\s*\)';
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = '_construction_defect_is_overdue';
  if v_def is null then
    raise exception 'PROJ-45-delta: _construction_defect_is_overdue not found';
  end if;
  if position('_construction_defect_is_open' in v_def) > 0 then
    raise notice 'PROJ-45-delta: _construction_defect_is_overdue already repointed';
  else
    select count(*) into v_hits from regexp_matches(v_def, v_anchor, 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-delta: open-status anchor expected exactly once, found %', v_hits;
    end if;
    v_new := regexp_replace(v_def, v_anchor, 'and public._construction_defect_is_open(p_status)');
    execute v_new;
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname = '_construction_defect_is_overdue';
    if position('_construction_defect_is_open' in v_def) = 0 then
      raise exception 'PROJ-45-delta: repoint of _construction_defect_is_overdue did not take';
    end if;
    if v_def ~ v_anchor then
      raise exception 'PROJ-45-delta: literal open-status list still present after repoint';
    end if;
  end if;
  revoke execute on function public._construction_defect_is_overdue(text, date) from public, anon;
  grant  execute on function public._construction_defect_is_overdue(text, date) to authenticated;

  -- (b) γ-Protokollierfunktion → `_construction_reservation_is_open`
  v_anchor := 'and\s+d\.status\s+in\s*\(\s*''offen''\s*,\s*''in_bearbeitung''\s*,\s*''erledigt''\s*\)';
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = 'record_construction_acceptance';
  if v_def is null then
    raise exception 'PROJ-45-delta: record_construction_acceptance not found';
  end if;
  if position('_construction_reservation_is_open' in v_def) > 0 then
    raise notice 'PROJ-45-delta: record_construction_acceptance already repointed';
  else
    select count(*) into v_hits from regexp_matches(v_def, v_anchor, 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-delta: reservation anchor expected exactly once, found %', v_hits;
    end if;
    v_new := regexp_replace(v_def, v_anchor, 'and public._construction_reservation_is_open(d.status)');
    execute v_new;
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname = 'record_construction_acceptance';
    if position('_construction_reservation_is_open' in v_def) = 0 then
      raise exception 'PROJ-45-delta: repoint of record_construction_acceptance did not take';
    end if;
    if v_def ~ v_anchor then
      raise exception 'PROJ-45-delta: literal reservation list still present after repoint';
    end if;
    -- Die Geschwister-Zweige derselben Funktion müssen erhalten sein: sie trägt die
    -- Vorbehalts-Einsammlung, den Gewährleistungs-Block und den Ereignis-Eintrag.
    if position('create_construction_defect' in v_def) = 0
       or position('construction_acceptance_events' in v_def) = 0
       or position('warranty_end_date' in v_def) = 0 then
      raise exception 'PROJ-45-delta: sibling branches lost in record_construction_acceptance';
    end if;
  end if;
  select pg_get_function_identity_arguments(p.oid) into v_sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'record_construction_acceptance';
  execute format('revoke execute on function public.record_construction_acceptance(%s) from public, anon', v_sig);
  execute format('grant execute on function public.record_construction_acceptance(%s) to authenticated', v_sig);
end
$mig$;

-- ── 3) Die Auswertung ────────────────────────────────────────────────────────────────
-- Ein Aufruf, vier Blöcke, EIN Zeitbezug (D-δ1): vier getrennte Aufrufe könnten über
-- Mitternacht auseinanderfallen und Kopfzahlen zeigen, die zu ihren Listen nicht passen.
--
-- Messung, die D-δ2 präzisiert: `construction_defect_summary.by_trade` gruppiert über die
-- Mängel und listet damit NUR Gewerke mit Befund — AC-45δ.1 verlangt aber alle. Die
-- Gewerk-Liste entsteht deshalb hier aus `project_construction_trades`; wiederverwendet
-- werden die PRÄDIKATE (je eine Autorität), nicht die Gruppierung. Dass die überlappenden
-- Zahlen übereinstimmen, prüft der Pentest gegen die β-Auswertung.
create or replace function public.construction_schedule_signals(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive ref as (
    select current_date as as_of, 14 as window_days
  ),
  trades as (
    select pt.id            as project_trade_id,
           pt.trade_id      as catalog_trade_id,
           c.label          as trade_label,
           pt.rag_status    as manual_status,
           pt.responsible_user_id,
           pt.sort_order
      from public.project_construction_trades pt
      join public.construction_trades c on c.id = pt.trade_id
     where pt.project_id = p_project_id
  ),
  sections as (
    select s.id, s.parent_id, s.label, s.sort_order
      from public.construction_sections s
     where s.project_id = p_project_id
  ),
  -- Teilbaum rekursiv über `parent_id` (D-δ3) — dieselbe Technik wie
  -- `construction_section_blocking_refs` und der γ-Protokollierpfad. Der von α angelegte
  -- `ltree` mit GiST-Index bleibt vorerst ungenutzt (PROJ-Y-45j); `path` ist `nullable`
  -- ohne CHECK, die rekursive Form ist davon unabhängig.
  closure as (
    select s.id as anchor_id, s.id as node_id, 0 as depth
      from sections s
    union all
    select cl.anchor_id, s.id, cl.depth + 1
      from closure cl
      join sections s on s.parent_id = cl.node_id
     where cl.depth < 20
  ),
  defects as (
    select d.id, d.defect_number, d.title, d.status, d.severity, d.due_date,
           d.trade_id, d.section_id, d.responsible_user_id,
           public._construction_defect_is_overdue(d.status, d.due_date) as is_overdue,
           (d.status = 'erledigt')                                      as is_awaiting_review,
           (public._construction_defect_is_open(d.status) and d.due_date is null) as is_without_due,
           case when public._construction_defect_is_overdue(d.status, d.due_date)
                then ((select as_of from ref) - d.due_date)
                else 0 end                                             as days_overdue
      from public.construction_defects d
     where d.project_id = p_project_id
  ),
  acceptances as (
    select a.id, a.acceptance_number, a.title, a.status, a.scheduled_for,
           a.trade_id, a.section_id,
           (a.status = 'verweigert')                                    as is_refused,
           (a.status = 'angesetzt'
             and a.scheduled_for < (select as_of from ref))             as is_overdue_scheduled,
           (a.status = 'abgenommen_unter_vorbehalt' and exists (
              select 1
                from public.construction_acceptance_reservations r
                join public.construction_defects rd on rd.id = r.defect_id
               where r.acceptance_id = a.id
                 and public._construction_reservation_is_open(rd.status)
           ))                                                           as has_open_reservations
      from public.construction_acceptances a
     where a.project_id = p_project_id
  ),
  trade_rows as (
    select t.*,
           (select count(*) from defects d
             where d.trade_id = t.project_trade_id and d.is_overdue)            as overdue_defects,
           (select count(*) from defects d
             where d.trade_id = t.project_trade_id and d.is_without_due)        as defects_without_due_date,
           (select count(*) from defects d
             where d.trade_id = t.project_trade_id and d.is_awaiting_review)    as defects_awaiting_review,
           (select count(*) from acceptances a
             where a.trade_id = t.project_trade_id and a.is_refused)            as acceptances_refused,
           (select count(*) from acceptances a
             where a.trade_id = t.project_trade_id and a.is_overdue_scheduled)  as acceptances_overdue_scheduled,
           (select count(*) from acceptances a
             where a.trade_id = t.project_trade_id and a.has_open_reservations) as acceptances_with_open_reservations
      from trades t
  ),
  -- Fortschritt aus Arbeitspaketen (L28, D-δ5): Zähler `done`, Nenner alle nicht
  -- verworfenen. Verworfene fallen aus dem Nenner — abweichend von PROJ-102, weil ein
  -- Fortschritt, der 100 % nie erreichen kann, auf einer operativen Fläche irreführt.
  -- Überfällig folgt der Engpass-Sicht aus PROJ-103 wörtlich: gesetztes `due_date`,
  -- vor heute, Status `todo`/`in_progress`/`blocked`.
  section_work as (
    select cl.anchor_id                                                   as section_id,
           count(*)                                                       as linked_total,
           count(*) filter (where wi.status <> 'cancelled')                as denominator,
           count(*) filter (where wi.status = 'done')                      as done_count,
           count(*) filter (where wi.due_date is not null
                              and wi.due_date < (select as_of from ref)
                              and wi.status in ('todo','in_progress','blocked')) as overdue_items
      from closure cl
      join public.work_items wi on wi.section_id = cl.node_id
     where wi.is_deleted = false
     group by cl.anchor_id
  ),
  section_phase as (
    select cl.anchor_id                                                   as section_id,
           count(*)                                                       as linked_total,
           count(*) filter (where ph.status <> 'cancelled')                as denominator,
           count(*) filter (where ph.status = 'completed')                 as done_count
      from closure cl
      join public.construction_section_phases sp on sp.section_id = cl.node_id
      join public.phases ph on ph.id = sp.phase_id and ph.is_deleted = false
     group by cl.anchor_id
  ),
  section_rows as (
    select s.id, s.parent_id, s.label, s.sort_order,
           (select max(depth) from closure cl where cl.anchor_id = s.id)   as subtree_depth,
           coalesce(sw.linked_total, 0)  as work_linked,
           coalesce(sw.denominator, 0)   as work_denominator,
           coalesce(sw.done_count, 0)    as work_done,
           coalesce(sw.overdue_items, 0) as overdue_items,
           coalesce(sp.linked_total, 0)  as phase_linked,
           coalesce(sp.denominator, 0)   as phase_denominator,
           coalesce(sp.done_count, 0)    as phase_done
      from sections s
      left join section_work  sw on sw.section_id = s.id
      left join section_phase sp on sp.section_id = s.id
  ),
  deadlines as (
    select 'mangel'::text as kind,
           d.id           as ref_id,
           d.defect_number as ref_number,
           d.title        as label,
           d.due_date     as due_on,
           d.trade_id     as project_trade_id,
           d.section_id
      from defects d
     where d.due_date is not null
       and public._construction_defect_is_open(d.status)
       and d.due_date <= ((select as_of from ref) + (select window_days from ref))
    union all
    select 'abnahme'::text,
           a.id,
           a.acceptance_number,
           coalesce(a.title, 'Abnahme vom ' || a.scheduled_for::text),
           a.scheduled_for,
           a.trade_id,
           a.section_id
      from acceptances a
     where a.status = 'angesetzt'
       and a.scheduled_for <= ((select as_of from ref) + (select window_days from ref))
  )
  select jsonb_build_object(
    'project_id',  p_project_id,
    'as_of',       (select as_of from ref),
    'window_days', (select window_days from ref),
    -- Kopfzahlen über die UNGEFILTERTE Menge (AC-45δ.15), nicht über angezeigte Zeilen.
    'summary', jsonb_build_object(
      'overdue_defects',          (select count(*) from defects where is_overdue),
      'defects_without_due_date', (select count(*) from defects where is_without_due),
      'defects_awaiting_review',  (select count(*) from defects where is_awaiting_review),
      'blocked_trades',           (select count(*) from trade_rows
                                    where overdue_defects > 0
                                       or acceptances_refused > 0
                                       or acceptances_overdue_scheduled > 0
                                       or acceptances_with_open_reservations > 0),
      'trades_total',             (select count(*) from trades),
      'sections_total',           (select count(*) from sections)
    ),
    'trades', coalesce((
      select jsonb_agg(x order by x ->> 'trade_label')
        from (
          select jsonb_build_object(
                   'project_trade_id', tr.project_trade_id,
                   'trade_id',         tr.catalog_trade_id,
                   'trade_label',      tr.trade_label,
                   'manual_status',    tr.manual_status,
                   'responsible_user_id', tr.responsible_user_id,
                   'is_blocked', (tr.overdue_defects > 0
                                   or tr.acceptances_refused > 0
                                   or tr.acceptances_overdue_scheduled > 0
                                   or tr.acceptances_with_open_reservations > 0),
                   -- Der Grund wird BENANNT, nicht nur die Farbe gezeigt (AC-45δ.3).
                   'blocker_reasons', (
                     select coalesce(jsonb_agg(r), '[]'::jsonb) from (
                       select 'overdue_defects'::text as r where tr.overdue_defects > 0
                       union all
                       select 'acceptance_refused' where tr.acceptances_refused > 0
                       union all
                       select 'acceptance_overdue' where tr.acceptances_overdue_scheduled > 0
                       union all
                       select 'reservations_open' where tr.acceptances_with_open_reservations > 0
                     ) reasons
                   ),
                   'overdue_defects',          tr.overdue_defects,
                   'defects_without_due_date',  tr.defects_without_due_date,
                   'defects_awaiting_review',   tr.defects_awaiting_review,
                   'acceptances_refused',       tr.acceptances_refused,
                   'acceptances_overdue_scheduled', tr.acceptances_overdue_scheduled,
                   'acceptances_with_open_reservations', tr.acceptances_with_open_reservations
                 ) as x
            from trade_rows tr
        ) g
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(x order by (x ->> 'sort_order')::int, x ->> 'label')
        from (
          select jsonb_build_object(
                   'section_id', sr.id,
                   'parent_id',  sr.parent_id,
                   'label',      sr.label,
                   'sort_order', sr.sort_order,
                   'subtree_depth', sr.subtree_depth,
                   -- Quelle wird ANGEZEIGT (AC-45δ.9); ohne sie ist „0 %" nicht von
                   -- „nichts verknüpft" zu unterscheiden — und das ist der Normalfall.
                   'progress_source', case
                       when sr.work_linked > 0  then 'work_items'
                       when sr.phase_linked > 0 then 'phases'
                       else null end,
                   'source_count', case
                       when sr.work_linked > 0  then sr.work_denominator
                       when sr.phase_linked > 0 then sr.phase_denominator
                       else 0 end,
                   'linked_count', case
                       when sr.work_linked > 0  then sr.work_linked
                       when sr.phase_linked > 0 then sr.phase_linked
                       else 0 end,
                   'progress_percent', case
                       when sr.work_linked > 0 and sr.work_denominator > 0
                         then round(100.0 * sr.work_done / sr.work_denominator)
                       when sr.work_linked = 0 and sr.phase_linked > 0 and sr.phase_denominator > 0
                         then round(100.0 * sr.phase_done / sr.phase_denominator)
                       else null end,
                   'overdue_items', sr.overdue_items,
                   -- Auch wenn Arbeitspakete führen, werden Phasen nicht stillschweigend
                   -- verworfen (Edge Case „Arbeitspakete UND Phasen").
                   'phase_linked_count', sr.phase_linked
                 ) as x
            from section_rows sr
        ) g
    ), '[]'::jsonb),
    'deadlines', coalesce((
      select jsonb_agg(x order by (x ->> 'due_on')::date, x ->> 'kind', (x ->> 'ref_number')::int)
        from (
          select jsonb_build_object(
                   'kind',       dl.kind,
                   'ref_id',     dl.ref_id,
                   'ref_number', dl.ref_number,
                   'label',      dl.label,
                   'due_on',     dl.due_on,
                   'is_elapsed', (dl.due_on < (select as_of from ref)),
                   'project_trade_id', dl.project_trade_id,
                   'trade_label', (select t.trade_label from trades t
                                    where t.project_trade_id = dl.project_trade_id),
                   'section_id',  dl.section_id,
                   'section_label', (select s.label from sections s where s.id = dl.section_id)
                 ) as x
            from deadlines dl
        ) g
    ), '[]'::jsonb),
    -- Engpass-Sicht: erfüllt die ABSICHT von AC-45β.18 an einem Ort, den ein Bauprojekt
    -- erreicht. `project_task_bottlenecks` bleibt unberührt (D-δ8, L25).
    'overdue_defects', coalesce((
      select jsonb_agg(x order by (x ->> 'days_overdue')::int desc, (x ->> 'ref_number')::int)
        from (
          select jsonb_build_object(
                   'defect_id',    d.id,
                   'ref_number',   d.defect_number,
                   'title',        d.title,
                   'severity',     d.severity,
                   'status',       d.status,
                   'due_date',     d.due_date,
                   'days_overdue', d.days_overdue,
                   'project_trade_id', d.trade_id,
                   'trade_label',  (select t.trade_label from trades t
                                     where t.project_trade_id = d.trade_id),
                   'section_id',   d.section_id,
                   'section_label',(select s.label from sections s where s.id = d.section_id),
                   'responsible_user_id', d.responsible_user_id
                 ) as x
            from defects d
           where d.is_overdue
        ) g
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.construction_schedule_signals(uuid) from public, anon;
grant  execute on function public.construction_schedule_signals(uuid) to authenticated;

-- ── 4) Post-Conditions ──────────────────────────────────────────────────────────────
do $post$
declare
  v_secdef boolean;
  v_vol    char;
  v_anon   boolean;
  v_pub    boolean;
  v_auth   boolean;
  v_sp     text;
  v_name   text;
begin
  foreach v_name in array array['construction_schedule_signals',
                                '_construction_defect_is_open',
                                '_construction_reservation_is_open'] loop
    select p.prosecdef, p.provolatile,
           coalesce(array_to_string(p.proconfig, ','), '')
      into v_secdef, v_vol, v_sp
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname = v_name;
    if v_secdef is null then
      raise exception 'PROJ-45-delta: % missing after migration', v_name;
    end if;
    if v_secdef then
      raise exception 'PROJ-45-delta: % must be SECURITY INVOKER', v_name;
    end if;
    if v_vol = 'v' then
      raise exception 'PROJ-45-delta: % must not be VOLATILE', v_name;
    end if;
    if position('search_path' in v_sp) = 0 then
      raise exception 'PROJ-45-delta: % has no search_path', v_name;
    end if;
  end loop;

  -- `anon` UND PUBLIC ohne EXECUTE, `authenticated` mit (PROJ-Y-114a-Lehre: vollständig
  -- prüfen, nicht als Stichprobe). PUBLIC rendert in der ACL mit LEEREM Empfänger, also
  -- als Eintrag, der mit `=` BEGINNT — ein naives `%=X/%` würde `authenticated=X/...`
  -- mittreffen (PROJ-45-γ B-γ1).
  foreach v_name in array array['construction_schedule_signals',
                                '_construction_defect_is_open',
                                '_construction_reservation_is_open',
                                '_construction_defect_is_overdue',
                                'record_construction_acceptance'] loop
    select has_function_privilege('anon', p.oid, 'execute'),
           exists (select 1 from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where a::text like '=%'),
           has_function_privilege('authenticated', p.oid, 'execute')
      into v_anon, v_pub, v_auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname = v_name;
    if v_anon then
      raise exception 'PROJ-45-delta: anon can execute %', v_name;
    end if;
    if v_pub then
      raise exception 'PROJ-45-delta: PUBLIC still holds a grant on %', v_name;
    end if;
    if not v_auth then
      raise exception 'PROJ-45-delta: authenticated cannot execute %', v_name;
    end if;
  end loop;

  raise notice 'PROJ-45-delta: post-conditions ok';
end
$post$;
