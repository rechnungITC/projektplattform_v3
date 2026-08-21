-- PROJ-Y-45f / PROJ-Y-45l — DB-Hygiene-Gruppe der Bau-Erweiterung
--
-- Drei Anliegen, eine Migration, weil sie denselben Abschnittsbaum betreffen:
--
--  1. PROJ-Y-45f — `construction_section_blocking_defects` ziehen. γ hat die
--     Entfernen-Auskunft auf `construction_section_blocking_refs`
--     verallgemeinert (Art + Bezeichnung, Mangel UND Abnahme); die β-Funktion
--     steht seit dem γ-Deploy ohne Aufrufer in Prod. Live gemessen: 0 Aufrufer
--     in Funktionskörpern, Views, Policies, CHECKs und Defaults, 0 in `src/`.
--
--  2. PROJ-Y-45l (Ursache) — der Zyklus-Zweig des Abschnitts-Wächters hing an
--     `OLD.path is not null` und wurde übersprungen, sobald `path` genullt war.
--     `path` ist nullable OHNE CHECK, steht NICHT in der Spaltenliste des
--     Wächter-Triggers, und `authenticated` hält das UPDATE-Recht darauf.
--     Live in einer zurückgerollten Transaktion belegt: mit gesetztem `path`
--     wird der Zyklus abgelehnt (23514), nach `set path = null` gelingt
--     derselbe Zyklus (2 Zyklus-Kanten). Folge: die ungekappte γ-Auskunft
--     `construction_section_blocking_refs` HÄNGT dann (57014 gemessen) — und
--     die wird von der deployten „Abschnitt entfernen"-Route gerufen.
--     Der Zyklus-Test wird deshalb `path`-unabhängig: ein begrenzter Lauf
--     aufwärts über `parent_id`. Das ist die Prüfung, die der Wächter meinte.
--
--  3. PROJ-Y-45l (Symptom) — der Tiefen-Riegel der Terminsignale hat still
--     unterberichtet: bei einem tieferen Teilbaum als der Riegel zählte die
--     Wurzel nur bis zur Riegelhöhe, ohne dass die Fläche das sagen konnte.
--     Der Riegel bleibt (er ist tragend, siehe 2 — ohne ihn hätte die
--     Auswertung auf einem Zyklus gehangen statt zu niedrig zu zählen), wird
--     angehoben und die Kappung wird AUSGEWIESEN statt verschwiegen.
--
-- Nicht in dieser Migration: PROJ-Y-45m. Gemessen ist das eine produktweite
-- Konvention (11 von 11 projektbezogenen Auswertungsfunktionen filtern
-- `projects.is_deleted` nicht, und keine der vier Bau-RLS-Policies tut es
-- entweder) mit EINER Durchsetzungsstelle in der Anwendung
-- (`requireProjectAccess` → 404). Sie wird dokumentiert und dort festgenagelt,
-- nicht in einer Slice einseitig in eine Funktion kopiert.

-- ---------------------------------------------------------------------------
-- 1) PROJ-Y-45f — toten Code ziehen, aber erst nachsehen
-- ---------------------------------------------------------------------------
do $$
declare
  v_callers text;
begin
  -- Vorbedingung: kein Aufrufer irgendwo in der Datenbank. Laut statt leise —
  -- eine Migration, die eine noch gerufene Funktion zieht, soll abbrechen.
  select string_agg(site || ':' || name, ', ') into v_callers
  from (
    select 'function' as site, n.nspname || '.' || p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'extensions') and p.prokind = 'f'
       and n.nspname || '.' || p.proname <> 'public.construction_section_blocking_defects'
       and pg_get_functiondef(p.oid) ~* 'construction_section_blocking_defects'
    union all
    select 'view', c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('v', 'm') and n.nspname = 'public'
       and pg_get_viewdef(c.oid) ~* 'construction_section_blocking_defects'
    union all
    select 'policy', pol.polname
      from pg_policy pol
     where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
           ~* 'construction_section_blocking_defects'
    union all
    select 'constraint', con.conname
      from pg_constraint con
     where pg_get_constraintdef(con.oid) ~* 'construction_section_blocking_defects'
    union all
    select 'default', a.attname
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where pg_get_expr(d.adbin, d.adrelid) ~* 'construction_section_blocking_defects'
  ) s;

  if v_callers is not null then
    raise exception 'PROJ-Y-45f: Funktion hat noch Aufrufer (%) — nicht gezogen', v_callers;
  end if;
end
$$;

drop function if exists public.construction_section_blocking_defects(uuid);

do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_proc
   where proname = 'construction_section_blocking_defects'
     and pronamespace = 'public'::regnamespace;
  if v_n <> 0 then
    raise exception 'PROJ-Y-45f: Funktion existiert noch (%)', v_n;
  end if;

  -- Die Nachfolgerin muss stehen, sonst hat die Slice die Auskunft entfernt
  -- statt sie zu ersetzen.
  select count(*) into v_n from pg_proc
   where proname in ('construction_section_blocking_refs', 'construction_trade_blocking_refs')
     and pronamespace = 'public'::regnamespace;
  if v_n <> 2 then
    raise exception 'PROJ-Y-45f: Nachfolge-Auskuenfte fehlen (erwartet 2, gefunden %)', v_n;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) PROJ-Y-45l (Ursache) — Zyklus-Test unabhaengig von `path`
-- ---------------------------------------------------------------------------
-- Vollstaendig neu geschrieben statt anker-ersetzt: der Rumpf ist kurz, hat
-- genau EINEN Zweig je Bedingung und keine ueber Slices angesammelten
-- Fallunterscheidungen — die Hausnorm (Anker-Ersetzung aus der Live-Definition)
-- schuetzt Funktionen, die genau das haben. Alle Bestandszweige sind woertlich
-- uebernommen; neu ist allein der Zyklus-Lauf.
create or replace function public.construction_section_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_parent record;
  v_project_tenant uuid;
  v_walk uuid;
  v_steps int := 0;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'PROJ-45: project % does not exist', NEW.project_id;
  end if;
  if NEW.tenant_id <> v_project_tenant then
    raise exception 'PROJ-45: tenant mismatch between section and project' using errcode = '23514';
  end if;

  if NEW.parent_id is null then
    NEW.path := text2ltree('n' || replace(NEW.id::text, '-', '_'));
    return NEW;
  end if;

  select id, project_id, path into v_parent
    from public.construction_sections where id = NEW.parent_id;
  if v_parent.id is null then
    raise exception 'PROJ-45: parent section does not exist' using errcode = '23503';
  end if;
  if v_parent.project_id <> NEW.project_id then
    raise exception 'PROJ-45: parent section belongs to a different project' using errcode = '23514';
  end if;

  -- PROJ-Y-45l: vom neuen Elternteil aufwaerts laufen. Trifft der Lauf die
  -- eigene Zeile, entstuende ein Zyklus. Bewusst ueber `parent_id` statt ueber
  -- `path`: der Bestandszweig prueft `v_parent.path <@ OLD.path` und wurde
  -- uebersprungen, sobald `OLD.path` null war — live als Umgehung belegt.
  -- Der Zaehler ist ein Notausstieg fuer den Fall, dass eine Zeile aus der Zeit
  -- vor diesem Waechter doch in einem Zyklus haengt; er ersetzt keine Prueflogik.
  v_walk := NEW.parent_id;
  while v_walk is not null loop
    if v_walk = NEW.id then
      raise exception 'PROJ-45: cycle rejected' using errcode = '23514';
    end if;
    v_steps := v_steps + 1;
    if v_steps > 1000 then
      raise exception 'PROJ-45: section ancestry is cyclic or deeper than 1000'
        using errcode = '23514';
    end if;
    select parent_id into v_walk from public.construction_sections where id = v_walk;
  end loop;

  NEW.path := v_parent.path operator(public.||) text2ltree('n' || replace(NEW.id::text, '-', '_'));
  return NEW;
end;
$function$;

revoke all on function public.construction_section_guard() from public;
revoke all on function public.construction_section_guard() from anon;
revoke all on function public.construction_section_guard() from authenticated;

do $$
declare
  v_def text;
  v_n int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'construction_section_guard' and pronamespace = 'public'::regnamespace;

  -- Der neue Lauf ist da ...
  if v_def !~ 'v_walk := NEW\.parent_id' then
    raise exception 'PROJ-Y-45l: Zyklus-Lauf fehlt im Waechter';
  end if;
  -- ... und der `path`-abhaengige Zweig ist WEG (sonst haette die Migration
  -- nur etwas hinzugefuegt und die Umgehung bliebe bestehen).
  if v_def ~ 'OLD\.path is not null' then
    raise exception 'PROJ-Y-45l: der path-abhaengige Zyklus-Zweig steht noch';
  end if;
  -- Die drei Bestands-Zusicherungen muessen erhalten sein.
  if v_def !~ 'tenant mismatch between section and project'
     or v_def !~ 'parent section does not exist'
     or v_def !~ 'parent section belongs to a different project' then
    raise exception 'PROJ-Y-45l: ein Bestandszweig des Waechters ist verloren';
  end if;

  select count(*) into v_n from pg_trigger
   where tgrelid = 'public.construction_sections'::regclass
     and tgname = 'construction_sections_guard' and not tgisinternal;
  if v_n <> 1 then
    raise exception 'PROJ-Y-45l: Waechter-Trigger fehlt (%)', v_n;
  end if;

  -- Bestandsaufnahme: in Prod 0 Zyklen. Gibt es doch einen, soll die Migration
  -- ihn benennen statt ihn stehen zu lassen.
  select count(*) into v_n
    from public.construction_sections s1
    join public.construction_sections s2 on s2.id = s1.parent_id
   where s2.parent_id = s1.id;
  if v_n <> 0 then
    raise exception 'PROJ-Y-45l: % bestehende Zyklus-Kante(n) im Abschnittsbaum', v_n;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) PROJ-Y-45l (Symptom) — Kappung ausweisen statt verschweigen
-- ---------------------------------------------------------------------------
-- Geaendert gegenueber der δ-Fassung ist AUSSCHLIESSLICH der Abschnitts-Teil:
-- der Riegel steht als benannter Wert in `ref` (20 → 50), die Schliessung laeuft
-- eine Ebene TIEFER als gezaehlt wird, gezaehlt wird bis zum Riegel, und die
-- Kappung erscheint je Abschnitt als `subtree_truncated`. Damit ist die Grenze
-- exakt erkennbar statt geschaetzt: ein Baum, der genau bis zum Riegel reicht,
-- gilt NICHT als gekappt.
create or replace function public.construction_schedule_signals(p_project_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with recursive ref as (
    select current_date as as_of, 14 as window_days, 50 as depth_cap
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
  closure as (
    select s.id as anchor_id, s.id as node_id, 0 as depth
      from sections s
    union all
    select cl.anchor_id, s.id, cl.depth + 1
      from closure cl
      join sections s on s.parent_id = cl.node_id
     where cl.depth < (select depth_cap from ref) + 1
  ),
  counted as (
    select * from closure where depth <= (select depth_cap from ref)
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
  section_work as (
    select cl.anchor_id                                                   as section_id,
           count(*)                                                       as linked_total,
           count(*) filter (where wi.status <> 'cancelled')                as denominator,
           count(*) filter (where wi.status = 'done')                      as done_count,
           count(*) filter (where wi.due_date is not null
                              and wi.due_date < (select as_of from ref)
                              and wi.status in ('todo','in_progress','blocked')) as overdue_items
      from counted cl
      join public.work_items wi on wi.section_id = cl.node_id
     where wi.is_deleted = false
     group by cl.anchor_id
  ),
  section_phase as (
    select cl.anchor_id                                                   as section_id,
           count(*)                                                       as linked_total,
           count(*) filter (where ph.status <> 'cancelled')                as denominator,
           count(*) filter (where ph.status = 'completed')                 as done_count
      from counted cl
      join public.construction_section_phases sp on sp.section_id = cl.node_id
      join public.phases ph on ph.id = sp.phase_id and ph.is_deleted = false
     group by cl.anchor_id
  ),
  section_rows as (
    select s.id, s.parent_id, s.label, s.sort_order,
           (select max(depth) from counted cl where cl.anchor_id = s.id)    as subtree_depth,
           (select max(depth) from closure cl where cl.anchor_id = s.id)
             > (select depth_cap from ref)                                 as subtree_truncated,
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
    'section_depth_cap', (select depth_cap from ref),
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
                   'subtree_truncated', coalesce(sr.subtree_truncated, false),
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
$function$;

revoke all on function public.construction_schedule_signals(uuid) from public;
revoke all on function public.construction_schedule_signals(uuid) from anon;
grant execute on function public.construction_schedule_signals(uuid) to authenticated;

do $$
declare
  v_def text;
  v_n int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'construction_schedule_signals' and pronamespace = 'public'::regnamespace;

  if v_def !~ '50 as depth_cap' then
    raise exception 'PROJ-Y-45l: Riegel steht nicht als benannter Wert in der Auswertung';
  end if;
  if v_def ~ 'cl\.depth < 20' then
    raise exception 'PROJ-Y-45l: der alte harte Riegel 20 steht noch';
  end if;
  if v_def !~ 'subtree_truncated' then
    raise exception 'PROJ-Y-45l: die Kappung wird nicht ausgewiesen';
  end if;
  if v_def !~ 'section_depth_cap' then
    raise exception 'PROJ-Y-45l: der Riegel erscheint nicht in der Nutzlast';
  end if;

  -- Bleibt lesend und ohne Rechte-Erhoehung (δ-Zusicherung).
  select count(*) into v_n from pg_proc
   where proname = 'construction_schedule_signals' and pronamespace = 'public'::regnamespace
     and (prosecdef or provolatile <> 's');
  if v_n <> 0 then
    raise exception 'PROJ-Y-45l: Auswertung ist nicht mehr INVOKER/STABLE';
  end if;

  -- `anon` und PUBLIC ohne EXECUTE: der PUBLIC-Eintrag rendert mit LEEREM
  -- Empfaenger, beginnt also mit `=` (γ-Lehre B-γ1: `%=X/%` trifft auch
  -- `authenticated=X/postgres`).
  select count(*) into v_n
    from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl
   where p.proname in ('construction_schedule_signals', 'construction_section_guard')
     and p.pronamespace = 'public'::regnamespace
     and (acl::text like 'anon=%' or acl::text like '=%');
  if v_n <> 0 then
    raise exception 'PROJ-Y-45l: anon oder PUBLIC hat noch EXECUTE (%)', v_n;
  end if;
end
$$;
