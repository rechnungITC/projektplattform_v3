-- PROJ-Y-130n — das Zugriffsprotokoll (δ1/δ2) bekommt Schreibschutz UND Verkettung.
--
-- ε deckte den Änderungs-Trail (`audit_log_entries`). Das Zugriffsprotokoll
-- (`confidential_read_log`) war davon nicht erfasst — und die Bestandsaufnahme
-- zeigt, dass dort MEHR fehlte als nur die Kette:
--
--   * es hat KEINE Wächter-Trigger (δ1/δ2 verließen sich allein auf RLS)
--   * `anon` und `authenticated` halten auf Tabellenebene noch INSERT/UPDATE/DELETE.
--     In der Praxis blockiert RLS sie (δ1-Pentest H beweist 42501), aber das ist
--     EINE Barriere, nicht Verteidigung in der Tiefe — α hat auf
--     `audit_log_entries` genau diese Rechte ausdrücklich entzogen.
--
-- Deshalb hier dieselbe Reihenfolge, auf der PROJ-130 als Ganzes besteht:
-- Manipulationsschutz VOR Nachweis. Eine Kette über ein Protokoll, das man still
-- ändern kann, wäre Detektion ohne Barriere.
--
-- Der Anker-Mechanismus wird NICHT kopiert, sondern um eine Quelle erweitert
-- (`source`). Zwei parallele Anker-Tabellen wären genau die Register-Verdopplung,
-- gegen die PROJ-130 überhaupt angetreten ist. Zum Zeitpunkt dieser Migration
-- existiert noch kein einziger Anker (der erste Siegel-Lauf kommt um 03:45 UTC),
-- der Umbau der Eindeutigkeit ist deshalb reibungsfrei.

-- =====================================================================
-- 1. Prävention: das Zugriffsprotokoll wird unveränderlich
-- =====================================================================
create or replace function public._guard_confidential_read_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception
    'confidential_read_log ist append-only: % ist nicht erlaubt (PROJ-Y-130n). Ein Zugriffsprotokoll, das man ändern kann, beweist nichts.',
    tg_op
    using errcode = '42501';
end;
$fn$;

drop trigger if exists confidential_read_log_no_update on public.confidential_read_log;
create trigger confidential_read_log_no_update
  before update on public.confidential_read_log
  for each row execute function public._guard_confidential_read_log_immutable();

drop trigger if exists confidential_read_log_no_delete on public.confidential_read_log;
create trigger confidential_read_log_no_delete
  before delete on public.confidential_read_log
  for each row execute function public._guard_confidential_read_log_immutable();

drop trigger if exists confidential_read_log_no_truncate on public.confidential_read_log;
create trigger confidential_read_log_no_truncate
  before truncate on public.confidential_read_log
  for each statement execute function public._guard_confidential_read_log_immutable();

revoke all on function public._guard_confidential_read_log_immutable() from public, anon, authenticated;

-- INSERT bleibt für den einzigen Schreibweg möglich: `log_confidential_read` ist
-- SECURITY DEFINER und läuft als Eigentümer, nicht als Aufrufer.
revoke insert, update, delete on public.confidential_read_log from anon, authenticated;

-- =====================================================================
-- 2. Der Anker bekommt eine Quelle
-- =====================================================================
alter table public.audit_chain_anchors
  add column if not exists source text not null default 'audit_log';

alter table public.audit_chain_anchors
  drop constraint if exists audit_chain_anchors_source_check;
alter table public.audit_chain_anchors
  add constraint audit_chain_anchors_source_check
  check (source in ('audit_log', 'confidential_read'));

-- Eindeutigkeit jetzt je Quelle: die beiden Ketten laufen unabhängig.
alter table public.audit_chain_anchors
  drop constraint if exists audit_chain_anchors_unique;
alter table public.audit_chain_anchors
  add constraint audit_chain_anchors_unique unique (tenant_id, source, window_start);

drop index if exists audit_chain_anchors_tenant_idx;
create index if not exists audit_chain_anchors_tenant_source_idx
  on public.audit_chain_anchors (tenant_id, source, window_start desc);

comment on column public.audit_chain_anchors.source is
  'PROJ-Y-130n: `audit_log` = Änderungs-Trail (ε), `confidential_read` = Zugriffsprotokoll (δ1/δ2). Getrennte Ketten in EINER Tabelle — zwei Anker-Tabellen wären die Register-Verdopplung, gegen die PROJ-130 angetreten ist.';

-- =====================================================================
-- 3. Fingerabdruck einer Zugriffs-Zeile
-- =====================================================================
-- Feste Feldliste, jsonb-kanonisiert, Zeitstempel als UTC-Text — dieselbe
-- Begründung wie in ε (kein Trennzeichen, das ein Freitext ausgleichen könnte;
-- Zeitzonen-Unabhängigkeit des Prüfwerts).
create or replace function public._read_log_entry_fingerprint(
  p_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_max_level public.ma_confidentiality_level,
  p_object_count integer,
  p_action text,
  p_outcome text,
  p_actor_user_id uuid,
  p_detail jsonb,
  p_created_at timestamptz
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select encode(sha256(convert_to(jsonb_build_object(
    'v', 1,
    'id', p_id,
    'tenant_id', p_tenant_id,
    'project_id', p_project_id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'max_level', p_max_level::text,
    'object_count', p_object_count,
    'action', p_action,
    'outcome', p_outcome,
    'actor_user_id', p_actor_user_id,
    'detail', p_detail,
    'created_at', to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')
  )::text, 'utf8')), 'hex');
$fn$;

comment on function public._read_log_entry_fingerprint is
  'PROJ-Y-130n: Fingerabdruck EINER Zeile des Zugriffsprotokolls über eine feste Feldliste (digest_version 1).';

-- =====================================================================
-- 4. Fenster-Prüfwert je Quelle
-- =====================================================================
drop function if exists public._audit_window_digest(uuid, timestamptz, timestamptz);

create function public._audit_window_digest(
  p_tenant_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_source text default 'audit_log',
  out entry_count integer,
  out entries_digest text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- SECURITY DEFINER wie in ε: die Prüfung muss ALLE Zeilen sehen. Unter dem
  -- Need-to-know-Tor blieben Einträge verborgen und die Kette wirkte gebrochen,
  -- obwohl nur eine Freigabe fehlt. Zurückgegeben werden nur Anzahl und Prüfwert.
  if p_source = 'audit_log' then
    select count(*)::int,
           coalesce(encode(sha256(convert_to(
             string_agg(fp, '' order by ord_at, ord_id), 'utf8')), 'hex'), repeat('0', 64))
      into entry_count, entries_digest
    from (
      select e.changed_at as ord_at, e.id as ord_id,
             public._audit_entry_fingerprint(
               e.id, e.tenant_id, e.entity_type, e.entity_id, e.field_name,
               e.old_value, e.new_value, e.actor_user_id, e.changed_at,
               e.change_reason, e.causation_id) as fp
        from public.audit_log_entries e
       where e.tenant_id = p_tenant_id
         and e.changed_at >= p_window_start
         and e.changed_at < p_window_end
    ) s;
  elsif p_source = 'confidential_read' then
    select count(*)::int,
           coalesce(encode(sha256(convert_to(
             string_agg(fp, '' order by ord_at, ord_id), 'utf8')), 'hex'), repeat('0', 64))
      into entry_count, entries_digest
    from (
      select l.created_at as ord_at, l.id as ord_id,
             public._read_log_entry_fingerprint(
               l.id, l.tenant_id, l.project_id, l.entity_type, l.entity_id,
               l.max_level, l.object_count, l.action, l.outcome, l.actor_user_id,
               l.detail, l.created_at) as fp
        from public.confidential_read_log l
       where l.tenant_id = p_tenant_id
         and l.created_at >= p_window_start
         and l.created_at < p_window_end
    ) s;
  else
    raise exception 'PROJ-Y-130n: unbekannte Quelle %', p_source using errcode = '22023';
  end if;
end;
$fn$;

revoke all on function public._audit_window_digest(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;

-- =====================================================================
-- 5. Siegeln über beide Quellen
-- =====================================================================
drop function if exists public.seal_audit_chain(interval, integer);

create function public.seal_audit_chain(
  p_margin interval default interval '2 hours',
  p_max_windows integer default 4000
)
returns table (sealed_tenant_id uuid, sealed_source text, sealed_windows integer, last_window_start timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cutoff timestamptz := date_trunc('day', (now() - p_margin) at time zone 'UTC') at time zone 'UTC';
  v_tenant uuid;
  v_source text;
  v_day timestamptz;
  v_prev text;
  v_count int;
  v_digest text;
  v_chain text;
  v_sealed int;
  v_last timestamptz;
  v_guard int := 0;
begin
  for v_tenant in
    select tenant_id from public.audit_log_entries
    union
    select tenant_id from public.confidential_read_log
  loop
    foreach v_source in array array['audit_log', 'confidential_read']
    loop
      v_sealed := 0;
      v_last := null;
      v_prev := null;

      select a.chain_digest, a.window_start into v_prev, v_last
        from public.audit_chain_anchors a
       where a.tenant_id = v_tenant and a.source = v_source
       order by a.window_start desc
       limit 1;

      if v_prev is null then
        v_prev := repeat('0', 64);
        -- Die Kette beginnt beim ersten Eintrag DIESER Quelle. Hat die Quelle für
        -- diesen Mandanten nichts, bleibt v_day null und es wird nichts gesiegelt.
        if v_source = 'audit_log' then
          select date_trunc('day', min(e.changed_at) at time zone 'UTC') at time zone 'UTC'
            into v_day from public.audit_log_entries e where e.tenant_id = v_tenant;
        else
          select date_trunc('day', min(l.created_at) at time zone 'UTC') at time zone 'UTC'
            into v_day from public.confidential_read_log l where l.tenant_id = v_tenant;
        end if;
      else
        v_day := v_last + interval '1 day';
      end if;

      while v_day is not null and v_day < v_cutoff loop
        v_guard := v_guard + 1;
        exit when v_guard > p_max_windows;

        select d.entry_count, d.entries_digest into v_count, v_digest
          from public._audit_window_digest(v_tenant, v_day, v_day + interval '1 day', v_source) d;

        v_chain := public._audit_chain_digest(
          v_prev, v_day, v_day + interval '1 day', v_count, v_digest, 1::smallint);

        insert into public.audit_chain_anchors
          (tenant_id, source, window_start, window_end, entry_count, entries_digest, prev_digest, chain_digest)
        values
          (v_tenant, v_source, v_day, v_day + interval '1 day', v_count, v_digest, v_prev, v_chain)
        on conflict (tenant_id, source, window_start) do nothing;

        v_prev := v_chain;
        v_last := v_day;
        v_sealed := v_sealed + 1;
        v_day := v_day + interval '1 day';
      end loop;

      if v_sealed > 0 then
        sealed_tenant_id := v_tenant;
        sealed_source := v_source;
        sealed_windows := v_sealed;
        last_window_start := v_last;
        return next;
      end if;
    end loop;
  end loop;
end;
$fn$;

revoke all on function public.seal_audit_chain(interval, integer) from public, anon, authenticated;
grant execute on function public.seal_audit_chain(interval, integer) to postgres, service_role;

comment on function public.seal_audit_chain is
  'PROJ-130-ε / PROJ-Y-130n: siegelt abgeschlossene Tagesfenster je Mandant UND je Quelle (Änderungs-Trail + Zugriffsprotokoll) zu Prüfwert-Ankern. Idempotent, siegelt auch leere Tage. Nur service_role.';

-- =====================================================================
-- 6. Verifikation über beide Ketten
-- =====================================================================
drop function if exists public.verify_audit_chain(uuid);

create function public.verify_audit_chain(p_tenant_id uuid)
returns table (
  source text,
  window_start timestamptz,
  entry_count_sealed integer,
  entry_count_now integer,
  digest_ok boolean,
  link_ok boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_prev text;
  v_source text := null;
  a record;
  v_count int;
  v_digest text;
  v_chain text;
begin
  if not (public.is_tenant_admin(p_tenant_id)
          or public.has_audit_reader_grant(p_tenant_id)) then
    raise exception 'PROJ-130-ε: keine Berechtigung zur Prüfung des Audit-Trails'
      using errcode = '42501';
  end if;

  for a in
    select * from public.audit_chain_anchors
     where audit_chain_anchors.tenant_id = p_tenant_id
     order by audit_chain_anchors.source, audit_chain_anchors.window_start
  loop
    -- Jede Quelle ist eine eigene Kette: der Vorgänger-Prüfwert wird beim
    -- Quellenwechsel auf die Wurzel zurückgesetzt, sonst meldete der Übergang
    -- zwischen zwei Ketten einen Bruch, den es nicht gibt.
    if v_source is null or v_source <> a.source then
      v_source := a.source;
      v_prev := repeat('0', 64);
    end if;

    select d.entry_count, d.entries_digest into v_count, v_digest
      from public._audit_window_digest(p_tenant_id, a.window_start, a.window_end, a.source) d;

    v_chain := public._audit_chain_digest(
      a.prev_digest, a.window_start, a.window_end, a.entry_count,
      a.entries_digest, a.digest_version);

    source := a.source;
    window_start := a.window_start;
    entry_count_sealed := a.entry_count;
    entry_count_now := v_count;
    digest_ok := (v_digest = a.entries_digest and v_count = a.entry_count);
    link_ok := (v_chain = a.chain_digest and a.prev_digest = v_prev);
    v_prev := a.chain_digest;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.verify_audit_chain(uuid) from public, anon;
grant execute on function public.verify_audit_chain(uuid) to authenticated, service_role, postgres;

comment on function public.verify_audit_chain is
  'PROJ-130-ε / PROJ-Y-130n: rechnet die Prüfwert-Ketten eines Mandanten nach — je Quelle getrennt (Änderungs-Trail, Zugriffsprotokoll). SECURITY DEFINER, weil die Prüfung alle Zeilen sehen muss; gibt nur Zahlen und Urteile zurück. Gate: Mandanten-Admin oder Revisions-Freigabe.';

-- =====================================================================
-- 7. Post-Conditions
-- =====================================================================
do $do$
declare v int;
begin
  select count(*) into v from pg_trigger
   where tgrelid='public.confidential_read_log'::regclass and not tgisinternal;
  if v <> 3 then
    raise exception 'PROJ-Y-130n: Wächter am Zugriffsprotokoll unvollständig (%/3)', v;
  end if;

  select count(*) into v from information_schema.role_table_grants
   where table_schema='public' and table_name='confidential_read_log'
     and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE');
  if v <> 0 then
    raise exception 'PROJ-Y-130n: % offene DML-Grants am Zugriffsprotokoll', v;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='audit_chain_anchors_unique'
      and pg_get_constraintdef(oid) like '%source%'
  ) then
    raise exception 'PROJ-Y-130n: Eindeutigkeit der Anker enthält die Quelle nicht';
  end if;

  -- α/ε-Zusagen halten
  select count(*) into v from pg_trigger
   where tgrelid='public.audit_log_entries'::regclass and not tgisinternal;
  if v <> 3 then raise exception 'PROJ-Y-130n: α-Wächter beschädigt (%/3)', v; end if;
  select count(*) into v from pg_trigger
   where tgrelid='public.audit_chain_anchors'::regclass and not tgisinternal;
  if v <> 3 then raise exception 'PROJ-Y-130n: ε-Anker-Wächter beschädigt (%/3)', v; end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='seal_audit_chain'
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'PROJ-Y-130n: seal_audit_chain ist für Anwendungsnutzer aufrufbar';
  end if;

  raise notice 'PROJ-Y-130n: Post-Conditions erfüllt';
end $do$;
