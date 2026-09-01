-- PROJ-155-α — Der Sammelvorgang-Rollup liest die echte Terminspalte.
--
-- Befund, live gegen Prod gemessen (2026-08-28):
-- `tg_work_items_36a_rollup_recompute_fn` liest `attributes->>'planned_start'`.
-- Von 138 lebenden work_items trägt dieses JSONB-Feld **0** Zeilen, während
-- die echte Spalte `work_items.planned_start` bei **4** gesetzt ist. Der
-- Rollup summierte also ein Feld, das kein Schreibpfad füllt — Folge:
-- `derived_planned_start` war bei **0 von 138** Zeilen gesetzt, obwohl der
-- Trigger aktiv ist und feuert. Ein Arbeitspaket bekam damit nie einen
-- abgeleiteten Balken, auch wenn seine Tasks Termine trugen.
--
-- Die Zusage stand längst im Code: PROJ-25 (Migration 20260504060000) legt
-- `planned_start` an, und ihr eigener Spaltenkommentar sagt wörtlich
-- "rolled up via derived_planned_start when this is null". Der PROJ-36a-
-- Rollup-Redeploy (20260504400001) lief **danach** und löste sie nicht ein.
-- Klasse wie PROJ-151s Skill-Lader (`content_md` vs `markdown_content`):
-- zwei Namen für dasselbe Datum, geschrieben wird der eine, gelesen der andere.
--
-- Vorrang der Quellen, bewusst in dieser Reihenfolge:
--   1. `c.planned_start`  — der Schreibpfad von Gantt-Drag und PATCH-Route
--   2. `attributes`       — die Altbestands-Konvention aus PROJ-36
--   3. `derived_*`        — der Rollup der Enkel (mehrstufige Hierarchie)
-- Das JSONB-Feld bleibt als Quelle stehen: es zu entfernen wäre eine zweite,
-- nicht von diesem Befund gedeckte Änderung.
--
-- Die Funktion wird vollständig neu geschrieben statt per Anker ersetzt: sie
-- trägt genau einen Zweig und keine über Slices akkumulierten Feature-Zweige
-- (Präzedenz PROJ-Y-148c/D-Y148c.1). Attribute und Rechte werden unten
-- ausdrücklich nachgeprüft, weil `create or replace` sie erben soll.

create or replace function public.tg_work_items_36a_rollup_recompute_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_path ltree;
  v_ancestor record;
  v_min_start date;
  v_max_end date;
  v_sum_hours numeric(10,2);
begin
  v_path := coalesce(NEW.outline_path, OLD.outline_path);
  if v_path is null then return null; end if;

  for v_ancestor in
    select id, outline_path
    from public.work_items
    where outline_path @> v_path
      and outline_path <> v_path
    order by nlevel(outline_path) asc
  loop
    select
      min(coalesce(
        c.planned_start,
        nullif((c.attributes->>'planned_start'), '')::date,
        c.derived_planned_start
      )),
      max(coalesce(
        c.planned_end,
        nullif((c.attributes->>'planned_end'), '')::date,
        c.derived_planned_end
      )),
      sum(coalesce(
        nullif((c.attributes->>'estimate_hours'), '')::numeric, 0
      ) + coalesce(c.derived_estimate_hours, 0))
    into v_min_start, v_max_end, v_sum_hours
    from public.work_items c
    where c.parent_id = v_ancestor.id
      and c.is_deleted = false;

    update public.work_items
    set derived_planned_start = v_min_start,
        derived_planned_end = v_max_end,
        derived_estimate_hours = nullif(v_sum_hours, 0)
    where id = v_ancestor.id;
  end loop;
  return null;
end;
$fn$;

-- Post-Conditions: laut scheitern, statt still das Falsche zu hinterlassen.
do $$
declare
  v_src text;
  v_cfg text[];
  v_secdef boolean;
  v_acl text;
begin
  select p.prosrc, p.proconfig, p.prosecdef,
         coalesce(array_to_string(p.proacl, ' | '), '<default>')
    into v_src, v_cfg, v_secdef, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'tg_work_items_36a_rollup_recompute_fn';

  if v_src is null then
    raise exception 'PROJ-155-α: Rollup-Funktion nach dem Replace nicht gefunden';
  end if;

  -- Der eigentliche Fix: die echte Spalte muss gelesen werden, zweimal.
  if (select count(*) from regexp_matches(v_src, 'c\.planned_start', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'c\.planned_end', 'g')) <> 1 then
    raise exception 'PROJ-155-α: echte Terminspalten nicht genau einmal je Richtung gelesen';
  end if;

  -- Die Altbestands-Quelle darf nicht verloren gehen.
  if v_src not like '%attributes->>''planned_start''%'
     or v_src not like '%attributes->>''planned_end''%' then
    raise exception 'PROJ-155-α: attributes-Quelle verloren — Altbestand wuerde stumm ausfallen';
  end if;

  -- Der Enkel-Rollup (mehrstufige Hierarchie) muss erhalten sein.
  if v_src not like '%c.derived_planned_start%'
     or v_src not like '%c.derived_planned_end%' then
    raise exception 'PROJ-155-α: Enkel-Rollup verloren — mehrstufige Hierarchie bricht';
  end if;

  if not v_secdef or v_cfg is null or not ('search_path=public, pg_temp' = any(v_cfg)) then
    raise exception 'PROJ-155-α: SECURITY DEFINER oder search_path verloren (secdef=%, cfg=%)',
      v_secdef, v_cfg;
  end if;

  -- PROJ-Y-114a-Lehre: der PUBLIC-Eintrag rendert mit leerem Empfaenger,
  -- beginnt also mit '='. anon/authenticated/PUBLIC duerfen kein EXECUTE haben.
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' or v_acl like '=%'
     or v_acl like '%| =%' then
    raise exception 'PROJ-155-α: Rollup-Funktion unerwartet aufrufbar (acl=%)', v_acl;
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'work_items'
      and t.tgname = 'tg_work_items_36a_rollup_recompute'
      and t.tgenabled = 'O'
  ) then
    raise exception 'PROJ-155-α: Rollup-Trigger fehlt oder ist deaktiviert';
  end if;

  raise notice 'PROJ-155-α: Funktion, Attribute, Rechte und Trigger geprueft.';
end $$;

-- Bestands-Heilung: der Trigger feuert nur bei Aenderungen, die 138 Zeilen in
-- Prod haben aber nie eine gesehen, seit die echte Spalte existiert. Bottom-up
-- rechnen (tiefste Ebene zuerst), damit Enkel vor ihren Eltern stehen.
--
-- Geschrieben werden ausschliesslich die `derived_*`-Spalten. Die stehen
-- NICHT in `_tracked_audit_columns('work_items')` (live geprueft) — der
-- Backfill erzeugt daher keine Audit-Zeilen, was richtig ist: das sind
-- Maschinenwerte, und der Trail hat seit PROJ-130-α keinen Loeschpfad.
do $$
declare
  v_parent record;
  v_touched int := 0;
  v_filled_before int;
  v_filled_after int;
begin
  select count(derived_planned_start) into v_filled_before
  from public.work_items where is_deleted = false;

  for v_parent in
    select w.id
    from public.work_items w
    where w.is_deleted = false
      and exists (
        select 1 from public.work_items c
        where c.parent_id = w.id and c.is_deleted = false
      )
    order by nlevel(w.outline_path) desc nulls last
  loop
    update public.work_items p
    set derived_planned_start = s.min_start,
        derived_planned_end = s.max_end,
        derived_estimate_hours = nullif(s.sum_hours, 0)
    from (
      select
        min(coalesce(
          c.planned_start,
          nullif((c.attributes->>'planned_start'), '')::date,
          c.derived_planned_start
        )) as min_start,
        max(coalesce(
          c.planned_end,
          nullif((c.attributes->>'planned_end'), '')::date,
          c.derived_planned_end
        )) as max_end,
        sum(coalesce(
          nullif((c.attributes->>'estimate_hours'), '')::numeric, 0
        ) + coalesce(c.derived_estimate_hours, 0)) as sum_hours
      from public.work_items c
      where c.parent_id = v_parent.id and c.is_deleted = false
    ) s
    where p.id = v_parent.id;
    v_touched := v_touched + 1;
  end loop;

  select count(derived_planned_start) into v_filled_after
  from public.work_items where is_deleted = false;

  raise notice 'PROJ-155-α Backfill: % Sammelvorgaenge gerechnet, derived_planned_start % -> %',
    v_touched, v_filled_before, v_filled_after;
end $$;
