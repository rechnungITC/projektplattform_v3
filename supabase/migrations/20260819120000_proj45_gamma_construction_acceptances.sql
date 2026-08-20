-- =============================================================================
-- PROJ-45-γ — Abnahmen (Bauabnahme mit Protokoll, Vorbehalten, Gewährleistung)
-- =============================================================================
-- WAS
--   construction_acceptances            Abnahme (Termin + Ergebnis + Frist + Beleg)
--   construction_acceptance_events      unveränderlicher Verlauf
--   construction_acceptance_participants Teilnehmer (Stakeholder | Vendor | Freitext)
--   construction_acceptance_reservations Vorbehalt = VERWEIS auf einen β-Mangel
--
-- WARUM eigenes Objekt statt deliverable_approvals (PROJ-105):
--   Die Vorlage arbeitet SEQUENZIELL mit einem Freigeber je Stufe und binärem
--   Ergebnis. Eine Abnahme ist EIN gemeinsamer Termin mit dreiwertigem Ergebnis,
--   das eine Rechtsfrist auslöst. Übernommen wird die unveränderliche
--   Ereignis-Tabelle, das Schreiben ausschliesslich über Funktionen und
--   „höchstens ein offener Vorgang je Bezug" — nicht die Stufen-Maschinerie.
--
-- ABWEICHUNG vom Tech Design (D-γ6, hier begründet):
--   Der Beleg liegt als DREI SPALTEN auf der Abnahme, nicht in einer eigenen
--   Tabelle. AC-45γ.24 verlangt GENAU EINEN Beleg je Abnahme — eine 1:1-Tabelle
--   wäre übernormalisiert, und die Spaltenform bringt drei Dinge geschenkt:
--   der Beleg fällt automatisch in die Feld-Whitelist (eine Änderung NACH der
--   Abnahme ist damit auditiert, und genau das ist der einzige nach dem
--   Einfrieren noch erlaubte Schreibvorgang), der Einfrier-Wächter muss nur
--   Spalten ausnehmen statt eine Tabelle, und es entsteht keine zusätzliche
--   Objektart im Register.
--
-- REGISTER: nur `construction_acceptances` tritt den drei Registern bei.
--   Die Ereignis-Tabelle bleibt aussen — sie IST das Protokoll (β-Präzedenz).
--   Teilnehmer und Vorbehalte ebenfalls: sie frieren mit dem Ergebnis ein und
--   sind aus dem Protokoll reproduzierbar.
--
-- ANKER-DISZIPLIN (α-Lehre): kein Anker prüft auf Text, den diese Migration
--   selbst schreibt. Zählzusicherungen sind DELTAS, nie Absolutwerte
--   (PROJ-130-α: Prod und die Shadow-DB des Drift-Wächters starten verschieden).
-- =============================================================================

-- ── 1. Abnahme ──────────────────────────────────────────────────────────────
create table if not exists public.construction_acceptances (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  -- Fortlaufend je Projekt, damit ein Abnahmeprotokoll eindeutig referenzierbar
  -- ist. Vergabe unter Advisory-Lock in der Anlege-Funktion (β-/spa_issues-Muster).
  acceptance_number   integer not null,
  title               text check (title is null or char_length(btrim(title)) between 1 and 200),
  notes               text check (notes is null or char_length(notes) <= 4000),

  -- HÖCHSTENS EIN Anker (AC-45γ.1, korrigiert durch D-γ1): Gewerk ODER
  -- Abschnitt ODER keins von beiden = Gesamtabnahme des Projekts. Die
  -- ursprüngliche Fassung „genau einer" war nicht baubar — ein Bauprojekt ohne
  -- Abschnittsbaum hat keinen Wurzelknoten.
  -- NO ACTION (keine `on delete`-Klausel): eine Abnahme sperrt das Entfernen
  -- ihres Bezugs, wie der Mangel in β (L16).
  trade_id            uuid references public.project_construction_trades(id),
  section_id          uuid references public.construction_sections(id),

  scheduled_for       date not null,
  -- Tatsächliches Abnahmedatum. Getrennt vom Termin, weil die Abnahme oft an
  -- einem anderen Tag stattfindet (AC-45γ.11).
  accepted_on         date,

  status              text not null default 'angesetzt'
                        check (status in ('angesetzt','abgenommen',
                                          'abgenommen_unter_vorbehalt',
                                          'verweigert','abgesagt')),
  reason              text,

  -- Gewährleistung: Dauer UND Fristende werden beim Protokollieren
  -- FESTGESCHRIEBEN (Q-γ4). Ein später gerechnetes Ende schriebe die Rechtslage
  -- um, sobald jemand die Voreinstellung ändert.
  warranty_months     integer check (warranty_months is null or warranty_months between 1 and 240),
  warranty_end_date   date,

  -- Nachabnahme-Kette (L19): jede Abnahme ist ein eigener Rechtsakt.
  supersedes_acceptance_id uuid references public.construction_acceptances(id) on delete set null,

  -- Beleg — D-γ6. Genau einer, entweder externe Adresse oder Dokumentknoten.
  document_label      text check (document_label is null or char_length(document_label) <= 200),
  document_url        text,
  document_node_id    uuid references public.document_tree_nodes(id) on delete set null,

  created_by          uuid references public.profiles(id) on delete set null,
  recorded_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint construction_acceptances_number_unique unique (project_id, acceptance_number),
  constraint construction_acceptances_number_positive check (acceptance_number > 0),

  -- Höchstens ein Anker.
  constraint construction_acceptances_single_anchor
    check (not (trade_id is not null and section_id is not null)),

  -- Pflichtbegründung bei Verweigerung und Absage (AC-45γ.7 / AC-45γ.5).
  constraint construction_acceptances_reason_required check (
    status not in ('verweigert','abgesagt')
    or (reason is not null and char_length(btrim(reason)) > 0)
  ),

  -- Ein Ergebnis braucht ein Abnahmedatum; ein angesetzter oder abgesagter
  -- Termin hat keins.
  constraint construction_acceptances_accepted_on_shape check (
    (status in ('abgenommen','abgenommen_unter_vorbehalt','verweigert'))
      = (accepted_on is not null)
  ),

  -- Frist: entweder beides oder nichts, und NUR bei tatsächlicher Abnahme.
  -- Eine verweigerte Abnahme setzt keine Frist in Gang (AC-45γ.20).
  constraint construction_acceptances_warranty_pair check (
    (warranty_months is null) = (warranty_end_date is null)
  ),
  constraint construction_acceptances_warranty_only_when_accepted check (
    warranty_months is null
    or status in ('abgenommen','abgenommen_unter_vorbehalt')
  ),

  -- Beleg: höchstens einer der beiden Wege (AC-45γ.24).
  constraint construction_acceptances_single_document
    check (not (document_url is not null and document_node_id is not null)),
  -- Verteidigung in der Tiefe; die vollständige Statik-Prüfung (reservierte
  -- Adressbereiche, keine Zugangsdaten) liegt in der Route und wird aus
  -- PROJ-115 wiederverwendet. Kein serverseitiger Abruf, nirgends.
  constraint construction_acceptances_document_url_shape check (
    document_url is null
    or (document_url like 'https://%' and char_length(document_url) <= 2000)
  ),

  -- Eine Abnahme kann sich nicht selbst ersetzen.
  constraint construction_acceptances_no_self_supersede
    check (supersedes_acceptance_id is null or supersedes_acceptance_id <> id)
);

create index if not exists construction_acceptances_project_idx
  on public.construction_acceptances (project_id, scheduled_for desc);
create index if not exists construction_acceptances_tenant_idx
  on public.construction_acceptances (tenant_id);
create index if not exists construction_acceptances_trade_idx
  on public.construction_acceptances (trade_id) where trade_id is not null;
create index if not exists construction_acceptances_section_idx
  on public.construction_acceptances (section_id) where section_id is not null;
create index if not exists construction_acceptances_supersedes_idx
  on public.construction_acceptances (supersedes_acceptance_id) where supersedes_acceptance_id is not null;

-- „Höchstens EINE angesetzte Abnahme je Bezug" (AC-45γ.4) — drei Absicherungen,
-- weil es drei Bezugsarten gibt. Die dritte (Gesamtabnahme) ist die leicht zu
-- vergessende und steht deshalb ausdrücklich hier.
create unique index if not exists construction_acceptances_one_open_per_trade
  on public.construction_acceptances (trade_id)
  where status = 'angesetzt' and trade_id is not null;
create unique index if not exists construction_acceptances_one_open_per_section
  on public.construction_acceptances (section_id)
  where status = 'angesetzt' and section_id is not null;
create unique index if not exists construction_acceptances_one_open_per_project
  on public.construction_acceptances (project_id)
  where status = 'angesetzt' and trade_id is null and section_id is null;

alter table public.construction_acceptances enable row level security;

-- ── 2. Abnahme-Ereignis (unveränderlich, trägt den Verlauf) ────────────────
create table if not exists public.construction_acceptance_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  acceptance_id uuid not null references public.construction_acceptances(id) on delete cascade,
  event_type    text not null check (event_type in
                  ('angesetzt','verschoben','abgesagt','protokolliert')),
  status_before text check (status_before in ('angesetzt','abgenommen',
                                              'abgenommen_unter_vorbehalt',
                                              'verweigert','abgesagt')),
  status_after  text not null check (status_after in ('angesetzt','abgenommen',
                                                      'abgenommen_unter_vorbehalt',
                                                      'verweigert','abgesagt')),
  reason        text,
  actor_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint construction_acceptance_events_before_shape check (
    (event_type = 'angesetzt') = (status_before is null)
  ),
  constraint construction_acceptance_events_reason_required check (
    event_type <> 'abgesagt'
    or (reason is not null and char_length(btrim(reason)) > 0)
  )
);

create index if not exists construction_acceptance_events_acceptance_idx
  on public.construction_acceptance_events (acceptance_id, created_at);

alter table public.construction_acceptance_events enable row level security;

-- ── 3. Teilnehmer — GENAU EINE Quelle je Zeile (Q-γ3 / D-γ3) ───────────────
-- Das Projektmitglied entfällt als eigene Achse: ein anwesendes Mitglied ist
-- fachlich ein Stakeholder, und der Kontobezug hängt bereits dort
-- (`stakeholders.linked_user_id`). Eine vierte Achse wäre ein zweiter Weg zur
-- selben Person und weichte die Hausregel „Stakeholder ≠ User" auf.
create table if not exists public.construction_acceptance_participants (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  acceptance_id  uuid not null references public.construction_acceptances(id) on delete cascade,
  stakeholder_id uuid references public.stakeholders(id) on delete set null,
  vendor_id      uuid references public.vendors(id) on delete set null,
  -- IMMER gesetzt: der Name, wie er ZUM ZEITPUNKT der Abnahme galt.
  --
  -- Beim Gegenlesen gefundener Fehler der ersten Fassung: dort war der Name nur
  -- der Rückfall für Anwesende ohne Datensatz, und eine Bedingung verlangte
  -- mindestens eine der drei Quellen. Wird ein Stakeholder später im
  -- Stammdatensatz gelöscht, setzt `on delete set null` den Verweis auf leer —
  -- die Zeile hätte dann NULL Quellen, die Bedingung schlüge zu, und das
  -- Löschen des Stakeholders wäre blockiert. Ein Protokoll darf keine
  -- Stammdatenpflege verhindern.
  --
  -- Der Namensschnappschuss löst beides zugleich: das Protokoll bleibt
  -- lesbar, wenn der Stakeholder verschwindet oder umbenannt wird — und für ein
  -- Abnahmeprotokoll ist genau das richtig, denn es hält fest, WER an jenem Tag
  -- anwesend war. Dieselbe Begründung wie beim eigenen Nachunternehmer-Bezug
  -- des Mangels in β.
  display_name   text not null
    check (char_length(btrim(display_name)) between 1 and 160),
  role_in_acceptance text not null default 'sonstige'
    check (role_in_acceptance in ('auftraggeber','auftragnehmer','bauleitung',
                                  'sachverstaendiger','sonstige')),
  attendance     text not null default 'anwesend'
    check (attendance in ('anwesend','abwesend')),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  -- Höchstens ein Verweis; die Quelle ist damit eindeutig, ohne dass das
  -- Löschen von Stammdaten am Protokoll scheitert.
  constraint construction_acceptance_participants_single_link check (
    not (stakeholder_id is not null and vendor_id is not null)
  )
);

create index if not exists construction_acceptance_participants_acceptance_idx
  on public.construction_acceptance_participants (acceptance_id, sort_order);

alter table public.construction_acceptance_participants enable row level security;

-- ── 4. Vorbehalt = VERWEIS auf einen β-Mangel, nie eine Kopie (L20) ────────
create table if not exists public.construction_acceptance_reservations (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  acceptance_id uuid not null references public.construction_acceptances(id) on delete cascade,
  defect_id     uuid not null references public.construction_defects(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (acceptance_id, defect_id)
);

create index if not exists construction_acceptance_reservations_defect_idx
  on public.construction_acceptance_reservations (defect_id);

alter table public.construction_acceptance_reservations enable row level security;

-- ── 5. RLS — ausschliesslich Lese-Regeln (dd_findings-/β-Rezept) ───────────
-- KEINE INSERT/UPDATE/DELETE-Policy: geschrieben wird nur über die
-- SECURITY-DEFINER-Funktionen. Damit ist die verschärfte Rechte-Regel (L22)
-- EINE prüfbare Stelle statt vier Policy-Ausdrücke.
drop policy if exists construction_acceptances_select on public.construction_acceptances;
create policy construction_acceptances_select on public.construction_acceptances
  for select to authenticated using (public.is_project_member(project_id));

drop policy if exists construction_acceptance_events_select on public.construction_acceptance_events;
create policy construction_acceptance_events_select on public.construction_acceptance_events
  for select to authenticated using (exists (
    select 1 from public.construction_acceptances a
     where a.id = acceptance_id and public.is_project_member(a.project_id)
  ));

drop policy if exists construction_acceptance_participants_select on public.construction_acceptance_participants;
create policy construction_acceptance_participants_select on public.construction_acceptance_participants
  for select to authenticated using (exists (
    select 1 from public.construction_acceptances a
     where a.id = acceptance_id and public.is_project_member(a.project_id)
  ));

drop policy if exists construction_acceptance_reservations_select on public.construction_acceptance_reservations;
create policy construction_acceptance_reservations_select on public.construction_acceptance_reservations
  for select to authenticated using (exists (
    select 1 from public.construction_acceptances a
     where a.id = acceptance_id and public.is_project_member(a.project_id)
  ));

-- ── 6. Unveränderlichkeit der Ereignis-Zeilen ──────────────────────────────
-- Append-only im Normalbetrieb: UPDATE und DELETE liefern `42501`.
-- EINE Ausnahme, selbsttragend formuliert wie in β: wird die Zeile von der
-- Kaskade ihrer eigenen Abnahme abgeräumt, darf sie gehen. Die Bedingung prüft
-- die Abwesenheit der Elternzeile und stützt sich NICHT auf den in Prod
-- vorhandenen, aber in keiner Migrationsdatei erzeugten Helfer
-- `_project_teardown_active()` (Prod/Repo-Divergenz, PROJ-Y-45c).
create or replace function public.enforce_construction_acceptance_event_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.construction_acceptances
                      where id = OLD.acceptance_id) then
    return OLD;
  end if;
  raise exception 'construction acceptance events are append-only'
    using errcode = '42501';
end
$fn$;

revoke execute on function public.enforce_construction_acceptance_event_immutability()
  from public, anon, authenticated;

drop trigger if exists construction_acceptance_events_immutable
  on public.construction_acceptance_events;
create trigger construction_acceptance_events_immutable
  before update or delete on public.construction_acceptance_events
  for each row execute function public.enforce_construction_acceptance_event_immutability();

-- ── 7. Wächter: Projekt-Konsistenz + Einfrieren nach dem Ergebnis ──────────
-- Der Fremdschlüssel sichert nur, dass die Zielzeile EXISTIERT — nicht, dass
-- sie zum selben Projekt gehört (PROJ-Y-45a-Befund). Die Funktionen prüfen es
-- ebenfalls; der Trigger ist die Autorität, weil er auch einen Schreibweg an
-- den Funktionen vorbei erfasst.
--
-- Zweite Aufgabe: das EINFRIEREN (AC-45γ.9). Ein protokolliertes oder
-- abgesagtes Ergebnis ist endgültig — AUSGENOMMEN der Beleg (D-γ4/Befund 3):
-- das unterschriebene Protokoll kommt naturgemäss NACH der Abnahme zurück.
-- Ohne diese Ausnahme wäre AC-45γ.24 unerfüllbar.
create or replace function public.construction_acceptance_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_tenant uuid;
  v_ref_project    uuid;
  v_old            jsonb;
  v_new            jsonb;
  v_key            text;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'PROJ-45-g: Projekt % existiert nicht', NEW.project_id
      using errcode = '23503';
  end if;
  if v_project_tenant <> NEW.tenant_id then
    raise exception 'PROJ-45-g: Mandant der Abnahme passt nicht zum Projekt'
      using errcode = '23514';
  end if;

  if NEW.trade_id is not null then
    select project_id into v_ref_project
      from public.project_construction_trades where id = NEW.trade_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-g: Gewerk-Zuordnung % existiert nicht', NEW.trade_id
        using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-g: Gewerk gehoert zu einem anderen Projekt'
        using errcode = '23514';
    end if;
  end if;

  if NEW.section_id is not null then
    select project_id into v_ref_project
      from public.construction_sections where id = NEW.section_id;
    if v_ref_project is null then
      raise exception 'PROJ-45-g: Bauabschnitt % existiert nicht', NEW.section_id
        using errcode = '23503';
    end if;
    if v_ref_project <> NEW.project_id then
      raise exception 'PROJ-45-g: Bauabschnitt gehoert zu einem anderen Projekt'
        using errcode = '23514';
    end if;
  end if;

  if NEW.document_node_id is not null then
    if not exists (select 1 from public.document_tree_nodes
                    where id = NEW.document_node_id and project_id = NEW.project_id) then
      raise exception 'PROJ-45-g: Dokumentknoten gehoert nicht zu diesem Projekt'
        using errcode = '23514';
    end if;
  end if;

  -- Einfrieren.
  if tg_op = 'UPDATE'
     and OLD.status in ('abgenommen','abgenommen_unter_vorbehalt','verweigert','abgesagt') then
    v_old := to_jsonb(OLD) - 'document_label' - 'document_url' - 'document_node_id' - 'updated_at';
    v_new := to_jsonb(NEW) - 'document_label' - 'document_url' - 'document_node_id' - 'updated_at';
    if v_old <> v_new then
      -- Erste abweichende Spalte benennen, damit der Fehler diagnostizierbar ist.
      select key into v_key
        from jsonb_each(v_new)
       where v_old -> key is distinct from v_new -> key
       limit 1;
      raise exception
        'PROJ-45-g: abgeschlossene Abnahme ist unveraenderlich (Feld %); nur der Beleg darf nachgetragen werden',
        coalesce(v_key, '?')
        using errcode = '42501';
    end if;
  end if;

  return NEW;
end
$fn$;

revoke execute on function public.construction_acceptance_guard() from public, anon, authenticated;

drop trigger if exists construction_acceptances_guard on public.construction_acceptances;
create trigger construction_acceptances_guard
  before insert or update on public.construction_acceptances
  for each row execute function public.construction_acceptance_guard();

-- ── 8. moddatetime (schema-qualifiziert — die nackte Form bricht die Shadow-DB)
drop trigger if exists construction_acceptances_moddatetime on public.construction_acceptances;
create trigger construction_acceptances_moddatetime
  before update on public.construction_acceptances
  for each row execute function extensions.moddatetime(updated_at);

-- ── 9. Abnahme ansetzen — L22: NUR Projektleitung/Bauleitung oder Admin ────
-- Bewusste Abweichung von L15 (Mangel: jedes Mitglied), und zwar in die
-- VERSCHÄRFENDE Richtung: der Mangel wird beim Rundgang erfasst, die Abnahme
-- ist eine rechtsverbindliche Erklärung. Dieselbe Regel wie beim Prüfen in β —
-- damit lebt auf der Baufläche EINE verschärfte Rolle, nicht zwei verschiedene.
create or replace function public.schedule_construction_acceptance(
  p_project_id uuid,
  p_scheduled_for date,
  p_trade_id uuid default null,
  p_section_id uuid default null,
  p_title text default null,
  p_notes text default null,
  p_supersedes_acceptance_id uuid default null
)
returns public.construction_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_trade_project uuid;
  v_trade_active boolean;
  v_prev public.construction_acceptances;
  v_num integer;
  v_row public.construction_acceptances;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id into v_tenant
    from public.projects where id = p_project_id and is_deleted = false;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'insufficient role to schedule construction acceptance'
      using errcode = '42501';
  end if;

  if p_scheduled_for is null then
    raise exception 'scheduled date is required' using errcode = '23514';
  end if;
  if p_trade_id is not null and p_section_id is not null then
    raise exception 'an acceptance references a trade OR a section, never both'
      using errcode = '23514';
  end if;

  if p_trade_id is not null then
    select t.project_id, c.is_active into v_trade_project, v_trade_active
      from public.project_construction_trades t
      join public.construction_trades c on c.id = t.trade_id
     where t.id = p_trade_id;
    if not found or v_trade_project <> p_project_id then
      raise exception 'trade does not belong to this project' using errcode = '23514';
    end if;
    -- Spiegel von β: ein nur DEAKTIVIERTES Gewerk behält seinen Bestand,
    -- entfällt aber aus der Neuauswahl.
    if not v_trade_active then
      raise exception 'trade is deactivated' using errcode = '23514';
    end if;
  end if;

  if p_section_id is not null
     and not exists (select 1 from public.construction_sections
                      where id = p_section_id and project_id = p_project_id) then
    raise exception 'section does not belong to this project' using errcode = '23514';
  end if;

  -- Nachabnahme-Kette (L19): nur an eine VERWEIGERTE Abnahme desselben Bezugs.
  if p_supersedes_acceptance_id is not null then
    select * into v_prev from public.construction_acceptances
     where id = p_supersedes_acceptance_id;
    if not found or v_prev.project_id <> p_project_id then
      raise exception 'previous acceptance does not belong to this project'
        using errcode = '23514';
    end if;
    if v_prev.status <> 'verweigert' then
      raise exception 'a follow-up acceptance only follows a refused one'
        using errcode = '23514';
    end if;
    if v_prev.trade_id is distinct from p_trade_id
       or v_prev.section_id is distinct from p_section_id then
      raise exception 'a follow-up acceptance must reference the same subject'
        using errcode = '23514';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('construction_acceptances:' || p_project_id::text, 0));
  select coalesce(max(acceptance_number), 0) + 1 into v_num
    from public.construction_acceptances where project_id = p_project_id;

  begin
    insert into public.construction_acceptances
      (tenant_id, project_id, acceptance_number, title, notes, trade_id, section_id,
       scheduled_for, status, supersedes_acceptance_id, created_by)
    values
      (v_tenant, p_project_id, v_num, nullif(btrim(p_title), ''),
       nullif(btrim(p_notes), ''), p_trade_id, p_section_id,
       p_scheduled_for, 'angesetzt', p_supersedes_acceptance_id, v_caller)
    returning * into v_row;
  exception when unique_violation then
    -- AC-45γ.4 — benennende Absage statt rohem Datenbanktext.
    raise exception 'an acceptance is already scheduled for this subject'
      using errcode = 'P0001';
  end;

  insert into public.construction_acceptance_events
    (tenant_id, acceptance_id, event_type, status_before, status_after, actor_id)
  values (v_tenant, v_row.id, 'angesetzt', null, 'angesetzt', v_caller);

  return v_row;
end;
$fn$;

revoke execute on function public.schedule_construction_acceptance(uuid,date,uuid,uuid,text,text,uuid)
  from public, anon;
grant execute on function public.schedule_construction_acceptance(uuid,date,uuid,uuid,text,text,uuid)
  to authenticated;

-- ── 10. Angesetzte Abnahme ändern — mit AUSDRÜCKLICHEN Leeren-Schaltern ────
-- B-β5 / PROJ-122-Lehre: ein weggelassener Wert darf nicht „leeren" heissen und
-- ein Leerstring nicht „unverändert". Deshalb je optionalem Feld ein Schalter.
create or replace function public.update_construction_acceptance(
  p_acceptance_id uuid,
  p_scheduled_for date default null,
  p_title text default null,
  p_clear_title boolean default false,
  p_notes text default null,
  p_clear_notes boolean default false
)
returns public.construction_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_a public.construction_acceptances;
  v_row public.construction_acceptances;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_a from public.construction_acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'construction acceptance not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_a.tenant_id) or public.is_project_lead(v_a.project_id)) then
    raise exception 'insufficient role to change construction acceptance'
      using errcode = '42501';
  end if;
  if v_a.status <> 'angesetzt' then
    raise exception 'only a scheduled acceptance can be changed' using errcode = 'P0001';
  end if;
  if p_clear_title and p_title is not null then
    raise exception 'title: set or clear, never both' using errcode = '22023';
  end if;
  if p_clear_notes and p_notes is not null then
    raise exception 'notes: set or clear, never both' using errcode = '22023';
  end if;

  update public.construction_acceptances
     set scheduled_for = coalesce(p_scheduled_for, scheduled_for),
         title = case when p_clear_title then null
                      when p_title is not null then nullif(btrim(p_title), '')
                      else title end,
         notes = case when p_clear_notes then null
                      when p_notes is not null then nullif(btrim(p_notes), '')
                      else notes end
   where id = p_acceptance_id
   returning * into v_row;

  -- Nur eine echte Terminverschiebung ist ein Ereignis; Titel- und
  -- Bemerkungsänderungen stehen im Feld-Protokoll.
  if p_scheduled_for is not null and p_scheduled_for <> v_a.scheduled_for then
    insert into public.construction_acceptance_events
      (tenant_id, acceptance_id, event_type, status_before, status_after, reason, actor_id)
    values (v_a.tenant_id, v_a.id, 'verschoben', 'angesetzt', 'angesetzt',
            'Termin ' || v_a.scheduled_for::text || ' -> ' || p_scheduled_for::text, v_caller);
  end if;

  return v_row;
end;
$fn$;

revoke execute on function public.update_construction_acceptance(uuid,date,text,boolean,text,boolean)
  from public, anon;
grant execute on function public.update_construction_acceptance(uuid,date,text,boolean,text,boolean)
  to authenticated;

-- ── 11. Abnahme absagen — Pflichtbegründung (AC-45γ.5) ────────────────────
create or replace function public.cancel_construction_acceptance(
  p_acceptance_id uuid,
  p_reason text
)
returns public.construction_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_a public.construction_acceptances;
  v_row public.construction_acceptances;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_a from public.construction_acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'construction acceptance not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_a.tenant_id) or public.is_project_lead(v_a.project_id)) then
    raise exception 'insufficient role to cancel construction acceptance'
      using errcode = '42501';
  end if;
  if v_a.status <> 'angesetzt' then
    raise exception 'only a scheduled acceptance can be cancelled' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'a reason is required to cancel an acceptance' using errcode = '23514';
  end if;

  update public.construction_acceptances
     set status = 'abgesagt', reason = v_reason
   where id = p_acceptance_id
   returning * into v_row;

  insert into public.construction_acceptance_events
    (tenant_id, acceptance_id, event_type, status_before, status_after, reason, actor_id)
  values (v_a.tenant_id, v_a.id, 'abgesagt', 'angesetzt', 'abgesagt', v_reason, v_caller);

  return v_row;
end;
$fn$;

revoke execute on function public.cancel_construction_acceptance(uuid,text) from public, anon;
grant execute on function public.cancel_construction_acceptance(uuid,text) to authenticated;

-- ── 12. Abnahme protokollieren — das Herzstück (AC-45γ.7/.13/.14/.15/.18) ──
-- Vorbehalte sind VERWEISE auf β-Mängel, nie Kopien (L20). Neue Vorbehalte
-- entstehen über die BESTEHENDE β-Anlegefunktion: sie vergibt die fortlaufende
-- Mangelnummer unter Sperre, prüft Gewerk und Abschnitt gegen das Projekt und
-- schreibt das Anlege-Ereignis. Sie zu umgehen hiesse, drei Regeln zu
-- duplizieren.
--
-- Die Rollenprüfung der β-Funktion ist LOCKERER (jedes Mitglied) als die hier
-- (nur Bauleitung/Administration). Der strengere Aufrufer entscheidet — das ist
-- Absicht und ist im Pentest belegt, nicht angenommen.
create or replace function public.record_construction_acceptance(
  p_acceptance_id uuid,
  p_result text,
  p_accepted_on date default null,
  p_reason text default null,
  p_warranty_months integer default null,
  p_reservation_defect_ids uuid[] default null,
  p_new_reservations jsonb default null,
  p_accept_despite_open_defects boolean default false
)
returns public.construction_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_a public.construction_acceptances;
  v_row public.construction_acceptances;
  v_reason text := nullif(btrim(p_reason), '');
  v_on date := coalesce(p_accepted_on, current_date);
  v_item jsonb;
  v_defect public.construction_defects;
  v_id uuid;
  v_count integer := 0;
  v_open integer := 0;
  v_end date;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_a from public.construction_acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'construction acceptance not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_a.tenant_id) or public.is_project_lead(v_a.project_id)) then
    raise exception 'insufficient role to record construction acceptance'
      using errcode = '42501';
  end if;
  if v_a.status <> 'angesetzt' then
    raise exception 'only a scheduled acceptance can be recorded' using errcode = 'P0001';
  end if;

  if p_result not in ('abgenommen','abgenommen_unter_vorbehalt','verweigert') then
    raise exception 'unknown acceptance result %', p_result using errcode = '22023';
  end if;
  if p_result = 'verweigert' and v_reason is null then
    raise exception 'a reason is required to refuse an acceptance' using errcode = '23514';
  end if;
  -- AC-45γ.20 — eine verweigerte Abnahme setzt KEINE Frist in Gang.
  if p_result = 'verweigert' and p_warranty_months is not null then
    raise exception 'a refused acceptance does not start a warranty period'
      using errcode = '23514';
  end if;

  -- ── Vorbehalte einsammeln ────────────────────────────────────────────────
  -- (a) bestehende Mängel dieses Projekts.
  if p_reservation_defect_ids is not null then
    foreach v_id in array p_reservation_defect_ids loop
      if not exists (select 1 from public.construction_defects
                      where id = v_id and project_id = v_a.project_id) then
        raise exception 'defect % does not belong to this project', v_id
          using errcode = '23514';
      end if;
      insert into public.construction_acceptance_reservations
        (tenant_id, acceptance_id, defect_id)
      values (v_a.tenant_id, v_a.id, v_id)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  -- (b) neue Vorbehalte werden zu echten Mängeln — über die β-Funktion.
  if p_new_reservations is not null then
    if jsonb_typeof(p_new_reservations) <> 'array' then
      raise exception 'new reservations must be an array' using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(p_new_reservations) loop
      v_defect := public.create_construction_defect(
        v_a.project_id,
        v_item ->> 'title',
        nullif(v_item ->> 'trade_id', '')::uuid,
        coalesce(nullif(v_item ->> 'severity', ''), 'gering'),
        nullif(v_item ->> 'section_id', '')::uuid,
        nullif(v_item ->> 'description', ''),
        nullif(v_item ->> 'due_date', '')::date,
        nullif(v_item ->> 'vendor_id', '')::uuid
      );
      insert into public.construction_acceptance_reservations
        (tenant_id, acceptance_id, defect_id)
      values (v_a.tenant_id, v_a.id, v_defect.id)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  -- AC-45γ.15, erste Hälfte: „unter Vorbehalt" ohne Vorbehalt ist sinnlos.
  if p_result = 'abgenommen_unter_vorbehalt' and v_count = 0 then
    raise exception 'an acceptance under reservation needs at least one reservation'
      using errcode = '23514';
  end if;

  -- AC-45γ.15, zweite Hälfte: „abgenommen" bei offenen Mängeln des Bezugs
  -- braucht eine ausdrückliche Bestätigung. Genau hier verfallen Vorbehalte in
  -- der Praxis. `erledigt` zählt als OFFEN: dort ist fertiggemeldet, aber noch
  -- nicht geprüft — für eine Abnahme ist das nicht erledigt.
  if p_result = 'abgenommen' and not coalesce(p_accept_despite_open_defects, false) then
    with recursive subtree as (
      select id from public.construction_sections where id = v_a.section_id
      union all
      select s.id from public.construction_sections s join subtree st on s.parent_id = st.id
    )
    select count(*) into v_open
      from public.construction_defects d
     where d.project_id = v_a.project_id
       and d.status in ('offen','in_bearbeitung','erledigt')
       and (
         (v_a.trade_id is not null and d.trade_id = v_a.trade_id)
         or (v_a.section_id is not null and d.section_id in (select id from subtree))
         or (v_a.trade_id is null and v_a.section_id is null)
       );
    if v_open > 0 then
      raise exception
        'acceptance without reservation while % open defect(s) exist for this subject', v_open
        using errcode = 'P0001';
    end if;
  end if;

  -- ── Gewährleistung festschreiben (Q-γ4) ──────────────────────────────────
  if p_warranty_months is not null then
    v_end := (v_on + make_interval(months => p_warranty_months))::date;
  end if;

  update public.construction_acceptances
     set status = p_result,
         accepted_on = v_on,
         reason = v_reason,
         warranty_months = p_warranty_months,
         warranty_end_date = v_end,
         recorded_by = v_caller
   where id = p_acceptance_id
   returning * into v_row;

  insert into public.construction_acceptance_events
    (tenant_id, acceptance_id, event_type, status_before, status_after, reason, actor_id)
  values (v_a.tenant_id, v_a.id, 'protokolliert', 'angesetzt', p_result, v_reason, v_caller);

  return v_row;
end;
$fn$;

revoke execute on function public.record_construction_acceptance(uuid,text,date,text,integer,uuid[],jsonb,boolean)
  from public, anon;
grant execute on function public.record_construction_acceptance(uuid,text,date,text,integer,uuid[],jsonb,boolean)
  to authenticated;

-- ── 13. Teilnehmer setzen — ersetzt die Liste, nur solange angesetzt ───────
create or replace function public.set_construction_acceptance_participants(
  p_acceptance_id uuid,
  p_participants jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_a public.construction_acceptances;
  v_item jsonb;
  v_stakeholder uuid;
  v_vendor uuid;
  v_name text;
  v_sources integer;
  v_i integer := 0;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_a from public.construction_acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'construction acceptance not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_a.tenant_id) or public.is_project_lead(v_a.project_id)) then
    raise exception 'insufficient role to change acceptance participants'
      using errcode = '42501';
  end if;
  if v_a.status <> 'angesetzt' then
    raise exception 'participants freeze with the result' using errcode = 'P0001';
  end if;
  if p_participants is null or jsonb_typeof(p_participants) <> 'array' then
    raise exception 'participants must be an array' using errcode = '22023';
  end if;

  delete from public.construction_acceptance_participants where acceptance_id = p_acceptance_id;

  for v_item in select * from jsonb_array_elements(p_participants) loop
    v_stakeholder := nullif(v_item ->> 'stakeholder_id', '')::uuid;
    v_vendor      := nullif(v_item ->> 'vendor_id', '')::uuid;
    v_name        := nullif(btrim(coalesce(v_item ->> 'display_name', '')), '');

    v_sources := (case when v_stakeholder is not null then 1 else 0 end)
               + (case when v_vendor is not null then 1 else 0 end)
               + (case when v_name is not null then 1 else 0 end);
    if v_sources <> 1 then
      raise exception 'each participant carries exactly one source (stakeholder, vendor or name)'
        using errcode = '23514';
    end if;

    -- Der Anzeigename wird aus der Quelle AUFGELÖST und mitgeschrieben, damit
    -- das Protokoll den Stand des Abnahmetags behält.
    if v_stakeholder is not null then
      select s.name into v_name from public.stakeholders s
       where s.id = v_stakeholder and s.project_id = v_a.project_id;
      if v_name is null then
        raise exception 'stakeholder does not belong to this project' using errcode = '23514';
      end if;
    end if;
    if v_vendor is not null then
      select v.name into v_name from public.vendors v
       where v.id = v_vendor and v.tenant_id = v_a.tenant_id;
      if v_name is null then
        raise exception 'vendor does not belong to this tenant' using errcode = '23514';
      end if;
    end if;

    insert into public.construction_acceptance_participants
      (tenant_id, acceptance_id, stakeholder_id, vendor_id, display_name,
       role_in_acceptance, attendance, sort_order)
    values
      (v_a.tenant_id, p_acceptance_id, v_stakeholder, v_vendor, v_name,
       coalesce(nullif(v_item ->> 'role_in_acceptance', ''), 'sonstige'),
       coalesce(nullif(v_item ->> 'attendance', ''), 'anwesend'),
       v_i);
    v_i := v_i + 1;
  end loop;

  return v_i;
end;
$fn$;

revoke execute on function public.set_construction_acceptance_participants(uuid,jsonb) from public, anon;
grant execute on function public.set_construction_acceptance_participants(uuid,jsonb) to authenticated;

-- ── 14. Beleg setzen — AUCH NACH dem Ergebnis (D-γ4 / Befund 3) ───────────
-- Der einzige Schreibvorgang, den der Einfrier-Wächter durchlässt: das
-- unterschriebene Protokoll kommt naturgemäss nach der Abnahme zurück.
create or replace function public.set_construction_acceptance_document(
  p_acceptance_id uuid,
  p_label text default null,
  p_url text default null,
  p_document_node_id uuid default null,
  p_clear boolean default false
)
returns public.construction_acceptances
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller uuid := auth.uid();
  v_a public.construction_acceptances;
  v_row public.construction_acceptances;
  v_url text := nullif(btrim(p_url), '');
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_a from public.construction_acceptances where id = p_acceptance_id;
  if not found then
    raise exception 'construction acceptance not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_a.tenant_id) or public.is_project_lead(v_a.project_id)) then
    raise exception 'insufficient role to attach an acceptance document'
      using errcode = '42501';
  end if;

  if coalesce(p_clear, false) then
    update public.construction_acceptances
       set document_label = null, document_url = null, document_node_id = null
     where id = p_acceptance_id
     returning * into v_row;
    return v_row;
  end if;

  if v_url is not null and p_document_node_id is not null then
    raise exception 'an acceptance document is either an address or a node, never both'
      using errcode = '23514';
  end if;
  if v_url is null and p_document_node_id is null then
    raise exception 'nothing to attach' using errcode = '23514';
  end if;
  if v_url is not null and v_url not like 'https://%' then
    raise exception 'only https addresses are accepted' using errcode = '23514';
  end if;

  update public.construction_acceptances
     set document_label = nullif(btrim(p_label), ''),
         document_url = v_url,
         document_node_id = p_document_node_id
   where id = p_acceptance_id
   returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function public.set_construction_acceptance_document(uuid,text,text,uuid,boolean)
  from public, anon;
grant execute on function public.set_construction_acceptance_document(uuid,text,text,uuid,boolean)
  to authenticated;

-- ── 15. Auswertung je Projekt — SECURITY INVOKER (Aggregate lecken) ────────
-- Ein DEFINER-Zähler über gegatete Zeilen ist ein Leck, auch wenn die
-- Zeilenliste korrekt verborgen ist (CLAUDE.md, Need-to-know-Invariante).
create or replace function public.construction_acceptance_summary(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'total', count(*),
    'scheduled', count(*) filter (where status = 'angesetzt'),
    'accepted', count(*) filter (where status = 'abgenommen'),
    'accepted_with_reservation', count(*) filter (where status = 'abgenommen_unter_vorbehalt'),
    'refused', count(*) filter (where status = 'verweigert'),
    'cancelled', count(*) filter (where status = 'abgesagt'),
    'next_scheduled_for', min(scheduled_for) filter (where status = 'angesetzt'),
    'by_trade', coalesce((
      select jsonb_agg(t)
        from (
          select a2.trade_id,
                 count(*) as total,
                 count(*) filter (where a2.status = 'angesetzt') as scheduled,
                 count(*) filter (where a2.status in ('abgenommen','abgenommen_unter_vorbehalt')) as accepted,
                 count(*) filter (where a2.status = 'verweigert') as refused,
                 max(a2.warranty_end_date) as warranty_end_date
            from public.construction_acceptances a2
           where a2.project_id = p_project_id and a2.trade_id is not null
           group by a2.trade_id
        ) t
    ), '[]'::jsonb)
  )
  from public.construction_acceptances a
  where a.project_id = p_project_id
$fn$;

revoke execute on function public.construction_acceptance_summary(uuid) from public, anon;
grant execute on function public.construction_acceptance_summary(uuid) to authenticated;

-- ── 16. Blockierer benennen — Gewerk und Abschnitts-TEILBAUM ──────────────
-- BEFUND (Tech Design, Befund 1): die beiden Entfernen-Pfade aus α behandeln
-- den Fremdschlüssel-Konflikt heute in einem Zweig, der WÖRTLICH von Mängeln
-- spricht (Code `defects_present`, Text „… bestehen noch Mängel"). Hängt eine
-- ABNAHME am Gewerk, blockiert sie genauso — und der Nutzer läse eine Meldung
-- über Mängel, die es nicht gibt. Die Meldung würde also falsch, nicht bloss
-- unvollständig. Deshalb nennen diese beiden Funktionen ART und Bezeichnung.
--
-- Die β-Funktion `construction_section_blocking_defects` bleibt bewusst
-- BESTEHEN: zwischen dem Anwenden dieser Migration und dem Ausliefern des
-- Codes ruft die deployte Route noch sie. Sie zu ändern oder zu ziehen wäre ein
-- Bruch in genau diesem Fenster. Entfernen ist Aufräumarbeit für später.
--
-- SECURITY INVOKER, damit die Projekt-RLS gilt und die Meldung nie fremde
-- Objekte benennt.
create or replace function public.construction_trade_blocking_refs(p_trade_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(x order by x ->> 'kind', (x ->> 'ref_number')::int), '[]'::jsonb)
  from (
    select jsonb_build_object('kind', 'mangel', 'id', d.id,
                              'ref_number', d.defect_number, 'label', d.title) as x
      from public.construction_defects d
     where d.trade_id = p_trade_id
    union all
    select jsonb_build_object('kind', 'abnahme', 'id', a.id,
                              'ref_number', a.acceptance_number,
                              'label', coalesce(a.title, 'Abnahme vom ' || a.scheduled_for::text))
      from public.construction_acceptances a
     where a.trade_id = p_trade_id
  ) s
$fn$;

revoke execute on function public.construction_trade_blocking_refs(uuid) from public, anon;
grant execute on function public.construction_trade_blocking_refs(uuid) to authenticated;

create or replace function public.construction_section_blocking_refs(p_section_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  with recursive subtree as (
    select id from public.construction_sections where id = p_section_id
    union all
    select s.id from public.construction_sections s join subtree st on s.parent_id = st.id
  )
  select coalesce(jsonb_agg(x order by x ->> 'kind', (x ->> 'ref_number')::int), '[]'::jsonb)
  from (
    select jsonb_build_object('kind', 'mangel', 'id', d.id,
                              'ref_number', d.defect_number, 'label', d.title) as x
      from public.construction_defects d
     where d.section_id in (select id from subtree)
    union all
    select jsonb_build_object('kind', 'abnahme', 'id', a.id,
                              'ref_number', a.acceptance_number,
                              'label', coalesce(a.title, 'Abnahme vom ' || a.scheduled_for::text))
      from public.construction_acceptances a
     where a.section_id in (select id from subtree)
  ) s
$fn$;

revoke execute on function public.construction_section_blocking_refs(uuid) from public, anon;
grant execute on function public.construction_section_blocking_refs(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTER-EINGRIFFE — Anker-Ersetzung auf der LIVE-Definition
-- ═══════════════════════════════════════════════════════════════════════════
-- Nur `construction_acceptances` tritt den drei Registern bei. Ereignisse,
-- Teilnehmer und Vorbehalte bleiben aussen: die Ereignis-Tabelle IST das
-- Protokoll, die beiden anderen frieren mit dem Ergebnis ein und sind aus dem
-- Protokoll reproduzierbar (β-Präzedenz für die Ereignis-Tabelle).
--
-- Jeder Block: (a) LIVE-Definition unmittelbar vor dem Schreiben lesen,
-- (b) Treffer-EINDEUTIGKEIT des whitespace-toleranten Ankers prüfen und bei ≠1
-- abbrechen statt zu raten, (c) schreiben, (d) NACHPRÜFEN, (e) Geschwister-
-- Zweige namentlich gegenprüfen, (f) Rechte neu vergeben.

-- ── 17. Objektarten-CHECK ──────────────────────────────────────────────────
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

  if position('''construction_acceptances''' in v_def) = 0 then
    select count(*) into v_hits
      from regexp_matches(v_def, '::text\s*\]\s*\)\s*\)\s*\)\s*$', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-g: entity_type CHECK anchor matched % times — refusing to guess', v_hits;
    end if;

    v_before := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;

    v_new := regexp_replace(v_def, '::text\s*\]\s*\)\s*\)\s*\)\s*$',
                            '::text, ''construction_acceptances''::text])))');

    alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
            || v_new;

    v_def := pg_get_constraintdef(
      (select oid from pg_constraint where conname = 'audit_log_entity_type_check'));
    if position('''construction_acceptances''' in v_def) = 0 then
      raise exception 'PROJ-45-g: entity_type CHECK patch did not apply';
    end if;
    v_after := (length(v_def) - length(replace(v_def, '::text', ''))) / 6;
    if v_after <> v_before + 1 then
      raise exception 'PROJ-45-g: entity_type CHECK delta wrong — expected +1, got %',
        v_after - v_before;
    end if;
  end if;

  foreach v_sib in array array['construction_defects','construction_trades',
                               'project_construction_trades','construction_sections',
                               'spa_issues','ma_valuations','audit_reader_grants']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-g: entity_type CHECK lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- ── 18. Feld-Whitelist (_tracked_audit_columns) ────────────────────────────
-- Getrackt sind die fachlich veränderlichen Felder — einschliesslich der drei
-- BELEG-Spalten (D-γ6): sie sind das Einzige, was nach dem Einfrieren noch
-- geändert werden darf, und genau deshalb muss diese Änderung im zentralen
-- Protokoll stehen.
-- Bewusst NICHT getrackt: `acceptance_number` (unveränderlich) und
-- `recorded_by` — wer protokolliert hat, steht in der Ereignis-Tabelle; hier
-- wäre es eine zweite Aufzeichnung derselben Tatsache.
do $mig$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_sib text;
  v_branch constant text :=
    'when ''construction_acceptances'' then array[''title'',''notes'',''trade_id'','
    || '''section_id'',''scheduled_for'',''accepted_on'',''status'',''reason'','
    || '''warranty_months'',''warranty_end_date'',''document_label'',''document_url'','
    || '''document_node_id''] ';
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

  if position('''construction_acceptances''' in v_def) = 0 then
    select count(*) into v_hits from regexp_matches(v_def, 'else\s+array\[\]::text\[\]', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-g: _tracked_audit_columns else-anchor matched % times', v_hits;
    end if;

    v_new := regexp_replace(v_def, 'else\s+array\[\]::text\[\]',
                            v_branch || 'else array[]::text[]');
    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if position('''construction_acceptances''' in v_def) = 0 then
      raise exception 'PROJ-45-g: _tracked_audit_columns patch did not apply';
    end if;
    -- Verhaltensprobe statt Textprobe: ein Zweig an der falschen Stelle wäre
    -- sonst unbemerkt stumm (der α-Fall).
    if not ('status' = any (public._tracked_audit_columns('construction_acceptances')))
       or not ('document_url' = any (public._tracked_audit_columns('construction_acceptances'))) then
      raise exception 'PROJ-45-g: _tracked_audit_columns branch is mute for construction_acceptances';
    end if;
  end if;

  foreach v_sib in array array['construction_defects','construction_trades',
                               'project_construction_trades','construction_sections',
                               'audit_reader_grants','dependencies']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-g: _tracked_audit_columns lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- ── 19. Lese-Tor (can_read_audit_entry) ────────────────────────────────────
-- Auflösung auf das Projekt; danach greifen die bestehenden Prüfungen der
-- Funktion (`is_project_member` ODER Revisions-Freigabe, dann
-- `_audit_entry_classified_ok`). Letzteres fällt für diese Objektart auf
-- `return true`, weil Abnahmen — wie Mängel — keine Vertraulichkeitsstufe
-- tragen (α-Entscheid: keine Vertraulichkeitsachse in Bauprojekten). Dort ist
-- NICHTS nachzutragen.
do $mig$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_sib text;
  v_branch constant text :=
    'when ''construction_acceptances'' then select project_id into v_project '
    || 'from public.construction_acceptances where id = p_entity_id; ';
begin
  v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);

  if position('''construction_acceptances''' in v_def) = 0 then
    select count(*) into v_hits from regexp_matches(v_def, 'else\s+return\s+false;', 'g');
    if v_hits <> 1 then
      raise exception 'PROJ-45-g: can_read_audit_entry else-anchor matched % times', v_hits;
    end if;

    v_new := regexp_replace(v_def, 'else\s+return\s+false;', v_branch || 'else return false;');
    execute v_new;

    v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
    if position('''construction_acceptances''' in v_def) = 0 then
      raise exception 'PROJ-45-g: can_read_audit_entry patch did not apply';
    end if;
  end if;

  foreach v_sib in array array['construction_defects','construction_trades',
                               'project_construction_trades','construction_sections',
                               'spa_issues','ma_valuations','risk_categories']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-g: can_read_audit_entry lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- Das Neuanlegen entzieht der Funktion das EXECUTE-Recht und bricht damit still
-- den PROJ-10-Verlauf-Reiter. Unbedingt neu vergeben (Lehre 20260625153238).
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- ── 20. Audit-Trigger (Feld-Ebene + Lebenszyklus) ─────────────────────────
drop trigger if exists construction_acceptances_audit on public.construction_acceptances;
create trigger construction_acceptances_audit
  after update on public.construction_acceptances
  for each row execute function public.record_audit_changes();

drop trigger if exists construction_acceptances_lifecycle on public.construction_acceptances;
create trigger construction_acceptances_lifecycle
  after insert or delete on public.construction_acceptances
  for each row execute function public.record_audit_lifecycle();

-- ── 21. Post-Conditions ────────────────────────────────────────────────────
-- Alles hier ist eine EIGENSCHAFT, kein Bestandszahlenvergleich: Prod und die
-- Shadow-DB des Drift-Wächters starten mit verschiedenen Zahlen (PROJ-130-α).
do $post$
declare
  v_tbl text;
  v_n int;
begin
  foreach v_tbl in array array['construction_acceptances','construction_acceptance_events',
                               'construction_acceptance_participants',
                               'construction_acceptance_reservations']
  loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'PROJ-45-g: RLS not enabled on %', v_tbl;
    end if;
    -- Geschrieben wird ausschliesslich über Funktionen: KEINE Schreib-Regel.
    select count(*) into v_n from pg_policies
     where schemaname = 'public' and tablename = v_tbl and cmd <> 'SELECT';
    if v_n <> 0 then
      raise exception 'PROJ-45-g: % carries % write policy/policies — writes go through functions only',
        v_tbl, v_n;
    end if;
  end loop;

  -- anon UND PUBLIC ohne Ausführungsrecht auf jeder neuen Funktion
  -- (PROJ-Y-114a-Lehre: vollständig, nicht stichprobenhaft).
  foreach v_tbl in array array[
      'schedule_construction_acceptance','update_construction_acceptance',
      'cancel_construction_acceptance','record_construction_acceptance',
      'set_construction_acceptance_participants','set_construction_acceptance_document',
      'construction_acceptance_summary','construction_trade_blocking_refs',
      'construction_section_blocking_refs','construction_acceptance_guard',
      'enforce_construction_acceptance_event_immutability']
  loop
    -- PUBLIC rendert in der ACL mit LEEREM Empfänger, also als Eintrag, der mit
    -- `=` BEGINNT (`=X/owner`). Die erste Fassung dieser Prüfung suchte `%=X/%`
    -- irgendwo im zusammengefügten ACL-Text — das trifft auch `postgres=X/postgres`
    -- und `authenticated=X/postgres` und meldete deshalb JEDE korrekt vergebene
    -- Funktion als Verstoss. Der Fehler lag in der Prüfung, nicht in den Rechten;
    -- die Post-Condition hat ihn beim ersten Anwenden selbst zutage gefördert.
    if exists (
      select 1 from pg_proc p
       where p.proname = v_tbl and p.pronamespace = 'public'::regnamespace
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
              or exists (select 1 from unnest(coalesce(p.proacl, '{}'::aclitem[])) a
                          where a::text like '=%'))
    ) then
      raise exception 'PROJ-45-g: % is still executable by anon or PUBLIC', v_tbl;
    end if;
  end loop;

  -- Die beiden Wächter sind auch für `authenticated` gesperrt.
  foreach v_tbl in array array['construction_acceptance_guard',
                               'enforce_construction_acceptance_event_immutability']
  loop
    if exists (select 1 from pg_proc p
                where p.proname = v_tbl and p.pronamespace = 'public'::regnamespace
                  and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
      raise exception 'PROJ-45-g: trigger function % must not be callable by authenticated', v_tbl;
    end if;
  end loop;

  -- Die Auswertungen müssen INVOKER bleiben (Aggregat-Leck).
  foreach v_tbl in array array['construction_acceptance_summary',
                               'construction_trade_blocking_refs',
                               'construction_section_blocking_refs']
  loop
    if (select prosecdef from pg_proc
         where proname = v_tbl and pronamespace = 'public'::regnamespace) then
      raise exception 'PROJ-45-g: % must be SECURITY INVOKER', v_tbl;
    end if;
  end loop;

  -- β bleibt unberührt: seine Auskunftsfunktion existiert weiter, weil die
  -- deployte Route sie im Fenster zwischen Migration und Code-Deploy ruft.
  if not exists (select 1 from pg_proc
                  where proname = 'construction_section_blocking_defects'
                    and pronamespace = 'public'::regnamespace) then
    raise exception 'PROJ-45-g: beta blocking-defects function must survive this migration';
  end if;
end
$post$;
