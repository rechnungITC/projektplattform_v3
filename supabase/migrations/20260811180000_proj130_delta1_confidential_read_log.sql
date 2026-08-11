-- PROJ-130-δ1 — Protokoll für Lese-Zugriffe auf vertrauliche Inhalte,
--                erste Stufe: Inhalte, die das System verlassen.
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- Baut auf α/β/γ1/γ2/γ3 und PROJ-Y-130h.
--
-- WAS DIE ERHEBUNG WIDERLEGT HAT
-- Das Tech Design sah eine Positivliste „Detailansichten" und eine Negativliste
-- „Listenansichten" vor. Die Bestandsaufnahme zeigt: es gibt fast KEINE
-- Einzelobjekt-Routen. `dd_findings`, `dd_questions`, `ma_valuations`,
-- `spa_issues` und `deliverable_documents` werden ausschließlich als Listen
-- gelesen; die Anwendung holt Sammlungen und filtert clientseitig. Die geplante
-- Positivliste bezieht sich damit auf Flächen, die nicht existieren — und die
-- Negativliste würde, wörtlich genommen, bedeuten in der App praktisch nichts
-- zu protokollieren.
--
-- DIE GRENZE, DIE STATTDESSEN TRÄGT
-- δ1 protokolliert die Flächen, an denen vertrauliche Inhalte das System
-- VERLASSEN — als Datei oder als Download-Link. Das ist forensisch der Kern
-- („wer hat die Daten herausgetragen"), die Stufe ist dort pro Zeile exakt
-- bekannt, und die Menge ist klein und begründbar.
--
-- δ1 (diese Migration + drei Routen):
--   * DMS-Download           -> Ausgabe eines signierten Links (Stufe am Baumknoten)
--   * DD-Fragen-CSV-Export   -> Stufe pro Zeile im Ergebnis
--   * SPA-Issues-CSV-Export  -> Stufe pro Zeile im Ergebnis
--
-- ABSICHTLICH NOCH NICHT (→ δ2, mit der Mengenentscheidung):
--   * Listen-GETs (die eigentliche In-App-Lesefläche)
--   * die drei Report-RPCs und ihre Exporte. Grund ist nicht Bequemlichkeit,
--     sondern ungleiche Ableitbarkeit: `steering_report` führt die Stufe an 5
--     Stellen und ist exakt auswertbar, `operative_report` lässt den
--     Q&A-Abschnitt ohne Stufe (nur teilweise), und
--     `dd_report_consolidated` führt sie GAR NICHT — dort bräuchte es eine
--     Zweitabfrage. Diese Ungleichheit gehört in eine eigene Slice, nicht in
--     eine Fußnote.
--
-- NIE PROTOKOLLIERT (dauerhafte Negativliste):
--   * alles auf Stufe `standard` — in Nicht-M&A-Mandanten entsteht damit
--     null Zusatzlast
--   * Baum-, Dashboard- und Suchansichten
--   * bei Datei-Downloads der TATSÄCHLICHE Abruf: protokollierbar ist nur die
--     Ausgabe des signierten Links (120 s Gültigkeit), eingelöst wird er
--     außerhalb der Anwendung. Das Protokoll sagt „Zugriff wurde ermöglicht",
--     nicht „Datei wurde geladen". Der Unterschied muss in der Auswertung
--     sichtbar bleiben — daher die Aktion `download_url_issued` und nicht
--     `download`.

-- =====================================================================
-- 1. Die Tabelle
-- =====================================================================
create table if not exists public.confidential_read_log (
  id uuid primary key default gen_random_uuid(),
  -- Bewusst OHNE Fremdschlüssel auf tenants/projects: ein forensisches
  -- Protokoll muss die Löschung seines Gegenstands überleben. Dieselbe
  -- Begründung, mit der PROJ-130-α den Mandanten-FK von `audit_log_entries`
  -- entkoppelt hat. Abweichung von `communication_access_log` (PROJ-119), das
  -- noch einen FK auf `projects` trägt und dessen Protokoll damit bei einer
  -- Projekt-Löschung mitverschwindet — dokumentiert als PROJ-Y-130k.
  tenant_id uuid not null,
  project_id uuid not null,
  entity_type text not null,
  entity_id uuid,
  max_level public.ma_confidentiality_level not null,
  object_count integer not null,
  action text not null,
  outcome text not null,
  actor_user_id uuid not null,
  detail jsonb,
  created_at timestamptz not null default now(),

  constraint confidential_read_log_entity_type_check check (
    entity_type in ('documents', 'dd_questions', 'spa_issues')
  ),
  constraint confidential_read_log_action_check check (
    action in ('download_url_issued', 'export')
  ),
  constraint confidential_read_log_outcome_check check (
    outcome in ('granted', 'denied')
  ),
  -- Nur oberhalb von `standard` wird überhaupt protokolliert; ein Eintrag mit
  -- `standard` wäre ein Fehler im Aufrufer.
  constraint confidential_read_log_level_check check (max_level <> 'standard'),
  constraint confidential_read_log_count_check check (object_count > 0)
);

create index if not exists confidential_read_log_project_idx
  on public.confidential_read_log (project_id, created_at desc);
create index if not exists confidential_read_log_actor_idx
  on public.confidential_read_log (actor_user_id, created_at desc);
create index if not exists confidential_read_log_entity_idx
  on public.confidential_read_log (entity_type, entity_id, created_at desc);

alter table public.confidential_read_log enable row level security;

-- Das Zugriffsprotokoll ist selbst Prüfmaterial: dieselbe Leserschaft wie der
-- Audit-Trail (Mandanten-Admin oder Revisions-Freigabe aus γ2). Keine
-- schreibenden Policies -> Writes ausschließlich über die RPC unten.
drop policy if exists confidential_read_log_select on public.confidential_read_log;
create policy confidential_read_log_select on public.confidential_read_log
  for select using (
    public.is_tenant_admin(tenant_id) or public.has_audit_reader_grant(tenant_id)
  );

comment on table public.confidential_read_log is
  'PROJ-130-δ1: protokolliert Lese-Zugriffe auf Inhalte oberhalb von `standard`, die das System verlassen (signierter Download-Link, CSV-Export). Kein FK auf tenants/projects — ein forensisches Protokoll muss die Löschung seines Gegenstands überleben. `download_url_issued` heißt: Zugriff wurde ermöglicht, nicht Datei wurde geladen.';

comment on column public.confidential_read_log.object_count is
  'Anzahl der Objekte oberhalb von `standard` in diesem Zugriff. Bei einem Download 1, bei einem Export die Zahl der vertraulichen Zeilen.';

-- =====================================================================
-- 2. Der einzige Schreibweg
-- =====================================================================
create or replace function public.log_confidential_read(
  p_project_id uuid,
  p_entity_type text,
  p_max_level public.ma_confidentiality_level,
  p_object_count integer,
  p_action text,
  p_outcome text,
  p_entity_id uuid default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
begin
  if v_actor is null then
    raise exception 'PROJ-130-δ1: kein authentifizierter Aufrufer'
      using errcode = '42501';
  end if;

  -- `standard` wird nicht protokolliert. Kein Fehler, damit die Aufrufer nicht
  -- selbst filtern müssen und ein Nicht-M&A-Mandant keine Zusatzlast trägt.
  if p_max_level = 'standard' then
    return;
  end if;

  select p.tenant_id into v_tenant from public.projects p where p.id = p_project_id;
  if v_tenant is null then
    raise exception 'PROJ-130-δ1: unbekanntes Projekt %', p_project_id
      using errcode = 'P0002';
  end if;

  -- Wer protokolliert, muss auf das Projekt schauen dürfen — entweder als
  -- Mitglied oder über die Revisions-Freigabe aus γ2 (ein externer Prüfer ist
  -- bewusst kein Mitglied). Das verhindert, dass ein Fremder mit geratenen
  -- Projekt-IDs Einträge erzeugt.
  if not (public.is_project_member(p_project_id)
          or public.has_audit_reader_grant(v_tenant)) then
    raise exception 'PROJ-130-δ1: kein Zugriff auf Projekt %', p_project_id
      using errcode = '42501';
  end if;

  insert into public.confidential_read_log (
    tenant_id, project_id, entity_type, entity_id,
    max_level, object_count, action, outcome, actor_user_id, detail
  ) values (
    v_tenant, p_project_id, p_entity_type, p_entity_id,
    p_max_level, greatest(coalesce(p_object_count, 1), 1),
    p_action, p_outcome, v_actor, p_detail
  );
end;
$fn$;

revoke all on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) from public;
revoke all on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) from anon;
grant execute on function public.log_confidential_read(uuid, text, public.ma_confidentiality_level, integer, text, text, uuid, jsonb) to postgres, service_role, authenticated;

comment on function public.log_confidential_read is
  'PROJ-130-δ1: einziger Schreibweg in confidential_read_log. Liest auth.uid() intern (kein Actor-Parameter), verwirft `standard` still, verlangt Projekt-Sichtbarkeit oder eine Revisions-Freigabe.';

-- =====================================================================
-- 3. Post-Conditions
-- =====================================================================
do $$
declare
  v_count int;
begin
  -- Append-only aus Sicht der Anwendung: keine schreibenden Policies
  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'confidential_read_log' and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'PROJ-130-δ1: % schreibende Policy(s) auf confidential_read_log', v_count;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'confidential_read_log' and c.relrowsecurity
  ) then
    raise exception 'PROJ-130-δ1: RLS auf confidential_read_log nicht aktiv';
  end if;

  -- Kein FK, der das Protokoll mit seinem Gegenstand mitlöscht
  select count(*) into v_count from pg_constraint
   where conrelid = 'public.confidential_read_log'::regclass and contype = 'f';
  if v_count <> 0 then
    raise exception 'PROJ-130-δ1: % Fremdschlüssel auf confidential_read_log — das Protokoll würde mitgelöscht', v_count;
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'log_confidential_read' and grantee = 'anon'
  ) then
    raise exception 'PROJ-130-δ1: anon hat EXECUTE auf log_confidential_read';
  end if;

  -- α/γ-Zusagen halten
  select count(*) into v_count from pg_trigger
   where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-δ1: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace
      and position('_audit_entry_classified_ok' in pg_get_functiondef(oid)) > 0
      and position('has_audit_reader_grant' in pg_get_functiondef(oid)) > 0
  ) then
    raise exception 'PROJ-130-δ1: γ1/γ2 aus dem Lesetor verschwunden';
  end if;

  raise notice 'PROJ-130-δ1: Post-Conditions erfüllt';
end $$;
