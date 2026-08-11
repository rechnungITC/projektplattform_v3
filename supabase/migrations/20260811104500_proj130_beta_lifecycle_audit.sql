-- PROJ-130-β — Lückenloser Audit-Trail, Teil 2: "Schreibvorgänge vollständig"
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- Baut auf α (20260811093000). CIA-Auflagen 3 und 8.
--
-- Vor β protokollierte der Trail ausschließlich Feldänderungen: alle Audit-
-- Trigger sind `AFTER UPDATE`. Anlage und Löschung von Geschäftsobjekten
-- hinterließen keine Spur, und der Papierkorb der vier Kernobjekte
-- (`is_deleted`) stand in keinem Whitelist-Zweig.
--
-- β ergänzt das ADDITIV (CIA-Auflage 3): `record_audit_changes()` und ihre 67
-- UPDATE-Trigger bleiben unberührt. Neu sind eine zweite Trigger-Funktion und
-- ein zweiter, eigener Triggersatz.
--
-- Zeilen-Semantik: EINE Zeile pro Objekt, nicht pro Feld. `field_name` trägt
-- ein Sentinel (`__created` / `__deleted`), der Wert eine kompakte Kennung
-- (Titel/Name), NICHT den vollständigen Datensatz — ein Row-Abzug würde
-- personenbezogenen Klartext ins Protokoll spülen und die Redaktion im
-- Audit-Export umgehen.
--
-- Bewusst NICHT Teil von β:
--   * die append-only Ereignis-Inseln (`*_approval_events`,
--     `communication_access_log`, `assistant_action_events`,
--     `stakeholder_profile_audit_events`) werden NICHT in den zentralen Trail
--     kopiert — Duplizierung wäre ein zweites Register mit eigener Driftgefahr.
--     Sie werden in γ auffindbar gemacht.
--   * Lesezugriffe auf `strict` (→ δ)
--   * die restlichen unabgedeckten Tabellen (→ PROJ-Y-130d)

-- =====================================================================
-- 1. Gemeinsame Auflösung: Objekt-Identität und Kurz-Kennung
-- =====================================================================

-- Abweichung von der CIA-Empfehlung, beide Trigger-Funktionen auf diesen
-- Resolver umzustellen: das würde `record_audit_changes` anfassen und damit
-- CIA-Auflage 3 verletzen (43 Migrationen Historie, zwei Clobber-Vorfälle).
-- Der Resolver ist deshalb zunächst nur die Autorität für die NEUE Funktion.
-- Damit daraus kein fünftes driftendes Register wird, prüft Block 5 unten, dass
-- `record_audit_changes` keine Sonderfälle kennt, die der Resolver nicht hat.
create or replace function public._audit_entity_context(
  p_table text,
  p_row jsonb,
  out entity_id uuid,
  out tenant_id uuid
)
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select
    case p_table
      when 'tenants' then (p_row->>'id')::uuid
      when 'tenant_settings' then (p_row->>'tenant_id')::uuid
      -- Zusammengesetzter PK ohne `id`: das fachliche Elternobjekt ist die
      -- Interaktion. (Dieselbe Tabelle ist der Grund für PROJ-Y-130g.)
      when 'stakeholder_interaction_participants' then (p_row->>'interaction_id')::uuid
      when 'decision_approval_state' then (p_row->>'decision_id')::uuid
      else (p_row->>'id')::uuid
    end,
    case p_table
      when 'tenants' then (p_row->>'id')::uuid
      else (p_row->>'tenant_id')::uuid
    end
$$;

revoke all on function public._audit_entity_context(text, jsonb) from public;
revoke all on function public._audit_entity_context(text, jsonb) from anon, authenticated;

-- Kompakte, menschenlesbare Kennung des Objekts. Absichtlich eine schmale
-- Auswahl benennender Spalten — kein Row-Abzug, keine Freitext-/Inhaltsfelder.
create or replace function public._audit_row_label(p_row jsonb)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select left(coalesce(
    p_row->>'title',
    p_row->>'name',
    p_row->>'label',
    p_row->>'template_key',
    p_row->>'code',
    p_row->>'key',
    p_row->>'slug'
  ), 200)
$$;

revoke all on function public._audit_row_label(jsonb) from public;
revoke all on function public._audit_row_label(jsonb) from anon, authenticated;

-- =====================================================================
-- 2. Die zweite Trigger-Funktion: Anlage und Löschung
-- =====================================================================
create or replace function public.record_audit_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_entity uuid;
  v_tenant uuid;
  v_label text;
  v_reason text;
begin
  v_row := case tg_op when 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;

  select entity_id, tenant_id
    into v_entity, v_tenant
    from public._audit_entity_context(tg_table_name, v_row);

  -- Fail-closed: eine nicht auflösbare Identität wäre eine stille Lücke, und
  -- stille Lücken sind genau der Defekt, den PROJ-130 behebt. Block 6 stellt
  -- vor der Verdrahtung sicher, dass jede Ziel-Tabelle auflösbar ist.
  if v_entity is null or v_tenant is null then
    raise exception
      'PROJ-130-β: Audit-Identität für %.% nicht auflösbar (entity=%, tenant=%)',
      tg_table_name, tg_op, v_entity, v_tenant
      using errcode = 'P0001';
  end if;

  v_label := public._audit_row_label(v_row);
  v_reason := nullif(current_setting('audit.change_reason', true), '');

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  ) values (
    v_tenant,
    tg_table_name,
    v_entity,
    case tg_op when 'DELETE' then '__deleted' else '__created' end,
    case tg_op when 'DELETE' then to_jsonb(v_label) else null end,
    case tg_op when 'DELETE' then null else to_jsonb(v_label) end,
    auth.uid(),
    v_reason
  );

  return null; -- AFTER-Trigger: Rückgabewert wird ignoriert
end;
$$;

revoke all on function public.record_audit_lifecycle() from public;
revoke all on function public.record_audit_lifecycle() from anon, authenticated;

-- =====================================================================
-- 3. entity_type-CHECK: 6 sicherheitsrelevante Tabellen ergänzen
-- =====================================================================
-- Zustands- und Zugangs-Tabellen, deren Anlage/Löschung ein Governance-
-- Ereignis ist: Token, Mandanten-Geheimnisse, hochgeladene Kontextquellen,
-- Freigabe-Instanzen. Die zugehörigen Ereignis-Tabellen bleiben bewusst
-- draußen (siehe Kopf).
do $$
declare
  v_def text;
  v_new text;
  v_add text[] := array[
    'mcp_access_tokens', 'tenant_secrets', 'context_sources',
    'deliverable_approvals', 'deliverable_approval_stages', 'decision_approval_state'
  ];
  v_val text;
  v_added int := 0;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conname = 'audit_log_entity_type_check'
    and conrelid = 'public.audit_log_entries'::regclass;

  if v_def is null then
    raise exception 'PROJ-130-β: audit_log_entity_type_check nicht gefunden — Abbruch statt Raten';
  end if;

  v_new := v_def;
  foreach v_val in array v_add
  loop
    if position('''' || v_val || '''' in v_new) = 0 then
      v_new := regexp_replace(
        v_new, '\]\s*\)\s*\)\s*\)\s*$', ', ''' || v_val || '''::text])))'
      );
      if position('''' || v_val || '''' in v_new) = 0 then
        raise exception 'PROJ-130-β: Anker-Ersetzung am entity_type-CHECK fehlgeschlagen bei %', v_val;
      end if;
      v_added := v_added + 1;
    end if;
  end loop;

  if v_added > 0 then
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
    raise notice 'PROJ-130-β: entity_type-CHECK um % Wert(e) erweitert', v_added;
  else
    raise notice 'PROJ-130-β: entity_type-CHECK bereits vollständig — übersprungen';
  end if;
end $$;

-- =====================================================================
-- 4. Papierkorb sichtbar machen: `is_deleted` in die vier Kern-Zweige
-- =====================================================================
-- Soft-Delete von Projekt, Phase, Milestone und Arbeitspaket war bisher
-- unprotokolliert: `is_deleted` stand in keinem Whitelist-Zweig, obwohl es der
-- fachliche Löschvorgang dieser vier Tabellen ist. Anker-Ersetzung je Zweig,
-- whitespace-tolerant, mit Fail-Loud und Idempotenz.
do $$
declare
  v_def text;
  v_new text;
  v_tbl text;
  v_pattern text;
  v_changed int := 0;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = '_tracked_audit_columns'
    and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-β: _tracked_audit_columns nicht gefunden — Abbruch statt Raten';
  end if;

  v_new := v_def;

  foreach v_tbl in array array['projects', 'phases', 'milestones', 'work_items']
  loop
    -- Zweig finden und prüfen, ob is_deleted schon drin ist.
    v_pattern := 'when\s+''' || v_tbl || '''\s+then\s+array\[';

    if v_new !~ v_pattern then
      raise exception 'PROJ-130-β: Zweig für % nicht gefunden — Abbruch statt Raten', v_tbl;
    end if;

    -- Nur ergänzen, wenn der Zweig is_deleted nicht bereits führt. Die Prüfung
    -- muss auf den Zweig beschränkt sein, nicht auf die ganze Funktion.
    if (regexp_match(v_new, v_pattern || '([^\]]*)\]'))[1] !~ '''is_deleted''' then
      v_new := regexp_replace(
        v_new,
        '(' || v_pattern || '[^\]]*)\]',
        '\1,''is_deleted'']'
      );
      v_changed := v_changed + 1;
    end if;
  end loop;

  if v_changed = 0 then
    raise notice 'PROJ-130-β: is_deleted bereits in allen vier Kern-Zweigen — übersprungen';
  else
    execute v_new;

    -- Post-Condition: alle vier führen is_deleted, und kein Zweig ging verloren.
    foreach v_tbl in array array['projects', 'phases', 'milestones', 'work_items']
    loop
      if not ('is_deleted' = any (public._tracked_audit_columns(v_tbl))) then
        raise exception 'PROJ-130-β: is_deleted fehlt nach der Ersetzung in %', v_tbl;
      end if;
    end loop;

    raise notice 'PROJ-130-β: is_deleted in % Kern-Zweig(en) ergänzt', v_changed;
  end if;
end $$;

grant execute on function public._tracked_audit_columns(text) to postgres, service_role, authenticated;

-- =====================================================================
-- 5. Drift-Wächter: der Resolver muss alle Sonderfälle kennen
-- =====================================================================
-- Solange `record_audit_changes` seine eigene Inline-Auflösung behält
-- (CIA-Auflage 3), darf sie keinen Sonderfall kennen, den der Resolver nicht
-- hat. Sonst driften die beiden auseinander — genau das Muster, das PROJ-130
-- behebt. Diese Prüfung schlägt laut fehl, sobald jemand dort einen Zweig
-- ergänzt, ohne den Resolver mitzuziehen.
do $$
declare
  v_def text;
  v_known text[] := array['tenants', 'tenant_settings'];
  v_found text[];
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'record_audit_changes' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-β: record_audit_changes nicht gefunden';
  end if;

  select array_agg(m[1] order by m[1]) into v_found
  from regexp_matches(v_def, 'when\s+''([a-z_]+)''\s+then', 'g') m;

  if v_found is distinct from (select array_agg(t order by t) from unnest(v_known) t) then
    raise exception
      'PROJ-130-β: record_audit_changes kennt Sonderfälle %, der Resolver kennt % — bitte _audit_entity_context mitziehen',
      v_found, v_known;
  end if;
end $$;

-- =====================================================================
-- 6. Verdrahtung: Anlage/Löschung für die deklariert auditierbaren Tabellen
--    plus die sicherheitsrelevante Ergänzung aus Block 3
-- =====================================================================
do $$
declare
  v_extra text[] := array[
    'ma_confidentiality_clearances', 'ma_clearance_grant_requests', 'tenant_ai_providers',
    'mcp_access_tokens', 'tenant_secrets', 'context_sources',
    'deliverable_approvals', 'deliverable_approval_stages', 'decision_approval_state'
  ];
  v_targets text[];
  v_allowed text[];
  v_tbl text;
  v_trg text;
  v_key text;
  v_events text;
  v_before int;
  v_after int;
  v_expected int;
  v_skipped text[] := array[]::text[];
begin
  -- Erlaubte entity_type-Werte aus dem CHECK selbst ableiten — nie eine
  -- zweite Liste pflegen.
  select array_agg(m[1]) into v_allowed
  from pg_constraint c,
       lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
  where c.conname = 'audit_log_entity_type_check'
    and c.conrelid = 'public.audit_log_entries'::regclass;

  -- Zielmenge: alles was einen nicht-leeren Whitelist-Zweig hat (also bereits
  -- als auditierbar deklariert ist), plus die Ergänzung aus Block 3.
  select array_agg(distinct t) into v_targets
  from (
    select c.relname::text as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and coalesce(array_length(public._tracked_audit_columns(c.relname::text), 1), 0) > 0
    union
    select unnest(v_extra)
  ) s;

  select count(distinct c.relname) into v_before
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
   where p.proname = 'record_audit_lifecycle' and not tg.tgisinternal;

  v_expected := 0;

  foreach v_tbl in array v_targets
  loop
    -- Tabelle muss existieren
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_tbl
    ) then
      v_skipped := v_skipped || (v_tbl || ' (Tabelle fehlt)');
      continue;
    end if;

    -- entity_type muss erlaubt sein, sonst bricht der erste INSERT mit 23514
    if not (v_tbl = any (v_allowed)) then
      v_skipped := v_skipped || (v_tbl || ' (nicht im entity_type-CHECK)');
      continue;
    end if;

    -- Identität muss statisch auflösbar sein (fail-closed im Trigger)
    v_key := case v_tbl
      when 'tenants' then 'id'
      when 'tenant_settings' then 'tenant_id'
      when 'stakeholder_interaction_participants' then 'interaction_id'
      when 'decision_approval_state' then 'decision_id'
      else 'id'
    end;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tbl and column_name = v_key
    ) then
      v_skipped := v_skipped || (v_tbl || ' (kein ' || v_key || ')');
      continue;
    end if;

    if v_tbl <> 'tenants' and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tbl and column_name = 'tenant_id'
    ) then
      v_skipped := v_skipped || (v_tbl || ' (kein tenant_id)');
      continue;
    end if;

    -- Der Trigger ist fail-closed: eine nicht auflösbare Identität bricht den
    -- Geschäftsvorgang ab. Deshalb wird hier nur verdrahtet, wenn die
    -- Identitätsspalten NOT NULL sind. Heute gilt das für alle Ziel-Tabellen;
    -- eine künftige Tabelle mit nullbarem tenant_id wird übersprungen statt
    -- Schreibvorgänge zu brechen.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tbl
        and column_name in ('tenant_id', v_key)
        and is_nullable = 'YES'
    ) then
      v_skipped := v_skipped || (v_tbl || ' (Identitätsspalte nullbar — fail-closed nicht sicher)');
      continue;
    end if;

    -- Doppel-Protokollierung vermeiden. Live erhoben, nicht geraten: genau drei
    -- Tabellen protokollieren Anlage/Löschung heute schon auf eigenem Weg.
    --   * dependencies  — eigene INSERT- UND DELETE-Audit-Trigger  -> gar nicht
    --   * decisions     — eigener INSERT-Audit-Trigger             -> nur DELETE
    --   * budget_postings — die Buchungs-Routen schreiben ihre Audit-Zeilen
    --                       selbst über den Admin-Client (Anlage + Storno),
    --                       dieselbe Ausnahme wie in α                -> gar nicht
    v_events := case v_tbl
      when 'dependencies' then null
      when 'budget_postings' then null
      when 'decisions' then 'delete'
      else 'insert or delete'
    end;

    if v_events is null then
      v_skipped := v_skipped || (v_tbl || ' (Anlage/Löschung bereits eigenständig protokolliert)');
      continue;
    end if;

    v_trg := 'audit_lifecycle_' || v_tbl;
    execute format('drop trigger if exists %I on public.%I', v_trg, v_tbl);
    execute format(
      'create trigger %I after %s on public.%I for each row execute function public.record_audit_lifecycle()',
      v_trg, v_events, v_tbl
    );
    v_expected := v_expected + 1;
  end loop;

  select count(distinct c.relname) into v_after
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
   where p.proname = 'record_audit_lifecycle' and not tg.tgisinternal;

  -- Relative Prüfung, keine absolute Schwelle: Prod und die aus den
  -- Migrationsdateien aufgebaute Shadow-DB haben nachweislich unterschiedlich
  -- viele auditierte Tabellen (α-Fund, PROJ-Y-130f).
  if v_after <> v_expected then
    raise exception 'PROJ-130-β: % Lifecycle-Trigger erwartet, % vorhanden', v_expected, v_after;
  end if;

  raise notice 'PROJ-130-β: Lifecycle-Trigger auf % Tabellen (vorher %)', v_after, v_before;
  if array_length(v_skipped, 1) > 0 then
    raise notice 'PROJ-130-β: bewusst übersprungen: %', array_to_string(v_skipped, '; ');
  end if;
end $$;

-- =====================================================================
-- 7. Post-Conditions
-- =====================================================================
do $$
declare
  v_count int;
  v_missing text;
begin
  -- α-Zusagen halten weiterhin
  if exists (
    select 1 from pg_constraint
    where conname = 'audit_log_tenant_fkey'
      and conrelid = 'public.audit_log_entries'::regclass
  ) then
    raise exception 'PROJ-130-β: Mandanten-FK wieder aufgetaucht';
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-β: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  -- Papierkorb der vier Kernobjekte ist getrackt
  select string_agg(t, ', ') into v_missing
  from unnest(array['projects', 'phases', 'milestones', 'work_items']) t
  where not ('is_deleted' = any (public._tracked_audit_columns(t)));
  if v_missing is not null then
    raise exception 'PROJ-130-β: is_deleted fehlt in: %', v_missing;
  end if;

  -- Clobber-Schutz: die Zweige der Nachbar-Slices sind unverändert
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'spa_issues', 'ma_valuations', 'skills', 'skill_versions', 'skill_examples',
    'skill_knowledge_links', 'external_document_links', 'dd_findings', 'dd_questions',
    'dd_streams', 'communication_matrix_entries', 'communication_templates',
    'documents', 'document_tree_nodes', 'deliverables', 'deliverable_documents',
    'committees', 'committee_members', 'workstreams', 'ma_stage_gates',
    'raci_assignments', 'risk_categories', 'stakeholders', 'work_items',
    'projects', 'phases', 'risks', 'ma_project_profiles', 'sprints', 'releases',
    'project_goals', 'dependencies', 'tenant_memberships', 'role_rates'
  ]) t
  where coalesce(array_length(public._tracked_audit_columns(t), 1), 0) = 0;
  if v_missing is not null then
    raise exception 'PROJ-130-β: Nachbar-Zweige verloren: %', v_missing;
  end if;

  -- `record_audit_changes` und ihre UPDATE-Trigger unangetastet
  if not exists (
    select 1 from pg_proc
    where proname = 'record_audit_changes'
      and pronamespace = 'public'::regnamespace
      and position('_tracked_audit_columns(TG_TABLE_NAME)' in pg_get_functiondef(oid)) > 0
  ) then
    raise exception 'PROJ-130-β: record_audit_changes verändert oder beschädigt';
  end if;

  -- Beide Triggersätze existieren nebeneinander
  select count(distinct c.relname) into v_count
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  join pg_proc p on p.oid = tg.tgfoid
  where p.proname = 'record_audit_lifecycle' and not tg.tgisinternal;
  if v_count = 0 then
    raise exception 'PROJ-130-β: kein Lifecycle-Trigger verdrahtet';
  end if;

  raise notice 'PROJ-130-β: Post-Conditions erfüllt (% Tabellen mit Lifecycle-Trigger)', v_count;
end $$;

comment on function public.record_audit_lifecycle() is
  'PROJ-130-β: protokolliert Anlage und Löschung als EINE Zeile pro Objekt (field_name __created/__deleted) mit kompakter Kennung statt Row-Abzug. Additiv zu record_audit_changes, die ausschließlich Feldänderungen protokolliert.';

comment on function public._audit_entity_context(text, jsonb) is
  'PROJ-130-β: löst Objekt- und Mandanten-Identität aus einer Zeile auf, inklusive der Tabellen ohne einspaltigen id-PK. Autorität für record_audit_lifecycle; record_audit_changes behält vorerst ihre Inline-Auflösung (CIA-Auflage 3), gegen Drift gesichert durch den Wächter in derselben Migration.';
