-- =============================================================================
-- PROJ-Y-45a — Projekt-Konsistenz für die additiven Bau-Verweise
-- =============================================================================
-- WHY
-- PROJ-45-α hängt drei nullbare Verweise an den Kern:
--   work_items.trade_id   -> project_construction_trades(id)
--   work_items.section_id -> construction_sections(id)
--   risks.trade_id        -> project_construction_trades(id)
--
-- Der Fremdschlüssel sichert nur, dass die Zielzeile EXISTIERT — nicht, dass
-- sie zum selben Projekt gehört. Die QA vom 2026-08-14 hat das live bestätigt
-- (Vektor R4): ein Editor kann per API einem Arbeitspaket aus Projekt B ein
-- Gewerk aus Projekt A zuweisen.
--
-- Es ist ausdrücklich KEIN Sicherheitsbefund. Vektor R4a zeigt, dass die
-- fremde Zeile für das Mitglied unsichtbar bleibt (die RLS auf
-- project_construction_trades ist projektbezogen) und die Oberfläche eine
-- solche Auswahl gar nicht anbietet — sie listet nur die Gewerke des eigenen
-- Projekts. Die Wirkung ist unsinnige Zuordnung, kein Informationsabfluss.
--
-- Gebaut wird es trotzdem jetzt: β (Mängel) und γ (Abnahmen) hängen weitere
-- Verweise an dieselben Achsen, und jede zusätzliche Referenz macht die
-- Nachrüstung teurer.
--
-- FORM
-- Zwei Funktionen statt einer: `risks` hat keine `section_id`, und ein
-- gemeinsamer Rumpf müsste die Spalte über `to_jsonb(NEW)` erraten. Zwei
-- explizite Wächter sind lesbarer und scheitern früher.
--
-- Die Trigger sind auf `UPDATE OF <spalten>` eingegrenzt, damit gewöhnliche
-- Bearbeitungen an Titel, Status oder Frist sie nicht bezahlen. Beim INSERT
-- greift der frühe Ausstieg, wenn beide Verweise leer sind — der Normalfall
-- für jedes Nicht-Bauprojekt.
--
-- Bauform gespiegelt von `work_items_validate_release` (BEFORE-Validierung
-- einer FK-nahen Konsistenzregel auf derselben Tabelle).
-- =============================================================================

-- ── 1. Wächter für work_items (beide Achsen) ────────────────────────────────
create or replace function public.work_item_construction_reference_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project uuid;
begin
  -- Normalfall: nichts gesetzt -> nichts zu prüfen.
  if NEW.trade_id is null and NEW.section_id is null then
    return NEW;
  end if;

  if NEW.trade_id is not null then
    select project_id into v_project
      from public.project_construction_trades where id = NEW.trade_id;
    if v_project is null then
      raise exception 'PROJ-Y-45a: Gewerk-Zuordnung % existiert nicht', NEW.trade_id
        using errcode = '23503';
    end if;
    if v_project <> NEW.project_id then
      raise exception 'PROJ-Y-45a: Gewerk gehoert zu einem anderen Projekt'
        using errcode = '23514';
    end if;
  end if;

  if NEW.section_id is not null then
    select project_id into v_project
      from public.construction_sections where id = NEW.section_id;
    if v_project is null then
      raise exception 'PROJ-Y-45a: Bauabschnitt % existiert nicht', NEW.section_id
        using errcode = '23503';
    end if;
    if v_project <> NEW.project_id then
      raise exception 'PROJ-Y-45a: Bauabschnitt gehoert zu einem anderen Projekt'
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$fn$;

revoke execute on function public.work_item_construction_reference_guard()
  from public, anon, authenticated;

drop trigger if exists work_items_construction_reference_guard on public.work_items;
create trigger work_items_construction_reference_guard
  before insert or update of trade_id, section_id, project_id
  on public.work_items
  for each row execute function public.work_item_construction_reference_guard();

-- ── 2. Wächter für risks (nur die Gewerk-Achse) ─────────────────────────────
create or replace function public.risk_construction_reference_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project uuid;
begin
  if NEW.trade_id is null then
    return NEW;
  end if;

  select project_id into v_project
    from public.project_construction_trades where id = NEW.trade_id;
  if v_project is null then
    raise exception 'PROJ-Y-45a: Gewerk-Zuordnung % existiert nicht', NEW.trade_id
      using errcode = '23503';
  end if;
  if v_project <> NEW.project_id then
    raise exception 'PROJ-Y-45a: Gewerk gehoert zu einem anderen Projekt'
      using errcode = '23514';
  end if;

  return NEW;
end;
$fn$;

revoke execute on function public.risk_construction_reference_guard()
  from public, anon, authenticated;

drop trigger if exists risks_construction_reference_guard on public.risks;
create trigger risks_construction_reference_guard
  before insert or update of trade_id, project_id
  on public.risks
  for each row execute function public.risk_construction_reference_guard();

-- ── 3. Post-Conditions ──────────────────────────────────────────────────────
do $mig$
declare
  v_bad int;
begin
  -- Bestand: heute 0 Zeilen, aber ein Replay gegen eine gefuellte Datenbank
  -- soll laut scheitern statt eine Inkonsistenz stillschweigend zu behalten.
  select count(*) into v_bad
    from public.work_items w
    left join public.project_construction_trades t on t.id = w.trade_id
    left join public.construction_sections s on s.id = w.section_id
   where (w.trade_id is not null and t.project_id is distinct from w.project_id)
      or (w.section_id is not null and s.project_id is distinct from w.project_id);
  if v_bad > 0 then
    raise exception 'PROJ-Y-45a: % work_items verweisen projektfremd — erst bereinigen', v_bad;
  end if;

  select count(*) into v_bad
    from public.risks r
    left join public.project_construction_trades t on t.id = r.trade_id
   where r.trade_id is not null and t.project_id is distinct from r.project_id;
  if v_bad > 0 then
    raise exception 'PROJ-Y-45a: % risks verweisen projektfremd — erst bereinigen', v_bad;
  end if;

  if not exists (select 1 from pg_trigger
                  where tgname = 'work_items_construction_reference_guard'
                    and tgrelid = 'public.work_items'::regclass) then
    raise exception 'PROJ-Y-45a: work_items-Trigger fehlt';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'risks_construction_reference_guard'
                    and tgrelid = 'public.risks'::regclass) then
    raise exception 'PROJ-Y-45a: risks-Trigger fehlt';
  end if;

  -- Die beiden Waechter duerfen nicht direkt aufrufbar sein (Hausnorm, sonst
  -- meldet der Supabase-Advisor zu Recht 0029).
  if exists (select 1 from information_schema.routine_privileges
              where routine_schema = 'public'
                and routine_name in ('work_item_construction_reference_guard',
                                     'risk_construction_reference_guard')
                and grantee in ('anon','authenticated')) then
    raise exception 'PROJ-Y-45a: Waechter sind noch direkt aufrufbar';
  end if;
end
$mig$;
