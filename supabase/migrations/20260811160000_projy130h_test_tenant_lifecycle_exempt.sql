-- PROJ-Y-130h — Test-Mandanten von der Lifecycle-Protokollierung ausnehmen.
--
-- ANLASS
-- Seit PROJ-130-α hat der Audit-Trail keinen Löschpfad mehr, und seit β wird
-- jede Anlage und Löschung protokolliert. Beides zusammen heißt: ein
-- committender Live-Testlauf hinterlässt dauerhafte, nicht entfernbare Zeilen
-- in einem Compliance-Artefakt. Genau das ist am 2026-08-11 eingetreten — 7
-- Zeilen aus einem E2E-Lauf, alle im Mandanten
-- `e2e00000-0000-4e2e-8e2e-000000000002`. Der Produktivmandant war nicht
-- betroffen.
--
-- DIE AUSNAHME IST EIN RISIKO, DESHALB DREI SICHERUNGEN
-- Eine Ausnahme im Trail ist die Sorte stille Lücke, gegen die PROJ-130
-- antritt. Wird ein ausgenommener Mandant je für echte Daten benutzt, ist sein
-- Protokoll unvollständig und ein späterer Prüfer sieht das nicht. Darum:
--   1. Die Ausnahme ist ein SICHTBARES Feld an `tenants`, kein magischer
--      Konstantenwert im Trigger.
--   2. Das Setzen des Feldes ist SELBST auditiert (neuer Whitelist-Zweig-
--      Eintrag) — und zwar über den Feld-Audit-Pfad, der von der Ausnahme
--      NICHT betroffen ist. Wer die Ausnahme setzt, kann seine eigene
--      Spur nicht damit verwischen.
--   3. Die Ausnahme wird in Bericht und Export ausgewiesen (TS-Seite), damit
--      niemand einen unvollständigen Trail für vollständig hält.
--
-- ENG GEFASST: die Ausnahme gilt NUR für Anlage/Löschung (β). Feldänderungen,
-- Statuswechsel und Klassifikationsänderungen werden auch in Test-Mandanten
-- weiter protokolliert — dort entsteht das Rauschen nicht, und der Verzicht
-- darauf hätte die Tests selbst weniger prüfbar gemacht.

-- =====================================================================
-- 1. Das sichtbare Feld
-- =====================================================================
alter table public.tenants
  add column if not exists audit_lifecycle_exempt boolean not null default false;

comment on column public.tenants.audit_lifecycle_exempt is
  'PROJ-Y-130h: wenn true, protokolliert record_audit_lifecycle für diesen Mandanten KEINE Anlage/Löschung. Nur für Test-Mandanten gedacht. Feldänderungen bleiben protokolliert, auch das Setzen dieses Flags selbst. Ein Mandant mit true hat einen bewusst unvollständigen Audit-Trail — Bericht und Export weisen das aus.';

-- =====================================================================
-- 2. Das Setzen des Flags ist selbst auditiert
-- =====================================================================
do $$
declare
  v_def text;
  v_new text;
  v_branch text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = '_tracked_audit_columns' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-Y-130h: _tracked_audit_columns nicht gefunden — Abbruch statt Raten';
  end if;

  if 'audit_lifecycle_exempt' = any (public._tracked_audit_columns('tenants')) then
    raise notice 'PROJ-Y-130h: tenants-Zweig führt audit_lifecycle_exempt bereits — übersprungen';
    return;
  end if;

  -- Anker: der tenants-Zweig. Whitespace-tolerant; die Ersetzung muss eindeutig
  -- sein, sonst würde ein anderer Zweig erweitert.
  if (select count(*) from regexp_matches(v_def, 'when\s+''tenants''\s+then\s+array\[', 'g')) <> 1 then
    raise exception 'PROJ-Y-130h: tenants-Zweig nicht eindeutig — Abbruch statt Raten';
  end if;

  v_new := regexp_replace(
    v_def,
    '(when\s+''tenants''\s+then\s+array\[[^\]]*)\]',
    '\1,''audit_lifecycle_exempt'']'
  );

  execute v_new;

  v_branch := array_to_string(public._tracked_audit_columns('tenants'), ',');
  if not ('audit_lifecycle_exempt' = any (public._tracked_audit_columns('tenants'))) then
    raise exception 'PROJ-Y-130h: Ersetzung am tenants-Zweig fehlgeschlagen (jetzt: %)', v_branch;
  end if;

  -- Die drei Bestands-Spalten müssen erhalten sein.
  if not ('language' = any (public._tracked_audit_columns('tenants'))
          and 'branding' = any (public._tracked_audit_columns('tenants'))
          and 'holiday_region' = any (public._tracked_audit_columns('tenants'))) then
    raise exception 'PROJ-Y-130h: Bestands-Spalten des tenants-Zweigs verloren (jetzt: %)', v_branch;
  end if;

  raise notice 'PROJ-Y-130h: tenants-Zweig jetzt %', v_branch;
end $$;

grant execute on function public._tracked_audit_columns(text) to postgres, service_role, authenticated;

-- =====================================================================
-- 3. Die Lifecycle-Funktion respektiert die Ausnahme
-- =====================================================================
-- Vollständige Neuanlage ist hier sicher: `record_audit_lifecycle` stammt aus
-- PROJ-130-β (heute), hat keine Zweige anderer Slices und wird von niemandem
-- sonst erweitert. Sie ist damit NICHT in derselben Clobber-Gefahr wie
-- `_tracked_audit_columns` oder `can_read_audit_entry`.
create or replace function public.record_audit_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row jsonb;
  v_entity uuid;
  v_tenant uuid;
  v_label text;
  v_reason text;
  v_exempt boolean;
begin
  v_row := case tg_op when 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;

  select entity_id, tenant_id
    into v_entity, v_tenant
    from public._audit_entity_context(tg_table_name, v_row);

  if v_entity is null or v_tenant is null then
    raise exception
      'PROJ-130-β: Audit-Identität für %.% nicht auflösbar (entity=%, tenant=%)',
      tg_table_name, tg_op, v_entity, v_tenant
      using errcode = 'P0001';
  end if;

  -- PROJ-Y-130h: Test-Mandanten erzeugen kein dauerhaftes Lifecycle-Rauschen.
  -- Fehlt die Mandanten-Zeile (z. B. weil der Mandant selbst gelöscht wird),
  -- wird protokolliert — eine Mandanten-Löschung ist kein Test-Rauschen.
  select t.audit_lifecycle_exempt into v_exempt
    from public.tenants t where t.id = v_tenant;
  if coalesce(v_exempt, false) then
    return null;
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

  return null;
end;
$fn$;

revoke all on function public.record_audit_lifecycle() from public;
revoke all on function public.record_audit_lifecycle() from anon, authenticated;

comment on function public.record_audit_lifecycle() is
  'PROJ-130-β: protokolliert Anlage und Löschung als EINE Zeile pro Objekt (field_name __created/__deleted) mit kompakter Kennung statt Row-Abzug. PROJ-Y-130h: übersprungen für Mandanten mit tenants.audit_lifecycle_exempt = true.';

-- =====================================================================
-- 3b. Die Ausnahme muss für JEDEN sichtbar sein, der den Trail liest
-- =====================================================================
-- Sicherung 3 aus dem Kopf. Ein direkter Blick auf `tenants` genügt dafür
-- nicht: die RLS dort verlangt Mitgliedschaft, und ein externer Prüfer mit
-- Revisions-Freigabe (γ2) ist bewusst kein Mitglied — er bekäme den Hinweis
-- also gerade nicht, obwohl er die Zielgruppe ist. Deshalb ein schmaler
-- DEFINER-Helper, der genau einen Boolean preisgibt.
create or replace function public.tenant_audit_lifecycle_exempt(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select t.audit_lifecycle_exempt from public.tenants t where t.id = p_tenant_id),
    false
  )
$fn$;

revoke all on function public.tenant_audit_lifecycle_exempt(uuid) from public;
revoke all on function public.tenant_audit_lifecycle_exempt(uuid) from anon;
grant execute on function public.tenant_audit_lifecycle_exempt(uuid) to postgres, service_role, authenticated;

comment on function public.tenant_audit_lifecycle_exempt(uuid) is
  'PROJ-Y-130h: gibt preis, ob ein Mandant von der Lifecycle-Protokollierung ausgenommen ist — also einen bewusst unvollständigen Audit-Trail hat. Bewusst SECURITY DEFINER, weil die Zielgruppe des Hinweises (Revisor mit γ2-Freigabe) kein Mandanten-Mitglied ist und `tenants` deshalb nicht lesen kann.';

-- =====================================================================
-- 4. Die vorhandenen Test-Mandanten kennzeichnen
-- =====================================================================
-- Nach Namenspräfix, damit auch frisch aufgebaute Umgebungen davon profitieren.
-- Die Post-Condition unten stellt sicher, dass nichts anderes erfasst wird.
do $$
declare
  v_names text;
  v_count int;
begin
  update public.tenants
     set audit_lifecycle_exempt = true
   where name like '[E2E]%'
     and audit_lifecycle_exempt = false;

  select count(*), string_agg(name || ' (' || id::text || ')', '; ' order by name)
    into v_count, v_names
    from public.tenants where audit_lifecycle_exempt;

  raise notice 'PROJ-Y-130h: % Mandant(en) ausgenommen: %', v_count, coalesce(v_names, '—');
end $$;

-- =====================================================================
-- 5. Post-Conditions
-- =====================================================================
do $$
declare
  v_bad text;
  v_count int;
begin
  -- Sicherung: NUR als Test erkennbare Mandanten sind ausgenommen. Diese
  -- Prüfung ist der Grund, warum die Kennzeichnung über den Namen läuft und
  -- nicht über eine Liste von UUIDs, die niemand mehr nachvollziehen kann.
  select string_agg(name || ' (' || id::text || ')', '; ' order by name) into v_bad
    from public.tenants
   where audit_lifecycle_exempt and name not like '[E2E]%';
  if v_bad is not null then
    raise exception 'PROJ-Y-130h: Mandant(en) ohne Test-Kennung ausgenommen: %', v_bad;
  end if;

  -- Das Flag ist auditiert
  if not ('audit_lifecycle_exempt' = any (public._tracked_audit_columns('tenants'))) then
    raise exception 'PROJ-Y-130h: Flag-Änderungen wären unprotokolliert';
  end if;

  -- Der Feld-Audit-Trigger auf tenants existiert weiterhin (sonst wäre Punkt 2
  -- wirkungslos — das Flag wäre nominell getrackt, aber nichts würde schreiben)
  if not exists (
    select 1 from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    where c.relname = 'tenants' and p.proname = 'record_audit_changes' and not tg.tgisinternal
  ) then
    raise exception 'PROJ-Y-130h: kein Feld-Audit-Trigger auf tenants — Flag-Änderung bliebe stumm';
  end if;

  -- α/β/γ-Zusagen halten
  select count(*) into v_count from pg_trigger
   where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-Y-130h: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  select count(distinct c.relname) into v_count
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
   where p.proname = 'record_audit_lifecycle' and not tg.tgisinternal;
  if v_count < 70 then
    raise exception 'PROJ-Y-130h: Lifecycle-Abdeckung geschrumpft (% Tabellen)', v_count;
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace
      and position('_audit_entry_classified_ok' in pg_get_functiondef(oid)) > 0
      and position('has_audit_reader_grant' in pg_get_functiondef(oid)) > 0
  ) then
    raise exception 'PROJ-Y-130h: γ1/γ2 aus dem Lesetor verschwunden';
  end if;

  raise notice 'PROJ-Y-130h: Post-Conditions erfüllt';
end $$;
