-- PROJ-130-ε — Manipulationsnachweis für den Audit-Trail: Prüfwert-Anker + Verifikation.
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- Baut auf α (Schreibschutz + Löschstopp), γ1 (Need-to-know im Trail),
-- γ2 (Revisions-Freigabe) und δ1/δ2 (Zugriffsprotokoll).
--
-- WARUM ANKER UND NICHT EINE KETTE PRO ZEILE
-- Eine Verkettung pro Eintrag müsste jede Geschäfts-Transaktion auf die
-- Kettenspitze serialisieren. Eine einzelne Änderung erzeugt leicht 5–15 Einträge,
-- die Sperre würde also über die gesamte Transaktionsdauer gehalten: zwei
-- parallele Deal-Bearbeitungen im selben Mandanten blockieren sich vollständig,
-- und auf einer Serverless-Plattform mit vielen kurzen Parallel-Anfragen entsteht
-- ein harter Durchsatzdeckel plus Verklemmungsrisiko. Anker über ABGESCHLOSSENE
-- Zeitfenster kosten im Schreibpfad NULL.
--
-- WAS DER ANKER LEISTET UND WAS NICHT
-- Die eigentliche Barriere ist α: die Wächter-Trigger verhindern Änderung und
-- Löschung für JEDE Rolle, auch `service_role` und `postgres`. Der Anker verhindert
-- nichts — er macht eine Manipulation NACHWEISBAR, die nur gelingen kann, wenn
-- jemand auf Datenbankebene die Wächter entfernt. Deshalb sind die Anker selbst
-- genauso geschützt wie der Trail (eigene Wächter unten): wer den Trail fälscht,
-- müsste sonst einfach den Anker nachziehen. Und weil jeder Anker den Prüfwert
-- seines Vorgängers einschließt, müsste er ALLE folgenden Anker nachziehen.
--
-- BEWUSSTE GRENZE: Manipulation INNERHALB des noch offenen (ungesiegelten)
-- Fensters ist nicht nachweisbar. Das ist der Preis dafür, den Schreibpfad nicht
-- zu belasten.
--
-- SICHERHEITSMARGE: gesiegelt wird nur ein Tag, der vollständig UND länger als die
-- Marge vorbei ist. Ohne sie meldete der Verifikationslauf Manipulation, wo bloß
-- eine spät abgeschlossene Transaktion nachgerückt ist (ihr `now()` liegt im
-- Fenster, sichtbar wird die Zeile erst beim Commit).

-- =====================================================================
-- 1. Die Anker
-- =====================================================================
create table if not exists public.audit_chain_anchors (
  id uuid primary key default gen_random_uuid(),
  -- Wie `audit_log_entries` seit α und `confidential_read_log` seit δ1: KEIN
  -- Fremdschlüssel. Ein Manipulationsnachweis muss die Löschung seines
  -- Gegenstands überleben — sonst verschwindet mit dem Mandanten auch der Beweis.
  tenant_id uuid not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  entry_count integer not null,
  entries_digest text not null,
  prev_digest text not null,
  chain_digest text not null,
  -- Der Prüfwert deckt eine FESTE Feldliste ab (siehe _audit_entry_fingerprint).
  -- Käme je ein Feld hinzu, änderte sich der Prüfwert aller Alt-Fenster und die
  -- Historie würde unverifizierbar. Die Version macht einen solchen Wechsel
  -- explizit, statt ihn als Manipulation erscheinen zu lassen.
  digest_version smallint not null default 1,
  sealed_at timestamptz not null default now(),

  constraint audit_chain_anchors_window_check check (window_end > window_start),
  constraint audit_chain_anchors_count_check check (entry_count >= 0),
  constraint audit_chain_anchors_unique unique (tenant_id, window_start)
);

create index if not exists audit_chain_anchors_tenant_idx
  on public.audit_chain_anchors (tenant_id, window_start desc);

alter table public.audit_chain_anchors enable row level security;

-- Lesen darf, wer den Trail lesen darf: Mandanten-Admin oder Revisions-Freigabe
-- aus γ2. KEINE schreibenden Policies — Anker entstehen ausschließlich über die
-- Siegel-Funktion unten.
drop policy if exists audit_chain_anchors_select on public.audit_chain_anchors;
create policy audit_chain_anchors_select on public.audit_chain_anchors
  for select using (
    public.is_tenant_admin(tenant_id) or public.has_audit_reader_grant(tenant_id)
  );

revoke insert, update, delete on public.audit_chain_anchors from anon, authenticated;

comment on table public.audit_chain_anchors is
  'PROJ-130-ε: Prüfwert-Anker über abgeschlossene Zeitfenster des Audit-Trails. Jeder Anker schließt den Prüfwert seines Vorgängers ein — die Anker bilden die Kette, nicht die Einträge. Kein FK auf tenants: der Nachweis muss die Löschung seines Gegenstands überleben.';

-- Die Anker sind so unveränderlich wie der Trail selbst. Eigene Wächter-Funktion
-- statt der aus α, damit die Fehlermeldung nicht die falsche Tabelle nennt —
-- eine irreführende Meldung auf einem Sicherheits-Wächter kostet im Ernstfall Zeit.
create or replace function public._guard_audit_chain_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception
    'audit_chain_anchors ist append-only: % ist nicht erlaubt (PROJ-130-ε). Wer einen Anker ändern könnte, könnte eine Manipulation des Audit-Trails nachträglich verdecken.',
    tg_op
    using errcode = '42501';
end;
$fn$;

drop trigger if exists audit_chain_anchors_no_update on public.audit_chain_anchors;
create trigger audit_chain_anchors_no_update
  before update on public.audit_chain_anchors
  for each row execute function public._guard_audit_chain_immutable();

drop trigger if exists audit_chain_anchors_no_delete on public.audit_chain_anchors;
create trigger audit_chain_anchors_no_delete
  before delete on public.audit_chain_anchors
  for each row execute function public._guard_audit_chain_immutable();

drop trigger if exists audit_chain_anchors_no_truncate on public.audit_chain_anchors;
create trigger audit_chain_anchors_no_truncate
  before truncate on public.audit_chain_anchors
  for each statement execute function public._guard_audit_chain_immutable();

revoke all on function public._guard_audit_chain_immutable() from public, anon, authenticated;

-- =====================================================================
-- 2. Prüfwert-Bildung
-- =====================================================================
-- Pro Zeile ein Fingerabdruck fester Länge, danach ein Prüfwert über die
-- geordnete Verkettung der Fingerabdrücke. Nicht direkt über die verketteten
-- Feldinhalte: dort könnte ein Angreifer ein Trennzeichen in einen Freitext
-- schmuggeln und eine Änderung an anderer Stelle ausgleichen.
--
-- `changed_at` wird ausdrücklich nach UTC in ein festes Format gebracht — ein
-- Verifikationslauf in einer anderen Sitzungs-Zeitzone muss denselben Prüfwert
-- ergeben, sonst meldet er Manipulation, wo nur die Zeitzone anders war.
create or replace function public._audit_entry_fingerprint(
  p_id uuid,
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_field_name text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_actor_user_id uuid,
  p_changed_at timestamptz,
  p_change_reason text,
  p_causation_id uuid
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  -- jsonb kanonisiert (Schlüssel sortiert, Werte escaped) und braucht deshalb GAR
  -- KEIN Trennzeichen. Eine Verkettung mit Trenner wäre angreifbar, sobald ein
  -- Freitext den Trenner enthält: eine Änderung an einer Stelle ließe sich durch
  -- eine an anderer ausgleichen. `changed_at` wird als UTC-Text festgeschrieben,
  -- damit eine Prüfung in anderer Sitzungs-Zeitzone denselben Wert ergibt.
  select encode(sha256(convert_to(jsonb_build_object(
    'v', 1,
    'id', p_id,
    'tenant_id', p_tenant_id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'field_name', p_field_name,
    'old_value', p_old_value,
    'new_value', p_new_value,
    'actor_user_id', p_actor_user_id,
    'changed_at', to_char(p_changed_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
    'change_reason', p_change_reason,
    'causation_id', p_causation_id
  )::text, 'utf8')), 'hex');
$fn$;

comment on function public._audit_entry_fingerprint is
  'PROJ-130-ε: Fingerabdruck EINER Audit-Zeile über eine feste Feldliste (digest_version 1). Änderungen an dieser Liste erfordern eine neue digest_version, sonst wird die Historie unverifizierbar.';

-- Der Ketten-Prüfwert existiert genau EINMAL. Rechneten Siegeln und Prüfen ihn
-- getrennt nach, wäre eine stille Abweichung zwischen beiden nicht von einer
-- Manipulation zu unterscheiden: der Verifikationslauf meldete Fälschung, wo nur
-- zwei Formeln auseinandergelaufen sind.
create or replace function public._audit_chain_digest(
  p_prev_digest text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_entry_count integer,
  p_entries_digest text,
  p_digest_version smallint
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select encode(sha256(convert_to(jsonb_build_object(
    'prev', p_prev_digest,
    'from', to_char(p_window_start at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
    'to', to_char(p_window_end at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'),
    'n', p_entry_count,
    'entries', p_entries_digest,
    'v', p_digest_version
  )::text, 'utf8')), 'hex');
$fn$;

revoke all on function public._audit_chain_digest(text, timestamptz, timestamptz, integer, text, smallint) from public, anon, authenticated;


-- Prüfwert eines Fensters. SECURITY DEFINER, weil die Verifikation ALLE Zeilen
-- sehen muss: unter dem Need-to-know-Tor aus γ1 blieben `strict`-Einträge
-- verborgen, der Nachrechner käme auf einen anderen Prüfwert und meldete
-- Manipulation, wo nur eine Freigabe fehlt. Die Funktion gibt ausschließlich
-- Anzahl und Prüfwert zurück, nie Inhalte — sie ist damit kein Umweg um γ1.
create or replace function public._audit_window_digest(
  p_tenant_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  out entry_count integer,
  out entries_digest text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    count(*)::int,
    coalesce(
      encode(sha256(convert_to(string_agg(fp, '' order by ord_changed_at, ord_id), 'utf8')), 'hex'),
      repeat('0', 64)
    )
  from (
    select
      e.changed_at as ord_changed_at,
      e.id as ord_id,
      public._audit_entry_fingerprint(
        e.id, e.tenant_id, e.entity_type, e.entity_id, e.field_name,
        e.old_value, e.new_value, e.actor_user_id, e.changed_at,
        e.change_reason, e.causation_id
      ) as fp
    from public.audit_log_entries e
    where e.tenant_id = p_tenant_id
      and e.changed_at >= p_window_start
      and e.changed_at < p_window_end
  ) s;
$fn$;

revoke all on function public._audit_window_digest(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- =====================================================================
-- 3. Siegeln (Cron)
-- =====================================================================
-- Siegelt je Mandant alle noch offenen, vollständig abgeschlossenen Tage bis zur
-- Sicherheitsmarge. Idempotent: ein zweiter Lauf im selben Zeitraum siegelt nichts.
-- Leere Tage werden AUSDRÜCKLICH mitgesiegelt — sonst könnte man eine Zeile
-- nachträglich in einen ungesiegelten Tag zurückdatieren und niemand merkte es.
create or replace function public.seal_audit_chain(
  p_margin interval default interval '2 hours',
  p_max_windows integer default 4000
)
returns table (tenant_id uuid, sealed_windows integer, last_window_start timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cutoff timestamptz := date_trunc('day', (now() - p_margin) at time zone 'UTC') at time zone 'UTC';
  v_tenant uuid;
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
    select distinct e.tenant_id from public.audit_log_entries e
  loop
    v_sealed := 0;
    v_last := null;

    select a.chain_digest, a.window_start into v_prev, v_last
      from public.audit_chain_anchors a
     where a.tenant_id = v_tenant
     order by a.window_start desc
     limit 1;

    if v_prev is null then
      -- Kette beginnt beim ersten Eintrag des Mandanten; der Vorgänger-Prüfwert
      -- der Wurzel ist eine Konstante (kein Vorgänger vorhanden).
      v_prev := repeat('0', 64);
      select date_trunc('day', min(e.changed_at) at time zone 'UTC') at time zone 'UTC'
        into v_day
        from public.audit_log_entries e where e.tenant_id = v_tenant;
    else
      v_day := v_last + interval '1 day';
    end if;

    while v_day is not null and v_day < v_cutoff loop
      v_guard := v_guard + 1;
      exit when v_guard > p_max_windows;

      select d.entry_count, d.entries_digest into v_count, v_digest
        from public._audit_window_digest(v_tenant, v_day, v_day + interval '1 day') d;

      v_chain := public._audit_chain_digest(
        v_prev, v_day, v_day + interval '1 day', v_count, v_digest, 1::smallint);

      insert into public.audit_chain_anchors
        (tenant_id, window_start, window_end, entry_count, entries_digest, prev_digest, chain_digest)
      values
        (v_tenant, v_day, v_day + interval '1 day', v_count, v_digest, v_prev, v_chain)
      on conflict (tenant_id, window_start) do nothing;

      v_prev := v_chain;
      v_last := v_day;
      v_sealed := v_sealed + 1;
      v_day := v_day + interval '1 day';
    end loop;

    if v_sealed > 0 then
      tenant_id := v_tenant;
      sealed_windows := v_sealed;
      last_window_start := v_last;
      return next;
    end if;
  end loop;
end;
$fn$;

-- Nur der Cron (service_role) siegelt. Kein Anwendungsnutzer, auch kein Admin:
-- wer siegeln kann, kann den Zeitpunkt der Siegelung wählen.
revoke all on function public.seal_audit_chain(interval, integer) from public, anon, authenticated;
grant execute on function public.seal_audit_chain(interval, integer) to postgres, service_role;

comment on function public.seal_audit_chain is
  'PROJ-130-ε: siegelt abgeschlossene Tagesfenster je Mandant zu Prüfwert-Ankern. Idempotent, siegelt auch leere Tage (sonst wäre Zurückdatieren in ungesiegelte Tage unentdeckbar). Nur service_role.';

-- =====================================================================
-- 4. Verifikation
-- =====================================================================
-- Rechnet jeden Anker nach und prüft beides: den Prüfwert des Fensters
-- (Inhalt unverändert?) UND die Verkettung zum Vorgänger (Anker unverändert?).
-- Gibt NUR Zahlen und Urteile zurück, keine Inhalte.
create or replace function public.verify_audit_chain(p_tenant_id uuid)
returns table (
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
  v_prev text := repeat('0', 64);
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
     order by audit_chain_anchors.window_start
  loop
    select d.entry_count, d.entries_digest into v_count, v_digest
      from public._audit_window_digest(p_tenant_id, a.window_start, a.window_end) d;

    v_chain := public._audit_chain_digest(
      a.prev_digest, a.window_start, a.window_end, a.entry_count,
      a.entries_digest, a.digest_version);

    window_start := a.window_start;
    entry_count_sealed := a.entry_count;
    entry_count_now := v_count;
    digest_ok := (v_digest = a.entries_digest and v_count = a.entry_count);
    -- Der Anker selbst ist unversehrt, wenn sein eigener Prüfwert stimmt UND er
    -- am Vorgänger hängt. Beides zusammen macht das Nachziehen einer Fälschung
    -- über die ganze Kette nötig statt an einer Stelle.
    link_ok := (v_chain = a.chain_digest and a.prev_digest = v_prev);
    v_prev := a.chain_digest;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.verify_audit_chain(uuid) from public, anon;
grant execute on function public.verify_audit_chain(uuid) to authenticated, service_role, postgres;

comment on function public.verify_audit_chain is
  'PROJ-130-ε: rechnet die Prüfwert-Kette eines Mandanten nach. SECURITY DEFINER, weil die Prüfung ALLE Zeilen sehen muss — unter dem γ1-Tor käme sie auf einen anderen Prüfwert und meldete Manipulation, wo nur eine Freigabe fehlt. Gibt nur Zahlen und Urteile zurück, nie Inhalte. Gate: Mandanten-Admin oder Revisions-Freigabe.';

-- =====================================================================
-- 5. Post-Conditions
-- =====================================================================
do $do$
declare
  v int;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='audit_chain_anchors' and c.relrowsecurity
  ) then
    raise exception 'PROJ-130-ε: RLS auf audit_chain_anchors nicht aktiv';
  end if;

  select count(*) into v from pg_policies
   where schemaname='public' and tablename='audit_chain_anchors' and cmd <> 'SELECT';
  if v <> 0 then
    raise exception 'PROJ-130-ε: % schreibende Policy(s) auf audit_chain_anchors', v;
  end if;

  select count(*) into v from pg_trigger
   where tgrelid='public.audit_chain_anchors'::regclass and not tgisinternal;
  if v <> 3 then
    raise exception 'PROJ-130-ε: Anker-Wächter unvollständig (%/3)', v;
  end if;

  select count(*) into v from pg_constraint
   where conrelid='public.audit_chain_anchors'::regclass and contype='f';
  if v <> 0 then
    raise exception 'PROJ-130-ε: % Fremdschlüssel auf audit_chain_anchors — der Nachweis würde mitgelöscht', v;
  end if;

  -- Siegeln darf kein Anwendungsnutzer
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='seal_audit_chain'
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'PROJ-130-ε: seal_audit_chain ist für Anwendungsnutzer aufrufbar';
  end if;

  -- α-Zusagen halten
  select count(*) into v from pg_trigger
   where tgrelid='public.audit_log_entries'::regclass and not tgisinternal;
  if v <> 3 then
    raise exception 'PROJ-130-ε: α-Guard-Trigger beschädigt (%/3)', v;
  end if;

  raise notice 'PROJ-130-ε: Post-Conditions erfüllt';
end $do$;
