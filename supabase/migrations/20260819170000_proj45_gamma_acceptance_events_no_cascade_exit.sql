-- =============================================================================
-- PROJ-45-γ — Fix-forward: der Abnahme-Ereignis-Wächter verliert seinen
--             Kaskaden-Ausstieg
-- =============================================================================
-- BEFUND (beim Abgleich der Migrations-Zeitstempel gefunden, nicht vermutet):
--
-- γs Ereignis-Wächter wurde nach dem Vorbild von β gebaut — und β trug einen
-- Ausstieg, der ein `DELETE` durchliess, sobald die Elternzeile fort war. Genau
-- diesen Ausstieg hat eine PARALLELE Session am selben Tag entfernt
-- (`20260819140000_projy148d_defect_events_no_cascade_exit`, live gemessen:
-- `enforce_construction_defect_event_immutability` wirft jetzt bedingungslos).
--
-- Der Grund ist der Kaskadenweg `projects -> construction_* -> *_events`: er
-- braucht keine Lösch-Regel, entfernt die Elternzeile ZUERST — und damit greift
-- ein Ausstieg, der nur auf Elternabwesenheit prüft, bei JEDEM Projekt-Abriss.
-- Die Zusicherung „unveränderlich" hielt also gerade dort nicht, wo sie zählt.
--
-- Ohne diese Migration würde γ dieselbe Lücke EINE TABELLE WEITER neu
-- aufreissen — die Abnahme-Historie wäre beim Projekt-Abriss stillschweigend
-- weg, obwohl sie der rechtlich gewichtigste Teil der ganzen Extension ist
-- (sie belegt Gefahrübergang und Fristbeginn).
--
-- FOLGE für PROJ-Y-148a: `construction_acceptance_events` wird damit die
-- SECHSTE unveränderliche Insel im Kaskaden-Abschluss von `projects` und
-- blockiert das endgültige Löschen. Die Registry in
-- `src/lib/projects/governance-history.ts` bekommt den Eintrag in derselben
-- Slice — sonst liefe die ehrliche Absage aus PROJ-Y-148a an ihr vorbei und der
-- Nutzer bekäme wieder einen rohen 500.
-- =============================================================================

create or replace function public.enforce_construction_acceptance_event_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Bedingungslos. Kein Ausstieg auf Elternabwesenheit — siehe Kopf.
  raise exception 'construction acceptance events are append-only'
    using errcode = '42501';
end
$fn$;

revoke execute on function public.enforce_construction_acceptance_event_immutability()
  from public, anon, authenticated;

-- Post-Conditions: Eigenschaften, keine Bestandszahlen.
do $post$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc
   where proname = 'enforce_construction_acceptance_event_immutability'
     and pronamespace = 'public'::regnamespace;

  if v_src is null then
    raise exception 'PROJ-45-g: acceptance event guard missing';
  end if;
  if position('not exists' in v_src) > 0 then
    raise exception 'PROJ-45-g: acceptance event guard still carries a cascade exit';
  end if;
  if position('append-only' in v_src) = 0 then
    raise exception 'PROJ-45-g: acceptance event guard lost its refusal';
  end if;

  -- Der Trigger muss weiter haengen; ein `create or replace` laesst ihn stehen,
  -- aber geprueft ist besser als angenommen.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'construction_acceptance_events'
       and t.tgname = 'construction_acceptance_events_immutable'
       and not t.tgisinternal
  ) then
    raise exception 'PROJ-45-g: acceptance event immutability trigger is not attached';
  end if;

  -- Und `authenticated` darf den Waechter weiterhin nicht selbst rufen.
  if has_function_privilege('authenticated',
       'public.enforce_construction_acceptance_event_immutability()'::regprocedure, 'EXECUTE') then
    raise exception 'PROJ-45-g: guard must not be callable by authenticated';
  end if;
end
$post$;
