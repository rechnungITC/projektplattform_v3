-- PROJ-130-α — Lückenloser Audit-Trail, Teil 1: "Nichts geht mehr verloren"
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- CIA-Auflagen 1, 3, 4, 8, 10.
--
-- Diese Migration macht KEINE neue Fachlichkeit auf. Sie schließt die Löschpfade
-- des bestehenden PROJ-10-Audit-Trails, macht seine Einträge auf DB-Ebene
-- unveränderbar und bringt die vier auseinandergedrifteten Register in Einklang.
--
-- Bewusst NICHT Teil dieser Migration (→ PROJ-130-β):
--   * INSERT/DELETE-Protokollierung (additive zweite Trigger-Funktion)
--   * `is_deleted` der vier Kernobjekte in die Whitelist aufnehmen
--   * Abdeckung der übrigen unabgedeckten Tabellen (→ PROJ-Y-130d)
--
-- `record_audit_changes()` und ihre bestehenden Trigger werden NICHT angefasst
-- (CIA-Auflage 3): 43 Migrationen Historie, zwei dokumentierte Clobber-Vorfälle.
-- Alle Änderungen an `_tracked_audit_columns` und am entity_type-CHECK laufen als
-- Anker-Ersetzung aus der LIVE-Definition mit Fail-Loud-Guard, nie als Abtippen
-- (CIA-Auflage 8).

-- =====================================================================
-- 1. Register-Reconcile — die vier Register in Einklang bringen
-- =====================================================================

-- 1a. entity_type-CHECK: 'ma_project_profiles' fehlt, obwohl die Tabelle einen
--     Audit-Trigger UND einen Read-Gate-Zweig hat. Sobald ihr Whitelist-Zweig
--     befüllt wird (1b), würde jeder Mandatswechsel mit 23514 abbrechen.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conname = 'audit_log_entity_type_check'
    and conrelid = 'public.audit_log_entries'::regclass;

  if v_def is null then
    raise exception 'PROJ-130-α: audit_log_entity_type_check nicht gefunden — Abbruch statt Raten';
  end if;

  if position('''ma_project_profiles''' in v_def) > 0 then
    raise notice 'PROJ-130-α: entity_type-CHECK enthält ma_project_profiles bereits — übersprungen';
  else
    v_def := regexp_replace(
      v_def,
      '\]\s*\)\s*\)\s*\)\s*$',
      ', ''ma_project_profiles''::text])))'
    );

    if position('''ma_project_profiles''' in v_def) = 0 then
      raise exception 'PROJ-130-α: Anker-Ersetzung am entity_type-CHECK fehlgeschlagen — Definition unerwartet geformt';
    end if;

    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_def;
  end if;
end $$;

-- 1b. `_tracked_audit_columns`: 6 Tabellen tragen einen Audit-Trigger, liefern
--     aber keine Spalten — der Trigger feuert ins Leere. Zwei davon sind echte
--     Fachlücken: `ma_project_profiles.mandate_status` (transition_mandate_status)
--     und `sprints.state` (set_sprint_state) waren dadurch unprotokolliert.
--
--     Anker: das abschließende `else array[]::text[]` der case-Kette. Der Regex
--     ist whitespace-tolerant, weil die Shadow-DB des Schema-Drift-Guards die
--     Funktion aus den Migrationsdateien neu aufbaut und deren Formatierung von
--     der Prod-Normalisierung abweichen kann. `when 'report_snapshots' then
--     array[]::text[]` wird durch das vorangestellte `else` NICHT getroffen.
do $$
declare
  v_def text;
  v_new text;
  v_add text;
  v_before int;
  v_after int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = '_tracked_audit_columns'
    and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-α: _tracked_audit_columns nicht gefunden — Abbruch statt Raten';
  end if;

  if position('when ''ma_project_profiles'' then' in v_def) > 0 then
    raise notice 'PROJ-130-α: _tracked_audit_columns bereits abgeglichen — übersprungen';
    return;
  end if;

  v_before := (length(v_def) - length(replace(v_def, 'when ''', ''))) / length('when ''');

  -- `stakeholder_coaching_recommendations` bewusst schmal: der Empfehlungstext
  -- ist KI-Ausgabe über eine natürliche Person. Er würde als Klartext in
  -- old_value/new_value landen, und die Export-Redaktion deckt heute nur
  -- `stakeholders` ab. Protokolliert wird deshalb nur der Governance-Zustand,
  -- nicht der Inhalt. Entscheidung über den Inhalt: PROJ-130-γ (Wertmaskierung).
  v_add :=
    'when ''ma_project_profiles'' then array[''deal_side'',''sponsor_user_id'',''mandate_status'',''deal_rationale'',''search_profile'',''exclusion_criteria'',''investment_frame_amount'',''investment_frame_currency'',''investment_frame_note'',''strategic_document_link'',''confidentiality_level''] '
    || 'when ''project_goals'' then array[''title'',''description'',''success_criteria'',''target_date'',''status'',''parent_goal_id'',''sort_order'',''deleted_at''] '
    || 'when ''releases'' then array[''name'',''description'',''start_date'',''end_date'',''status'',''target_milestone_id''] '
    || 'when ''sprints'' then array[''name'',''goal'',''start_date'',''end_date'',''state'',''is_critical''] '
    || 'when ''stakeholder_coaching_recommendations'' then array[''review_state'',''deleted_at''] '
    || 'when ''dependencies'' then array[''constraint_type'',''lag_days''] ';

  v_new := regexp_replace(
    v_def,
    'else\s+array\[\]\s*::\s*text\s*\[\]',
    v_add || 'else array[]::text[]'
  );

  if position('when ''ma_project_profiles'' then' in v_new) = 0 then
    raise exception 'PROJ-130-α: Anker-Ersetzung an _tracked_audit_columns fehlgeschlagen — `else array[]::text[]` nicht gefunden';
  end if;

  v_after := (length(v_new) - length(replace(v_new, 'when ''', ''))) / length('when ''');
  if v_after <> v_before + 6 then
    raise exception 'PROJ-130-α: Zweig-Zählung unerwartet (vorher %, nachher %, erwartet %)', v_before, v_after, v_before + 6;
  end if;

  execute v_new;
end $$;

-- CREATE OR REPLACE erhält die ACL, aber die Projektkonvention verlangt das
-- explizite Re-Grant in derselben Migration.
grant execute on function public._tracked_audit_columns(text) to postgres, service_role, authenticated;

-- 1c. 8 Whitelist-Zweige hatten keinen Trigger — die Spalten waren definiert,
--     aber es wurde nie etwas geschrieben. `tenant_memberships` ist der
--     wichtigste Fall: Rollenwechsel im Mandanten waren unprotokolliert.
--
--     `budget_postings` bleibt bewusst ohne Trigger: die Buchungs-Routen
--     schreiben ihre Audit-Zeilen selbst über den Admin-Client (Anlage und
--     Storno). Ein zusätzlicher UPDATE-Trigger wäre ein zweiter Schreibpfad
--     auf denselben Sachverhalt. Dokumentierte Ausnahme, siehe Drift-Guard.
do $$
declare
  v_tbl text;
  v_trg text;
begin
  foreach v_tbl in array array[
    'tenant_memberships',
    'role_rates',
    'vendor_documents',
    'ma_nda_assignments',
    'committee_templates',
    'communication_templates',
    'committee_meeting_attendees',
    'committee_meeting_documents'
  ]
  loop
    if coalesce(array_length(public._tracked_audit_columns(v_tbl), 1), 0) = 0 then
      raise exception 'PROJ-130-α: % hat keine getrackten Spalten — Trigger wäre stumm', v_tbl;
    end if;

    v_trg := 'audit_changes_' || v_tbl;
    execute format('drop trigger if exists %I on public.%I', v_trg, v_tbl);
    execute format(
      'create trigger %I after update on public.%I for each row execute function public.record_audit_changes()',
      v_trg, v_tbl
    );
  end loop;
end $$;

-- =====================================================================
-- 2. Löschstopp + Schreibschutz auf DB-Ebene
-- =====================================================================

-- 2a. Mandanten-FK entkoppeln. Bisher entfernte das Offboarding eines Mandanten
--     (PROJ-17) über ON DELETE CASCADE dessen kompletten Audit-Trail. Ein
--     forensisches Protokoll muss die Löschung seines Bezugsobjekts überleben —
--     dieselbe Begründung, die `communication_access_log` (PROJ-119) schon trägt.
--     `tenant_id` bleibt als Skalar erhalten und weiterhin NOT NULL.
alter table public.audit_log_entries
  drop constraint if exists audit_log_tenant_fkey;

-- 2b. Guard-Trigger. Bewusst KEIN pauschaler Rechteentzug (CIA-Auflage 4): vier
--     produktive Pfade schreiben Audit-Zeilen legitim über den Admin-Client
--     (Budget-Buchungen, Buchungs-Storno, Kostenprotokoll, Tagessätze), und
--     `service_role` umgeht RLS ohnehin. Der Wächter unterscheidet deshalb
--     zwischen erlaubtem Hinzufügen und verbotenem Verändern/Löschen — und
--     greift auch für `service_role` und `postgres`.
--
--     Verifiziert vor dem Bau: `audit_undo_field` und `audit_restore_entity`
--     LESEN den Trail nur und schreiben neue Zeilen; sie werden nicht gebrochen.
create or replace function public._guard_audit_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'audit_log_entries ist append-only: % ist nicht erlaubt (PROJ-130-α). Audit-Einträge sind nicht änderbar und nicht löschbar.',
    tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public._guard_audit_log_immutable() from public;
revoke all on function public._guard_audit_log_immutable() from anon, authenticated;

drop trigger if exists audit_log_no_update on public.audit_log_entries;
create trigger audit_log_no_update
  before update on public.audit_log_entries
  for each row execute function public._guard_audit_log_immutable();

drop trigger if exists audit_log_no_delete on public.audit_log_entries;
create trigger audit_log_no_delete
  before delete on public.audit_log_entries
  for each row execute function public._guard_audit_log_immutable();

drop trigger if exists audit_log_no_truncate on public.audit_log_entries;
create trigger audit_log_no_truncate
  before truncate on public.audit_log_entries
  for each statement execute function public._guard_audit_log_immutable();

-- 2c. Defense-in-depth: die DML-Rechte von anon/authenticated waren offen
--     (INSERT/UPDATE/DELETE/TRUNCATE), auch wenn RLS-default-deny sie faktisch
--     blockiert hat. SELECT bleibt — der Trail wird über die RLS-Policy
--     `audit_log_select_member_or_admin` gelesen.
--     `record_audit_changes` ist SECURITY DEFINER und läuft als Eigentümer,
--     ist von diesem Entzug also nicht betroffen.
revoke insert, update, delete, truncate on public.audit_log_entries from anon;
revoke insert, update, delete, truncate on public.audit_log_entries from authenticated;

-- =====================================================================
-- 3. Post-Conditions — die Migration prüft ihr eigenes Ergebnis
-- =====================================================================
do $$
declare
  v_count int;
  v_missing text;
begin
  -- Löschpfad 1: FK entkoppelt
  select count(*) into v_count
  from pg_constraint
  where conname = 'audit_log_tenant_fkey'
    and conrelid = 'public.audit_log_entries'::regclass;
  if v_count <> 0 then
    raise exception 'PROJ-130-α: Mandanten-FK noch vorhanden';
  end if;

  -- Löschpfad 2: drei Wächter aktiv
  select count(*) into v_count
  from pg_trigger
  where tgrelid = 'public.audit_log_entries'::regclass
    and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-α: 3 Guard-Trigger erwartet, % gefunden', v_count;
  end if;

  -- DML-Rechte entzogen
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'audit_log_entries'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception 'PROJ-130-α: DML-Rechte für anon/authenticated noch vorhanden';
  end if;

  -- entity_type-CHECK vollständig
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_log_entity_type_check'
      and conrelid = 'public.audit_log_entries'::regclass
      and pg_get_constraintdef(oid) like '%ma_project_profiles%'
  ) then
    raise exception 'PROJ-130-α: entity_type-CHECK ohne ma_project_profiles';
  end if;

  -- keine stummen Trigger mehr
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'dependencies', 'ma_project_profiles', 'project_goals',
    'releases', 'sprints', 'stakeholder_coaching_recommendations'
  ]) t
  where coalesce(array_length(public._tracked_audit_columns(t), 1), 0) = 0;
  if v_missing is not null then
    raise exception 'PROJ-130-α: weiterhin stumm: %', v_missing;
  end if;

  -- Clobber-Schutz: die Zweige der Nachbar-Slices müssen erhalten sein
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'spa_issues', 'ma_valuations', 'skills', 'skill_versions', 'skill_examples',
    'skill_knowledge_links', 'external_document_links', 'dd_findings',
    'dd_questions', 'dd_streams', 'communication_matrix_entries',
    'communication_templates', 'documents', 'document_tree_nodes',
    'deliverables', 'deliverable_documents', 'committees', 'committee_members',
    'workstreams', 'ma_stage_gates', 'raci_assignments', 'risk_categories',
    'stakeholders', 'work_items', 'projects', 'phases', 'risks'
  ]) t
  where coalesce(array_length(public._tracked_audit_columns(t), 1), 0) = 0;
  if v_missing is not null then
    raise exception 'PROJ-130-α: Nachbar-Zweige verloren: %', v_missing;
  end if;

  -- keine waisen Zweige mehr (budget_postings = dokumentierte Ausnahme)
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'tenant_memberships', 'role_rates', 'vendor_documents', 'ma_nda_assignments',
    'committee_templates', 'communication_templates',
    'committee_meeting_attendees', 'committee_meeting_documents'
  ]) t
  where not exists (
    select 1 from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    where p.proname = 'record_audit_changes'
      and not tg.tgisinternal
      and c.relname = t
  );
  if v_missing is not null then
    raise exception 'PROJ-130-α: Zweige weiterhin ohne Trigger: %', v_missing;
  end if;

  -- `record_audit_changes` selbst unangetastet
  if not exists (
    select 1 from pg_proc
    where proname = 'record_audit_changes'
      and pronamespace = 'public'::regnamespace
      and position('_tracked_audit_columns(TG_TABLE_NAME)' in pg_get_functiondef(oid)) > 0
  ) then
    raise exception 'PROJ-130-α: record_audit_changes wurde verändert oder ist beschädigt';
  end if;

  -- Abdeckung ist gewachsen, nicht geschrumpft
  select count(distinct c.relname) into v_count
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_proc p on p.oid = tg.tgfoid
  where p.proname = 'record_audit_changes'
    and not tg.tgisinternal;
  if v_count < 67 then
    raise exception 'PROJ-130-α: >= 67 auditierte Tabellen erwartet, % gefunden', v_count;
  end if;

  raise notice 'PROJ-130-α: alle Post-Conditions erfüllt (% auditierte Tabellen)', v_count;
end $$;

comment on function public._guard_audit_log_immutable() is
  'PROJ-130-α: macht audit_log_entries append-only. Blockiert UPDATE/DELETE/TRUNCATE für ALLE Rollen inklusive service_role und postgres. INSERT bleibt erlaubt, weil record_audit_changes (SECURITY DEFINER) und vier produktive Admin-Client-Pfade legitim schreiben.';

comment on table public.audit_log_entries is
  'PROJ-10 Audit-Trail, ab PROJ-130-α append-only und ohne Löschpfad: kein Retention-Purge (Cron-Block entfernt), kein Mandanten-FK-CASCADE. Aufbewahrung unbegrenzt (PO-Lock 2026-08-11); Betroffenenrechte laufen über die Redaktion im Export.';
