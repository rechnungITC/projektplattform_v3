-- PROJ-144 — Sprach-Entwürfe für die Work-Item-Anlage (Assistant Action Pack)
--
-- Tech Design D1: der Entwurf wird gespeichert, das Work-Item entsteht erst
-- nach ausdrücklicher Bestätigung. Diese Tabelle ist die Vorstufe, NICHT das
-- Zielobjekt — sie darf nie als Backlog-Quelle gelesen werden.
--
-- Bewusste Nicht-Entscheidungen (siehe Spec §4/§5):
--   * KEIN Feld-Audit (kein record_audit_changes-Trigger, kein Eintrag im
--     audit_log_entity_type-Register, kein _tracked_audit_columns-Zweig).
--     Entwürfe sind privater, flüchtiger Scratch; die Handlung selbst wird
--     über das bestehende assistant_action_events protokolliert (AC-144.27).
--     Präzedenz: dd_stream_templates / assistant_sessions|turns|action_events.
--     Nebeneffekt: null Kollisionsfläche mit der PROJ-130-Kette, die genau
--     an den Audit-Funktionen arbeitet.
--   * KEIN confidentiality_level. Der Entwurf ist nutzer-privat (strenger als
--     jede Vertraulichkeitsstufe); das entstehende Work-Item erbt sein Gate
--     ohnehin aus PROJ-100a.
--   * KEINE neue Spalte an assistant_turns/-action_events — der Verweis auf den
--     Entwurf reist im vorhandenen tool_calls/executed_tools-Protokoll mit,
--     sonst wird die Tabelle mit jedem künftigen Aktionspaket breiter.

create table if not exists public.assistant_work_item_drafts (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,

  -- Was der Nutzer gesagt hat (z. B. 'story') vs. was daraus nach der
  -- Projektmethode wird (z. B. 'work_package'). Beide werden gehalten, damit
  -- die Oberfläche die Abweichung erklären kann (AC-144.8).
  requested_kind        text,
  target_kind           text not null,

  title                 text not null,
  description           text,

  status                text not null default 'open',
  created_work_item_id  uuid references public.work_items(id) on delete set null,

  -- Rohtranskript NUR wenn die Transkript-Regel des Mandanten es zulässt
  -- (AC-144.26). Bei 'no_persist' bleibt die Spalte leer; bei
  -- 'persist_redacted_transcript' steht hier die bereinigte Fassung.
  source_transcript     text,
  source_modality       text not null default 'voice',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint assistant_work_item_drafts_status_check
    check (status in ('open', 'claiming', 'confirmed', 'discarded')),

  -- Die 7 Work-Item-Arten aus PROJ-9. Absichtlich als CHECK und nicht als
  -- FK auf einen Katalog: WORK_ITEM_KINDS ist eine Code-Konstante.
  constraint assistant_work_item_drafts_target_kind_check
    check (target_kind in ('epic','feature','story','task','subtask','bug','work_package')),
  constraint assistant_work_item_drafts_requested_kind_check
    check (requested_kind is null or requested_kind in
      ('epic','feature','story','task','subtask','bug','work_package')),

  constraint assistant_work_item_drafts_modality_check
    check (source_modality in ('text', 'voice')),

  -- Längen spiegeln workItemCreateSchema (title 1..255, description ..10000),
  -- damit ein Entwurf nicht bestätigbar-aber-unspeicherbar sein kann.
  constraint assistant_work_item_drafts_title_len
    check (char_length(title) between 1 and 255),
  constraint assistant_work_item_drafts_description_len
    check (description is null or char_length(description) <= 10000),
  constraint assistant_work_item_drafts_transcript_len
    check (source_transcript is null or char_length(source_transcript) <= 5000),

  -- Ein Verweis auf ein erzeugtes Work-Item darf nur an einem bestätigten
  -- Entwurf hängen. Umgekehrt NICHT erzwungen: wird das Work-Item später
  -- gelöscht, setzt das FK-ON-DELETE die Spalte auf NULL, der Entwurf bleibt
  -- korrekt 'confirmed'.
  constraint assistant_work_item_drafts_created_ref_check
    check (created_work_item_id is null or status = 'confirmed')
);

comment on table public.assistant_work_item_drafts is
  'PROJ-144: Vorstufe der Work-Item-Anlage aus Spracheingabe. Nutzer-privat. '
  'Wird erst nach ausdrücklicher Bestätigung in ein echtes work_items überführt. '
  'Kein Feld-Audit (Handlungs-Protokoll liegt in assistant_action_events).';

comment on column public.assistant_work_item_drafts.requested_kind is
  'Die vom Nutzer genannte Art — nur zur Erklärung der Methoden-Abbildung (AC-144.8).';
comment on column public.assistant_work_item_drafts.target_kind is
  'Die aus der Projektmethode abgeleitete Art (WORK_ITEM_METHOD_VISIBILITY, D4).';
comment on column public.assistant_work_item_drafts.status is
  'open → claiming → confirmed | discarded. "claiming" ist das Beanspruchen aus D5: '
  'es verhindert, dass ein Doppelklick zwei Work-Items erzeugt (AC-144.19).';
comment on column public.assistant_work_item_drafts.created_work_item_id is
  'Verweis auf das erzeugte Work-Item; zugleich die Verbraucht-Sicherung des Entwurfs.';
comment on column public.assistant_work_item_drafts.source_transcript is
  'Rohtranskript nur im Rahmen der Transkript-Regel des Mandanten (PROJ-40 / AC-144.26).';

-- Listenabfrage der Oberfläche: eigene offene Entwürfe, neueste zuerst.
create index if not exists assistant_work_item_drafts_owner_idx
  on public.assistant_work_item_drafts (tenant_id, user_id, status, created_at desc);

-- Aufräum-Lauf (D9): alles älter als 14 Tage.
create index if not exists assistant_work_item_drafts_updated_idx
  on public.assistant_work_item_drafts (updated_at);

-- FK-Index für die Cascade beim Projekt-Löschen (PROJ-69-Lehre: FKs, die in
-- einem Löschpfad liegen, bekommen einen Index).
create index if not exists assistant_work_item_drafts_project_idx
  on public.assistant_work_item_drafts (project_id);

alter table public.assistant_work_item_drafts enable row level security;

-- Nutzer-privat innerhalb des Mandanten (AC-144.18). Spiegelt bewusst die
-- Sichtbarkeitsregel von assistant_action_events: der Ersteller und sonst
-- niemand — auch kein Tenant-Admin und kein Projektleiter. auth.uid() ist in
-- ein SELECT gewickelt (PROJ-68: einmal pro Abfrage statt einmal pro Zeile).

drop policy if exists assistant_work_item_drafts_select_own on public.assistant_work_item_drafts;
create policy assistant_work_item_drafts_select_own
  on public.assistant_work_item_drafts for select
  using (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );

drop policy if exists assistant_work_item_drafts_insert_own on public.assistant_work_item_drafts;
create policy assistant_work_item_drafts_insert_own
  on public.assistant_work_item_drafts for insert
  with check (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );

drop policy if exists assistant_work_item_drafts_update_own on public.assistant_work_item_drafts;
create policy assistant_work_item_drafts_update_own
  on public.assistant_work_item_drafts for update
  using (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );

drop policy if exists assistant_work_item_drafts_delete_own on public.assistant_work_item_drafts;
create policy assistant_work_item_drafts_delete_own
  on public.assistant_work_item_drafts for delete
  using (
    user_id = (select auth.uid())
    and public.is_tenant_member(tenant_id)
  );

-- updated_at pflegen. Schema-qualifiziert: die bare Form löst in Prod auf,
-- aber nicht in der Schema-Drift-Schatten-DB.
drop trigger if exists assistant_work_item_drafts_set_updated_at
  on public.assistant_work_item_drafts;
create trigger assistant_work_item_drafts_set_updated_at
  before update on public.assistant_work_item_drafts
  for each row
  execute function extensions.moddatetime(updated_at);
