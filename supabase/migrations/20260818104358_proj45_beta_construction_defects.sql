-- =============================================================================
-- PROJ-45-β — Mängelmanagement (Construction Extension, zweiter Sub-Slice)
-- =============================================================================
-- EXTEND auf PROJ-45-α (project_construction_trades, construction_sections),
-- PROJ-15 (vendors), PROJ-10 (Feld-Audit), PROJ-130-β (Lebenszyklus-Audit),
-- PROJ-114 (`dd_findings`-Rezept), PROJ-105 (unveränderliche Ereignis-Tabelle).
--
-- LOCK L9 — eigenes Bau-Objekt, KEIN `work_items` der Art `bug`:
--   Ein Mangel ist keine geplante Arbeit. Im Backlog verfälschte er Velocity,
--   Burndown und die WBS-Rollups — Auswertungen, die genau davon leben, dass
--   dort geplante Arbeit steht. (Die feldbezogene Erstbegründung ist überholt:
--   α hat `trade_id`/`section_id` selbst nachgeliefert; echt übrig blieben der
--   Nachunternehmer-Bezug und die Prüf-Stufe.)
--
-- RECHTE — weichen bewusst in BEIDE Richtungen vom Hausmuster ab (B-β2):
--   * Anlegen      -> JEDES Projektmitglied, auch Betrachter (L15). Mängel
--                     entstehen beim Rundgang, nicht am Schreibtisch.
--   * Ändern /
--     Statuswechsel-> `is_tenant_admin` ODER `is_project_lead`. Das schliesst
--                     den Projekt-`editor` AUS, den das Hausrecht `edit`
--                     einschliesst — gewährleistungsrelevante Fristen liegen
--                     in einer Hand (Nutzer-Entscheid).
--   Beides sind Rollenprüfungen INNERHALB der Funktionen, nicht gelockerte
--   Zugriffsregeln: die Vorlage `dd_findings` trägt live ausschliesslich
--   Lese-Regeln (zwei SELECT-Policies, keine einzige für INSERT/UPDATE/DELETE).
--   Damit endet die Abweichung an dieser einen Tabelle und ein späterer Leser
--   findet die Regel an der Stelle, an der sie gilt. Preis ist Disziplin: es
--   darf KEINE Schreib-Policy entstehen, sonst wandert die Autorität an zwei
--   Orte (vgl. PROJ-Y-107c zur Fehleranfälligkeit von WITH-CHECK-Ausdrücken).
--
-- KEINE Vertraulichkeitsstufe (B-β4). Die Vorlage `dd_findings` trägt
--   `confidentiality_level`; α hat das für dieselbe Fläche schon verworfen und
--   begründet: die Freischaltungs-Oberfläche ist M&A-gegatet, eine Bauleitung,
--   die die Stufe versehentlich anhebt, käme an die eigenen Daten nicht mehr
--   heran. Mandanten- und Projekttrennung tragen die Abgrenzung. Folge:
--   `_audit_entry_classified_ok` fällt für diese Objektart auf `return true`
--   (live geprüft) — dort ist NICHTS nachzutragen.
--
-- L16 — SPERREN statt `SET NULL`, und zwar als `NO ACTION`, nicht `RESTRICT`:
--   Ein Mangel ohne Adressaten ist gewährleistungsrechtlich wertlos, ein
--   Arbeitspaket ohne Gewerk nur unscharf — deshalb bewusst inkonsistent zu
--   den drei additiven α-Verweisen, die `SET NULL` tragen.
--   Die Wahl `NO ACTION` (statt `RESTRICT`) ist gemessen, nicht geraten:
--   `RESTRICT` prüft SOFORT, `NO ACTION` am Ende der Anweisung. Beim Löschen
--   eines ganzen Projekts werden Gewerk-Zuordnung UND Mangel in DERSELBEN
--   Anweisung kaskadiert; unter `RESTRICT` entscheidet dann die Feuerreihenfolge
--   der RI-Trigger über Erfolg oder `23503`. Live in zurückgerollten
--   Transaktionen gegengeprüft: `NO ACTION` ist in beiden
--   Erzeugungsreihenfolgen robust und blockiert das gezielte Entfernen
--   trotzdem mit `23503` — genau die von AC-45β.21 verlangte Wirkung, ohne
--   einen neuen Blocker für den Projekt-Hard-Delete (PROJ-148/PROJ-Y-148a).
--
-- Die geteilten Register (Objektarten-CHECK, Feld-Whitelist, Lese-Tor) werden
--   NUR per Anker-Ersetzung auf ihrer LIVE-Definition erweitert, mit
--   whitespace-toleranten Regexen, Treffer-Eindeutigkeit, Nachprüfung nach
--   jedem `execute`, Geschwister-Wächtern und Rechte-Neuvergabe in derselben
--   Migration (Lehren aus PROJ-Y-115c und PROJ-Y-122a). Jede Zählzusicherung
--   ist ein DELTA, niemals ein Absolutwert (Lehre aus PROJ-130-α: Prod und die
--   Shadow-DB des Schema-Drift-Wächters haben verschiedene Ausgangszahlen).
--   Kein Anker prüft auf Text, den diese Migration selbst schreibt — genau
--   dieser Fehler hat in α die `work_items`-Whitelist still übersprungen.
--
-- Die Ereignis-Tabelle bleibt AUSSERHALB der drei Register: sie IST das
--   Protokoll. Ein zweites Mitschreiben verdoppelte es (PROJ-130-β hat
--   Doppel-Protokollierung genau dafür ausgeschlossen).
-- =============================================================================

-- ── 1. Mangel ───────────────────────────────────────────────────────────────
create table if not exists public.construction_defects (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  -- Fortlaufend je Projekt, damit eine Mängelanzeige eindeutig referenzierbar
  -- ist. Vergabe unter Advisory-Lock in der Anlege-Funktion (spa_issues-Muster).
  defect_number       integer not null,
  title               text not null check (length(btrim(title)) between 1 and 200),
  description         text,
  -- Gewerk ist PFLICHT (L13): es trägt Zuständigkeit und Mängelanzeige.
  -- NO ACTION (kein `on delete`-Klausel) => L16, siehe Kopf.
  trade_id            uuid not null references public.project_construction_trades(id),
  -- Ort ist OPTIONAL (L13): beim Rundgang oft noch unpräzise.
  section_id          uuid references public.construction_sections(id),
  severity            text not null default 'gering'
                        check (severity in ('gering','erheblich','gravierend')),
  status              text not null default 'offen'
                        check (status in ('offen','in_bearbeitung','erledigt','geprueft','verworfen')),
  -- Nachbesserungsfrist. Darf beim Anlegen in der Vergangenheit liegen
  -- (Nacherfassung eines alten Mangels) und gilt dann sofort als überfällig.
  due_date            date,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  -- EIGENER Nachunternehmer-Bezug, nicht der der Projektzuordnung (B-β3):
  -- gewährleistungsrechtlich zählt, wer ZUM ZEITPUNKT DES MANGELS ausgeführt
  -- hat. Ein abgeleiteter Wert würde alte Mängelanzeigen rückwirkend
  -- umschreiben, sobald die Zuordnung am Gewerk wechselt. `set null`, weil ein
  -- gelöschter Lieferant den Mangel bestehen lässt (Edge Case) — anders als
  -- beim Gewerk, das die Zuständigkeit trägt.
  vendor_id           uuid references public.vendors(id) on delete set null,
  -- Träger des Vier-Augen-Tors: wer zuletzt fertiggemeldet hat. Wird bei JEDER
  -- Fertigmeldung neu gesetzt, damit die Prüfung auch in Runde n greift.
  reported_done_by    uuid references public.profiles(id) on delete set null,
  reported_done_at    timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint construction_defects_number_unique unique (project_id, defect_number),
  constraint construction_defects_number_positive check (defect_number > 0),
  -- Fertigmeldung ist entweder ganz oder gar nicht gesetzt.
  constraint construction_defects_reported_done_pair check (
    (reported_done_by is null) = (reported_done_at is null)
  )
);

create index if not exists construction_defects_project_idx
  on public.construction_defects (project_id);
create index if not exists construction_defects_tenant_idx
  on public.construction_defects (tenant_id);
create index if not exists construction_defects_trade_idx
  on public.construction_defects (trade_id);
create index if not exists construction_defects_section_idx
  on public.construction_defects (section_id) where section_id is not null;
create index if not exists construction_defects_vendor_idx
  on public.construction_defects (vendor_id) where vendor_id is not null;
-- Überfälligkeit wird über (status, due_date) gelesen; der partielle Index
-- deckt genau die zwei nicht-abschliessenden Zustände (B-β6).
create index if not exists construction_defects_overdue_idx
  on public.construction_defects (project_id, due_date)
  where due_date is not null and status in ('offen','in_bearbeitung');

alter table public.construction_defects enable row level security;

-- ── 2. Mangel-Ereignis (unveränderlich, trägt den mehrrundigen Verlauf) ─────
create table if not exists public.construction_defect_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  defect_id     uuid not null references public.construction_defects(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'angelegt','in_arbeit_genommen','fertiggemeldet',
                  'geprueft','zurueckgewiesen','verworfen','wieder_aufgenommen')),
  status_before text check (status_before in ('offen','in_bearbeitung','erledigt','geprueft','verworfen')),
  status_after  text not null check (status_after in ('offen','in_bearbeitung','erledigt','geprueft','verworfen')),
  reason        text,
  actor_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- 'angelegt' hat keinen Vorzustand, jeder andere Wechsel hat einen.
  constraint construction_defect_events_before_shape check (
    (event_type = 'angelegt') = (status_before is null)
  ),
  -- Pflichtbegründung bei Rückweisung (AC-45β.11) und Verwerfen (AC-45β.8).
  -- Auf DB-Ebene doppelt gesichert, nicht nur in der Funktion.
  constraint construction_defect_events_reason_required check (
    event_type not in ('zurueckgewiesen','verworfen')
    or (reason is not null and length(btrim(reason)) > 0)
  )
);

create index if not exists construction_defect_events_defect_idx
  on public.construction_defect_events (defect_id, created_at);

alter table public.construction_defect_events enable row level security;

-- ── 3. RLS — ausschliesslich Lese-Regeln (dd_findings-Rezept) ───────────────
-- KEINE INSERT/UPDATE/DELETE-Policy: geschrieben wird nur über die
-- SECURITY-DEFINER-Funktionen weiter unten. Damit ist die abweichende
-- Rechte-Regel (B-β2) EINE prüfbare Stelle statt vier Policy-Ausdrücke.
drop policy if exists construction_defects_select on public.construction_defects;
create policy construction_defects_select on public.construction_defects
  for select to authenticated using (public.is_project_member(project_id));

drop policy if exists construction_defect_events_select on public.construction_defect_events;
create policy construction_defect_events_select on public.construction_defect_events
  for select to authenticated using (exists (
    select 1 from public.construction_defects d
     where d.id = defect_id and public.is_project_member(d.project_id)
  ));

-- ── 4. Unveränderlichkeit der Ereignis-Zeilen (AC-45βH-5) ──────────────────
-- Append-only im Normalbetrieb: UPDATE und DELETE liefern `42501`.
--
-- EINE Ausnahme, bewusst und selbsttragend: wird die Zeile von der Kaskade
-- ihres eigenen Mangels abgeräumt, darf sie gehen. Ohne das wäre jeder
-- Projekt-Hard-Delete an einem Bauprojekt mit Mängeln blockiert — genau die
-- Klasse Blocker, die PROJ-148 gerade behoben hat und die für die restlichen
-- append-only-Tabellen als PROJ-Y-148a offen ist. Eine neue Instanz davon
-- anzulegen wäre ein Rückschritt.
--
-- Die Ausnahme ist für Anwendungsnutzer UNERREICHBAR: `construction_defects`
-- hat gar keine DELETE-Policy, ein Mangel ist über die Anwendung also nicht
-- löschbar (verworfen wird er per Status). Erreichbar ist der Zweig nur für
-- Rollen, die RLS ohnehin umgehen (`service_role`/`postgres`).
--
-- Bewusst OHNE den in Prod vorhandenen Helfer `_project_teardown_active()`:
-- den erzeugt KEINE Migrationsdatei (nachgezählt: 0 Treffer in
-- supabase/migrations), er existiert nur in Prod. Ein Aufruf würde die
-- Migration im frisch aus den Dateien gebauten Schema-Drift-Wächter brechen.
create or replace function public.enforce_construction_defect_event_immutability()
returns trigger
language plpgsql
-- SECURITY DEFINER, anders als die PROJ-105-Vorlage: die Ausnahme unten hängt
-- an „der Mangel ist weg". Als INVOKER könnte RLS-Unsichtbarkeit sich als
-- „weg" tarnen. Über die Anwendung ist der Zweig ohnehin unerreichbar (keine
-- DELETE-Policy auf construction_defects), aber die Prüfung soll nicht von
-- der Sichtbarkeit des Aufrufers abhängen.
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.construction_defects d where d.id = OLD.defect_id)
  then
    return OLD;
  end if;

  raise exception 'construction defect events are append-only'
    using errcode = '42501';
end;
$fn$;

revoke execute on function public.enforce_construction_defect_event_immutability()
  from public, anon, authenticated;

drop trigger if exists construction_defect_events_immutable on public.construction_defect_events;
create trigger construction_defect_events_immutable
  before update or delete on public.construction_defect_events
  for each row execute function public.enforce_construction_defect_event_immutability();

-- ── 5. Projekt-Konsistenz der Verweise (AC-45βH-6, PROJ-Y-45a sinngemäss) ──
-- Der Fremdschlüssel sichert nur, dass die Zielzeile EXISTIERT — nicht, dass
-- sie zum selben Projekt gehört. Die Funktionen prüfen das ebenfalls; der
-- Trigger ist die Autorität, weil er auch einen Schreibweg an den Funktionen
-- vorbei erfasst.
create or replace function public.construction_defect_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_tenant uuid;
  v_ref_project    uuid;
  v_vendor_tenant  uuid;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'PROJ-45-b: Projekt % existiert nicht', NEW.project_id
      using errcode = '23503';
  end if;
  if NEW.tenant_id <> v_project_tenant then
    raise exception 'PROJ-45-b: Mandant des Mangels weicht vom Projekt ab'
      using errcode = '23514';
  end if;

  -- Gewerk (Pflicht)
  select project_id into v_ref_project
    from public.project_construction_trades where id = NEW.trade_id;
  if v_ref_project is null then
    raise exception 'PROJ-45-b: Gewerk-Zuordnung % existiert nicht', NEW.trade_id
      using errcode = '23503';
  end if;
  if v_ref_project <> NEW.project_id then
    raise exception 'PROJ-45-b: Gewerk gehoert zu einem anderen Projekt'
      using errcode = '23514';
  end if;

  -- Ort (optional)
  if NEW.section_id is not null then
    select project_id into v_ref_project
      from public.construction_sections where id = NEW.section_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-b: Bauabschnitt % existiert nicht', NEW.section_id
        using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-b: Bauabschnitt gehoert zu einem anderen Projekt'
        using errcode = '23514';
    end if;
  end if;

  -- Nachunternehmer (optional, mandantenweite Stammdaten)
  if NEW.vendor_id is not null then
    select tenant_id into v_vendor_tenant from public.vendors where id = NEW.vendor_id;
    if v_vendor_tenant is null then
      raise exception 'PROJ-45-b: Nachunternehmer % existiert nicht', NEW.vendor_id
        using errcode = '23503';
    end if;
    if v_vendor_tenant <> NEW.tenant_id then
      raise exception 'PROJ-45-b: Nachunternehmer gehoert zu einem anderen Mandanten'
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$fn$;

revoke execute on function public.construction_defect_guard()
  from public, anon, authenticated;

drop trigger if exists construction_defects_guard on public.construction_defects;
create trigger construction_defects_guard
  before insert or update of trade_id, section_id, vendor_id, project_id, tenant_id
  on public.construction_defects
  for each row execute function public.construction_defect_guard();

-- ── 6. moddatetime (schema-qualifiziert — die nackte Form bricht die Shadow-DB)
drop trigger if exists construction_defects_moddatetime on public.construction_defects;
create trigger construction_defects_moddatetime
  before update on public.construction_defects
  for each row execute function extensions.moddatetime(updated_at);

-- ── 7. Überfälligkeit — EINE SQL-Definition (B-β6) ─────────────────────────
-- AC-45β.17 sagt „nicht abschliessender Status" und lässt offen, welche das
-- sind. Präzisiert: überfällig ist ein Mangel mit VERSTRICHENER Frist in
-- `offen` oder `in_bearbeitung`. Ausdrücklich NICHT in `erledigt` — dort hat
-- der Nachunternehmer fertiggemeldet und es wartet die Prüfung; die Verspätung
-- läge bei der Bauleitung und die Liste zeigte den Falschen an. Dafür führt die
-- Liste „wartet auf Prüfung" als eigenes Signal. `geprueft` und `verworfen`
-- sind abschliessend.
-- Frist HEUTE ist nicht überfällig (`<`, nicht `<=`) — verstrichen ist sie erst
-- ab morgen.
create or replace function public._construction_defect_is_overdue(
  p_status text,
  p_due_date date
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select p_due_date is not null
     and p_status in ('offen','in_bearbeitung')
     and p_due_date < current_date
$fn$;

-- Reine Prädikatsfunktion ohne Datenzugriff; die INVOKER-Auswertung unten
-- läuft im Recht des Aufrufers und braucht daher EXECUTE.
revoke execute on function public._construction_defect_is_overdue(text, date) from public, anon;
grant execute on function public._construction_defect_is_overdue(text, date) to authenticated;

-- ── 8. Mangel anlegen — L15: JEDES Projektmitglied, auch Betrachter ─────────
create or replace function public.create_construction_defect(
  p_project_id uuid,
  p_title text,
  p_trade_id uuid,
  p_severity text default 'gering',
  p_section_id uuid default null,
  p_description text default null,
  p_due_date date default null,
  p_vendor_id uuid default null
)
returns public.construction_defects
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_trade_project uuid;
  v_trade_vendor uuid;
  v_trade_active boolean;
  v_vendor uuid;
  v_num integer;
  v_row public.construction_defects;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id into v_tenant
    from public.projects where id = p_project_id and is_deleted = false;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- L15 / AC-45β.1 — die einzige Stelle, an der die Hausnorm aufgeweicht wird,
  -- und sie steht hier, nicht in einer Policy. Betrachter dürfen anlegen.
  if not public.is_project_member(p_project_id) then
    raise exception 'insufficient role to create construction defect'
      using errcode = '42501';
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title is required' using errcode = '23514';
  end if;
  if coalesce(p_severity, 'gering') not in ('gering','erheblich','gravierend') then
    raise exception 'unknown severity %', p_severity using errcode = '22023';
  end if;
  if p_trade_id is null then
    raise exception 'trade is required' using errcode = '23514';
  end if;

  -- AC-45β.3 — nur Gewerke DIESES Projekts. Der Wächter-Trigger prüft dasselbe;
  -- hier steht es zusätzlich, damit die Meldung fachlich statt roh ausfällt.
  select t.project_id, t.vendor_id, c.is_active
    into v_trade_project, v_trade_vendor, v_trade_active
    from public.project_construction_trades t
    join public.construction_trades c on c.id = t.trade_id
   where t.id = p_trade_id;
  if not found or v_trade_project <> p_project_id then
    raise exception 'trade does not belong to this project' using errcode = '23514';
  end if;
  -- Edge Case: ein nur DEAKTIVIERTES Gewerk behält seine Mängel, entfällt aber
  -- aus der Neuauswahl (Spiegel von project_construction_trade_guard).
  if not v_trade_active then
    raise exception 'trade is deactivated' using errcode = '23514';
  end if;

  if p_section_id is not null
     and not exists (select 1 from public.construction_sections
                      where id = p_section_id and project_id = p_project_id) then
    raise exception 'section does not belong to this project' using errcode = '23514';
  end if;

  -- B-β3 — Vorbelegung aus dem Gewerk, danach eigenständig. Wer den Vorschlag
  -- nicht will, entfernt ihn über die Änderungs-Funktion (Leeren-Schalter).
  v_vendor := coalesce(p_vendor_id, v_trade_vendor);

  -- Fortlaufende Nummer je Projekt (spa_issues-Muster).
  perform pg_advisory_xact_lock(hashtextextended('construction_defects:' || p_project_id::text, 0));
  select coalesce(max(defect_number), 0) + 1 into v_num
    from public.construction_defects where project_id = p_project_id;

  insert into public.construction_defects
    (tenant_id, project_id, defect_number, title, description, trade_id, section_id,
     severity, status, due_date, vendor_id, created_by)
  values
    (v_tenant, p_project_id, v_num, btrim(p_title), nullif(btrim(p_description), ''),
     p_trade_id, p_section_id, coalesce(p_severity, 'gering'), 'offen',
     p_due_date, v_vendor, v_caller)
  returning * into v_row;

  insert into public.construction_defect_events
    (tenant_id, defect_id, event_type, status_before, status_after, actor_id)
  values (v_tenant, v_row.id, 'angelegt', null, 'offen', v_caller);

  return v_row;
end;
$fn$;

revoke execute on function public.create_construction_defect(uuid,text,uuid,text,uuid,text,date,uuid)
  from public, anon;
grant execute on function public.create_construction_defect(uuid,text,uuid,text,uuid,text,date,uuid)
  to authenticated;

-- ── 9. Mangel ändern — admin|lead, mit AUSDRÜCKLICHEN Leeren-Schaltern ─────
-- B-β5: PROJ-122 hat live einen Defekt produziert, weil ein weggelassener Wert
-- als „unverändert" gelesen wurde und eine zurückgezogene Position
-- stillschweigend überlebte. Deshalb je optionalem Feld ein eigener Schalter —
-- nicht weglassen-heisst-leeren, nicht Leerstring-heisst-leeren. Muster:
-- `update_dd_finding`, das für `economic_impact_eur` genau so einen trägt.
create or replace function public.update_construction_defect(
  p_defect_id uuid,
  p_title text default null,
  p_description text default null,
  p_clear_description boolean default false,
  p_severity text default null,
  p_trade_id uuid default null,
  p_section_id uuid default null,
  p_clear_section boolean default false,
  p_due_date date default null,
  p_clear_due_date boolean default false,
  p_responsible_user_id uuid default null,
  p_clear_responsible boolean default false,
  p_vendor_id uuid default null,
  p_clear_vendor boolean default false
)
returns public.construction_defects
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_d public.construction_defects;
  v_row public.construction_defects;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_d from public.construction_defects where id = p_defect_id;
  if not found then
    raise exception 'construction defect not found' using errcode = 'P0002';
  end if;

  -- B-β2 / AC-45β.5 — Projektleitung oder Mandanten-Administration. Der
  -- Projekt-`editor` ist AUSGESCHLOSSEN, obwohl das Hausrecht `edit` ihn
  -- einschliesst (Nutzer-Entscheid, strenger als das Hausmuster).
  if not (public.is_tenant_admin(v_d.tenant_id) or public.is_project_lead(v_d.project_id)) then
    raise exception 'insufficient role to update construction defect'
      using errcode = '42501';
  end if;

  if p_severity is not null and p_severity not in ('gering','erheblich','gravierend') then
    raise exception 'unknown severity %', p_severity using errcode = '22023';
  end if;

  -- Gewerk bleibt Pflicht: umhängbar, aber nicht leerbar (kein Leeren-Schalter).
  if p_trade_id is not null then
    if not exists (select 1 from public.project_construction_trades
                    where id = p_trade_id and project_id = v_d.project_id) then
      raise exception 'trade does not belong to this project' using errcode = '23514';
    end if;
  end if;

  if p_section_id is not null and not p_clear_section then
    if not exists (select 1 from public.construction_sections
                    where id = p_section_id and project_id = v_d.project_id) then
      raise exception 'section does not belong to this project' using errcode = '23514';
    end if;
  end if;

  if p_vendor_id is not null and not p_clear_vendor then
    if not exists (select 1 from public.vendors
                    where id = p_vendor_id and tenant_id = v_d.tenant_id) then
      raise exception 'vendor does not belong to this tenant' using errcode = '23514';
    end if;
  end if;

  update public.construction_defects set
    title = coalesce(nullif(btrim(p_title), ''), title),
    description = case when p_clear_description then null
                       else coalesce(nullif(btrim(p_description), ''), description) end,
    severity = coalesce(p_severity, severity),
    trade_id = coalesce(p_trade_id, trade_id),
    section_id = case when p_clear_section then null
                      else coalesce(p_section_id, section_id) end,
    due_date = case when p_clear_due_date then null
                    else coalesce(p_due_date, due_date) end,
    responsible_user_id = case when p_clear_responsible then null
                               else coalesce(p_responsible_user_id, responsible_user_id) end,
    vendor_id = case when p_clear_vendor then null
                     else coalesce(p_vendor_id, vendor_id) end,
    updated_at = now()
  where id = p_defect_id
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function public.update_construction_defect(uuid,text,text,boolean,text,uuid,uuid,boolean,date,boolean,uuid,boolean,uuid,boolean)
  from public, anon;
grant execute on function public.update_construction_defect(uuid,text,text,boolean,text,uuid,uuid,boolean,date,boolean,uuid,boolean,uuid,boolean)
  to authenticated;

-- ── 10. Statuswechsel — Vier-Augen-Tor (Q-β2) ───────────────────────────────
-- Statuswechsel-Funktion PLUS unveränderliche Ereignis-Tabelle, NICHT die
-- mehrstufige Freigabe-Maschinerie aus PROJ-105: deren Tabellen modellieren
-- Freigabeketten mit benannten Freigebern; β hat genau EIN Tor und EINE Rolle.
-- Übernommen ist aus PROJ-105 nur das Tragende — der Verlauf lebt in einer
-- eigenen Ereignis-Tabelle (dortige Auflage H3), damit das geteilte Audit-Trio
-- nicht neu gebaut werden muss.
--
-- Übergänge:
--   in_arbeit        offen                        -> in_bearbeitung
--   fertigmelden     offen | in_bearbeitung       -> erledigt   (setzt reported_done_*)
--   pruefen          erledigt                     -> geprueft   (VIER-AUGEN)
--   zurueckweisen    erledigt                     -> in_bearbeitung  (Begründung Pflicht)
--   verwerfen        offen|in_bearbeitung|erledigt -> verworfen  (Begründung Pflicht)
--   wieder_aufnehmen verworfen                    -> offen
create or replace function public.transition_construction_defect_status(
  p_defect_id uuid,
  p_action text,
  p_reason text default null
)
returns public.construction_defects
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_d public.construction_defects;
  v_row public.construction_defects;
  v_reason text := nullif(btrim(p_reason), '');
  v_next text;
  v_event text;
  v_allowed text[];
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_d from public.construction_defects where id = p_defect_id;
  if not found then
    raise exception 'construction defect not found' using errcode = 'P0002';
  end if;

  -- B-β2 — dieselbe verschärfte Regel wie beim Ändern. Fertigmelden UND Prüfen
  -- liegen beide hier; genau daraus folgt B-β7 (siehe unten).
  if not (public.is_tenant_admin(v_d.tenant_id) or public.is_project_lead(v_d.project_id)) then
    raise exception 'insufficient role to change construction defect status'
      using errcode = '42501';
  end if;

  case p_action
    when 'in_arbeit' then
      v_allowed := array['offen'];       v_next := 'in_bearbeitung'; v_event := 'in_arbeit_genommen';
    when 'fertigmelden' then
      v_allowed := array['offen','in_bearbeitung']; v_next := 'erledigt'; v_event := 'fertiggemeldet';
    when 'pruefen' then
      v_allowed := array['erledigt'];    v_next := 'geprueft';       v_event := 'geprueft';
    when 'zurueckweisen' then
      v_allowed := array['erledigt'];    v_next := 'in_bearbeitung'; v_event := 'zurueckgewiesen';
    when 'verwerfen' then
      v_allowed := array['offen','in_bearbeitung','erledigt']; v_next := 'verworfen'; v_event := 'verworfen';
    when 'wieder_aufnehmen' then
      v_allowed := array['verworfen'];   v_next := 'offen';          v_event := 'wieder_aufgenommen';
    else
      raise exception 'unknown construction defect action %', p_action using errcode = '22023';
  end case;

  if not (v_d.status = any (v_allowed)) then
    raise exception 'action % not allowed from status %', p_action, v_d.status
      using errcode = '23514';
  end if;

  if v_event in ('zurueckgewiesen','verworfen') and v_reason is null then
    raise exception 'a reason is required for %', p_action using errcode = '23514';
  end if;

  -- AC-45β.10 / AC-45βH-3 — VIER-AUGEN. Wer fertiggemeldet hat, prüft nicht
  -- selbst ab. Die Prüfung liest `reported_done_by`, das bei JEDER Fertigmeldung
  -- neu gesetzt wird — deshalb greift sie auch in Runde n nach mehrfacher
  -- Rückweisung. Serverseitig, nicht nur in der Oberfläche ausgeblendet.
  --
  -- B-β7, bewusst OHNE Umgehungspfad: ist die Projektleitung gleichzeitig die
  -- einzige Mandanten-Administration, erreicht ein Mangel `geprueft` nie. Der
  -- legitime Weg ist eine zweite berechtigte Person, nicht ein stiller
  -- Übersteuerungsschalter (PROJ-119-Haltung). `/qa` prüft den Fall ausdrücklich.
  if v_event = 'geprueft' then
    if v_d.reported_done_by is null then
      raise exception 'defect was never reported done' using errcode = '23514';
    end if;
    if v_d.reported_done_by = v_caller then
      raise exception 'four-eyes: the reporter cannot approve their own completion'
        using errcode = '42501';
    end if;
  end if;

  update public.construction_defects set
    status = v_next,
    reported_done_by = case when v_event = 'fertiggemeldet' then v_caller else reported_done_by end,
    reported_done_at = case when v_event = 'fertiggemeldet' then now() else reported_done_at end,
    updated_at = now()
  where id = p_defect_id
  returning * into v_row;

  insert into public.construction_defect_events
    (tenant_id, defect_id, event_type, status_before, status_after, reason, actor_id)
  values (v_d.tenant_id, p_defect_id, v_event, v_d.status, v_next, v_reason, v_caller);

  return v_row;
end;
$fn$;

revoke execute on function public.transition_construction_defect_status(uuid,text,text)
  from public, anon;
grant execute on function public.transition_construction_defect_status(uuid,text,text)
  to authenticated;

-- ── 11. Zähler je Gewerk — SECURITY INVOKER (Aggregate lecken) ─────────────
-- CLAUDE.md: „Any RPC that counts, sums, or produces a pre-read must be
-- SECURITY INVOKER so the caller's RLS applies." Ein DEFINER-Zähler über
-- gegatete Zeilen ist ein Leck, auch wenn die Zeilenliste korrekt verborgen
-- ist. Deshalb INVOKER — fremde Mängel erscheinen in keinem Zähler
-- (AC-45βH-1), und der Pentest enthält eine Aggregat-Leck-Probe.
create or replace function public.construction_defect_summary(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with scoped as (
    select d.*, public._construction_defect_is_overdue(d.status, d.due_date) as is_overdue
      from public.construction_defects d
     where d.project_id = p_project_id
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'totals', jsonb_build_object(
      'total',            (select count(*) from scoped),
      'open',             (select count(*) from scoped where status = 'offen'),
      'in_progress',      (select count(*) from scoped where status = 'in_bearbeitung'),
      'awaiting_review',  (select count(*) from scoped where status = 'erledigt'),
      'reviewed',         (select count(*) from scoped where status = 'geprueft'),
      'dismissed',        (select count(*) from scoped where status = 'verworfen'),
      'overdue',          (select count(*) from scoped where is_overdue)
    ),
    'by_trade', coalesce((
      select jsonb_agg(t order by t->>'trade_label')
        from (
          select jsonb_build_object(
                   'project_trade_id', s.trade_id,
                   'trade_label', max(c.label),
                   'total', count(*),
                   'overdue', count(*) filter (where s.is_overdue),
                   'awaiting_review', count(*) filter (where s.status = 'erledigt')
                 ) as t
            from scoped s
            join public.project_construction_trades pt on pt.id = s.trade_id
            join public.construction_trades c on c.id = pt.trade_id
           group by s.trade_id
        ) g
    ), '[]'::jsonb)
  )
$fn$;

revoke execute on function public.construction_defect_summary(uuid) from public, anon;
grant execute on function public.construction_defect_summary(uuid) to authenticated;

-- ── 12. Blockierende Mängel im Abschnitts-TEILBAUM benennen (AC-45βH-7) ────
-- `construction_sections.parent_id` ist CASCADE: das Löschen eines
-- Oberabschnitts reisst den Teilbaum mit, also kann ein Mangel an einem ENKEL
-- die Löschung der Wurzel blockieren. Die benennende Abfrage muss deshalb den
-- ganzen Teilbaum absuchen, nicht den einen Knoten — der naive Test greift
-- daneben.
--
-- Als eigene Funktion, weil die Route mit dem JS-Client keinen ltree-Operator
-- ausdrücken kann. SECURITY INVOKER, damit die Projekt-RLS gilt und die
-- Meldung nie fremde Mängel benennt.
create or replace function public.construction_section_blocking_defects(p_section_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with recursive subtree as (
    select id from public.construction_sections where id = p_section_id
    union all
    select s.id from public.construction_sections s
      join subtree st on s.parent_id = st.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'defect_number', d.defect_number,
           'title', d.title,
           'section_id', d.section_id
         ) order by d.defect_number), '[]'::jsonb)
    from public.construction_defects d
   where d.section_id in (select id from subtree)
$fn$;

revoke execute on function public.construction_section_blocking_defects(uuid) from public, anon;
grant execute on function public.construction_section_blocking_defects(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTER-EINGRIFFE — Anker-Ersetzung auf der LIVE-Definition
-- ═══════════════════════════════════════════════════════════════════════════
-- Nur die MANGEL-Tabelle tritt den drei Registern bei (Objektarten,
-- Feld-Whitelist, Lese-Tor). Die EREIGNIS-Tabelle bleibt aussen: sie IST das
-- Protokoll, ein zweites Mitschreiben verdoppelte es (PROJ-130-β).
--
-- Jeder Block: (a) LIVE-Definition unmittelbar vor dem Schreiben lesen,
-- (b) Treffer-EINDEUTIGKEIT des whitespace-toleranten Ankers prüfen und bei
-- ≠1 abbrechen statt zu raten, (c) schreiben, (d) NACHPRÜFEN, (e) Geschwister-
-- Zweige der Nachbar-Slices namentlich gegenprüfen, (f) Rechte neu vergeben.
-- Zählzusicherungen sind DELTAS, niemals Absolutwerte.

-- ── 13. Objektarten-CHECK ───────────────────────────────────────────────────
do $mig$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_before int;
  v_after int;
  v_sib text;
begin
  v_def := pg_get_constraintdef(
    (select oid from pg_constraint where conname = 'audit_log_entity_type_check'));

  if position('''construction_defects''' in v_def) = 0 then
    -- Die Constraint rendert als CHECK ((entity_type = ANY (ARRAY['a'::text, …])))
    -- — NICHT in der `]::text[]`-Form der Funktion. Anker auf das schliessende
    -- Klammerpaar am Ende, damit der einzige Treffer eindeutig ist.
    select count(*) into v_hits
      from regexp_matches(v_def, '::text\s*\]\s*\)\s*\)\s*\)\s*$', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-b: entity_type CHECK anchor matched % times — refusing to guess', v_hits;
    end if;

    -- Jedes Listenelement trägt genau einen `::text`-Cast; Casts zählen zählt
    -- Einträge, ohne die Liste zu parsen.
    v_before := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;

    v_new := regexp_replace(v_def, '::text\s*\]\s*\)\s*\)\s*\)\s*$',
                            '::text, ''construction_defects''::text])))');

    alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
            || v_new;

    v_def := pg_get_constraintdef(
      (select oid from pg_constraint where conname = 'audit_log_entity_type_check'));
    if position('''construction_defects''' in v_def) = 0 then
      raise exception 'PROJ-45-b: entity_type CHECK patch did not apply';
    end if;
    v_after := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;
    if v_after <> v_before + 1 then
      raise exception 'PROJ-45-b: entity_type CHECK delta wrong — expected +1, got %',
        v_after - v_before;
    end if;
  end if;

  -- Geschwister der Nachbar-Slices müssen überleben (vier Lanes arbeiten an
  -- denselben Objekten).
  foreach v_sib in array array['construction_trades','project_construction_trades',
                               'construction_sections','spa_issues','ma_valuations',
                               'audit_reader_grants']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-b: entity_type CHECK lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- ── 14. Feld-Whitelist (_tracked_audit_columns) ─────────────────────────────
-- AC-45β.7 verlangt, dass jeder Statuswechsel auditiert ist. Der Verlauf-Reiter
-- liest die Ereignis-Tabelle; der Status kommt ZUSÄTZLICH in die Whitelist,
-- damit der Wechsel auch im zentralen Protokoll steht.
-- Bewusst NICHT getrackt: `defect_number` (unveränderlich) und
-- `reported_done_by`/`reported_done_at` — wer fertiggemeldet hat, steht in der
-- Ereignis-Tabelle; hier wäre es eine zweite Aufzeichnung derselben Tatsache.
do $mig$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_sib text;
  v_branch constant text :=
    'when ''construction_defects'' then array[''title'',''description'',''trade_id'','
    || '''section_id'',''severity'',''status'',''due_date'',''responsible_user_id'','
    || '''vendor_id''] ';
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

  if position('''construction_defects''' in v_def) = 0 then
    select count(*) into v_hits from regexp_matches(v_def, 'else\s+array\[\]::text\[\]', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-b: _tracked_audit_columns else-anchor matched % times', v_hits;
    end if;

    v_new := regexp_replace(v_def, 'else\s+array\[\]::text\[\]',
                            v_branch || 'else array[]::text[]');
    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if position('''construction_defects''' in v_def) = 0 then
      raise exception 'PROJ-45-b: _tracked_audit_columns patch did not apply';
    end if;
    -- Die neue Objektart muss auch WIRKLICH ihre Spalten liefern — ein Zweig,
    -- der an der falschen Stelle landet, wäre sonst unbemerkt stumm (der α-Fall).
    if not ('status' = any (public._tracked_audit_columns('construction_defects'))) then
      raise exception 'PROJ-45-b: _tracked_audit_columns branch is mute for construction_defects';
    end if;
  end if;

  foreach v_sib in array array['construction_trades','project_construction_trades',
                               'construction_sections','audit_reader_grants','dependencies']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-b: _tracked_audit_columns lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- ── 15. Lese-Tor (can_read_audit_entry) ─────────────────────────────────────
-- Auflösung auf das Projekt; danach greifen die bestehenden Prüfungen der
-- Funktion (`is_project_member` ODER Revisions-Freigabe, dann
-- `_audit_entry_classified_ok`). Letzteres fällt für diese Objektart auf
-- `return true` — live geprüft — weil Mängel keine Vertraulichkeitsstufe
-- tragen (B-β4). Dort ist NICHTS nachzutragen.
do $mig$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_sib text;
  v_branch constant text :=
    'when ''construction_defects'' then select project_id into v_project '
    || 'from public.construction_defects where id = p_entity_id; ';
begin
  v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);

  if position('''construction_defects''' in v_def) = 0 then
    select count(*) into v_hits from regexp_matches(v_def, 'else\s+return\s+false;', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-b: can_read_audit_entry else-anchor matched % times', v_hits;
    end if;

    v_new := regexp_replace(v_def, 'else\s+return\s+false;', v_branch || 'else return false;');
    execute v_new;

    v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
    if position('''construction_defects''' in v_def) = 0 then
      raise exception 'PROJ-45-b: can_read_audit_entry patch did not apply';
    end if;
  end if;

  foreach v_sib in array array['construction_trades','project_construction_trades',
                               'construction_sections','spa_issues','ma_valuations',
                               'risk_categories']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-b: can_read_audit_entry lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- Das Neuanlegen der Funktion entzieht ihr das EXECUTE-Recht und bricht damit
-- still den PROJ-10-Verlauf-Reiter. Unbedingt neu vergeben (Lehre 20260625153238).
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- ── 16. Audit-Trigger (Feld-Ebene + Lebenszyklus) ──────────────────────────
drop trigger if exists construction_defects_audit on public.construction_defects;
create trigger construction_defects_audit
  after update on public.construction_defects
  for each row execute function public.record_audit_changes();

drop trigger if exists construction_defects_lifecycle on public.construction_defects;
create trigger construction_defects_lifecycle
  after insert or delete on public.construction_defects
  for each row execute function public.record_audit_lifecycle();

-- ── 17. Post-Conditions ─────────────────────────────────────────────────────
-- Alles hier ist eine EIGENSCHAFT, kein Bestandszahlenvergleich: die Shadow-DB
-- des Schema-Drift-Wächters und Prod haben verschiedene Ausgangszahlen
-- (PROJ-130-α), absolute Schwellen wären in einer der beiden Umgebungen falsch.
do $mig$
declare
  v_n int;
  v_rule "char";
begin
  -- RLS aktiv
  if not (select relrowsecurity from pg_class where oid = 'public.construction_defects'::regclass) then
    raise exception 'PROJ-45-b: RLS auf construction_defects ist aus';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.construction_defect_events'::regclass) then
    raise exception 'PROJ-45-b: RLS auf construction_defect_events ist aus';
  end if;

  -- Die tragende Disziplin-Zusage (Q-β1): NUR Lese-Regeln. Entsteht später eine
  -- Schreib-Policy, wandert die abweichende Rechte-Regel an zwei Orte — dann
  -- soll diese Migration bei einem Replay laut scheitern.
  select count(*) into v_n from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname in ('construction_defects','construction_defect_events')
     and p.polcmd <> 'r';
  if v_n > 0 then
    raise exception 'PROJ-45-b: % Schreib-Policy(s) auf den Mangel-Tabellen — Autorität gehoert in die Funktionen', v_n;
  end if;
  select count(*) into v_n from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname in ('construction_defects','construction_defect_events')
     and p.polcmd = 'r';
  if v_n <> 2 then
    raise exception 'PROJ-45-b: erwartet genau 2 SELECT-Policies, gefunden %', v_n;
  end if;

  -- L16 — die zwei Sperren stehen auf NO ACTION ('a'), NICHT auf RESTRICT ('r').
  select confdeltype into v_rule from pg_constraint
   where conrelid = 'public.construction_defects'::regclass and contype = 'f'
     and conname = 'construction_defects_trade_id_fkey';
  if v_rule <> 'a' then
    raise exception 'PROJ-45-b: trade_id-Sperre ist %, erwartet NO ACTION (a)', v_rule;
  end if;
  select confdeltype into v_rule from pg_constraint
   where conrelid = 'public.construction_defects'::regclass and contype = 'f'
     and conname = 'construction_defects_section_id_fkey';
  if v_rule <> 'a' then
    raise exception 'PROJ-45-b: section_id-Sperre ist %, erwartet NO ACTION (a)', v_rule;
  end if;
  -- Der Nachunternehmer fällt dagegen auf leer (Edge Case), das ist gewollt.
  select confdeltype into v_rule from pg_constraint
   where conrelid = 'public.construction_defects'::regclass and contype = 'f'
     and conname = 'construction_defects_vendor_id_fkey';
  if v_rule <> 'n' then
    raise exception 'PROJ-45-b: vendor_id ist %, erwartet SET NULL (n)', v_rule;
  end if;

  -- Trigger
  if not exists (select 1 from pg_trigger where tgname = 'construction_defects_guard'
                  and tgrelid = 'public.construction_defects'::regclass) then
    raise exception 'PROJ-45-b: Konsistenz-Waechter fehlt';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'construction_defect_events_immutable'
                  and tgrelid = 'public.construction_defect_events'::regclass) then
    raise exception 'PROJ-45-b: Unveraenderlichkeits-Trigger fehlt';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'construction_defects_audit'
                  and tgrelid = 'public.construction_defects'::regclass) then
    raise exception 'PROJ-45-b: Feld-Audit-Trigger fehlt';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'construction_defects_lifecycle'
                  and tgrelid = 'public.construction_defects'::regclass) then
    raise exception 'PROJ-45-b: Lebenszyklus-Trigger fehlt';
  end if;

  -- Die Ereignis-Tabelle darf NICHT in die Register geraten (Doppel-Protokoll).
  if position('''construction_defect_events''' in
      pg_get_constraintdef((select oid from pg_constraint
                             where conname = 'audit_log_entity_type_check'))) > 0 then
    raise exception 'PROJ-45-b: Ereignis-Tabelle ist in den Objektarten gelandet';
  end if;

  -- Auswertungen müssen INVOKER sein, sonst umgehen Zähler die Zeilen-RLS.
  if (select prosecdef from pg_proc where oid = 'public.construction_defect_summary(uuid)'::regprocedure) then
    raise exception 'PROJ-45-b: construction_defect_summary ist DEFINER — Aggregate lecken';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.construction_section_blocking_defects(uuid)'::regprocedure) then
    raise exception 'PROJ-45-b: construction_section_blocking_defects ist DEFINER';
  end if;

  -- AC-45βH-8 — `anon` hat auf keiner neuen Funktion Ausführungsrecht.
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name in ('create_construction_defect','update_construction_defect',
                          'transition_construction_defect_status','construction_defect_summary',
                          'construction_section_blocking_defects',
                          '_construction_defect_is_overdue','construction_defect_guard',
                          'enforce_construction_defect_event_immutability')
     and grantee in ('anon','public');
  if v_n > 0 then
    raise exception 'PROJ-45-b: % anon/public-EXECUTE-Rechte auf neuen Funktionen', v_n;
  end if;

  -- Die zwei internen Wächter dürfen auch von `authenticated` nicht direkt
  -- aufrufbar sein (Hausnorm; sonst meldet der Advisor zu Recht 0029).
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name in ('construction_defect_guard',
                          'enforce_construction_defect_event_immutability')
     and grantee = 'authenticated';
  if v_n > 0 then
    raise exception 'PROJ-45-b: interne Waechter sind direkt aufrufbar';
  end if;

  -- Die drei Register tragen die neue Objektart.
  if position('''construction_defects''' in
      pg_get_constraintdef((select oid from pg_constraint
                             where conname = 'audit_log_entity_type_check'))) = 0 then
    raise exception 'PROJ-45-b: Objektart fehlt im CHECK';
  end if;
  if not ('status' = any (public._tracked_audit_columns('construction_defects'))) then
    raise exception 'PROJ-45-b: Feld-Whitelist liefert keine Spalten';
  end if;
  if position('''construction_defects''' in
      pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'PROJ-45-b: Lese-Tor kennt die Objektart nicht';
  end if;

  raise notice 'PROJ-45-b: alle Post-Conditions erfuellt';
end
$mig$;
