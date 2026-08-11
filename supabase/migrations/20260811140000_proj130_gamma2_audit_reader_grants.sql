-- PROJ-130-γ2 — Revisions-Leseberechtigung: „Auditor" und befristeter externer Prüfer.
--
-- Tech Design: features/PROJ-130-lueckenloser-audit-trail-cross-cutting.md
-- Baut auf α (20260811093000), β (20260811104500), γ1 (20260811120000).
--
-- WARUM KEINE VIERTE MANDANTEN-ROLLE
-- `tenant_memberships.role` ist die Achse hinter `is_tenant_member` und
-- `has_tenant_role` und damit hinter praktisch jeder Zugriffsregel im Produkt.
-- Ein vierter Wert 'auditor' würde den Revisor automatisch zum Mandanten-
-- Mitglied machen — er bekäme überall dort Lesezugriff, wo nur Mitgliedschaft
-- geprüft wird. Das ist das Gegenteil einer rein lesenden Revision, und der
-- Blast-Radius wäre global statt modul-lokal. Stattdessen eine eigene
-- Freigabe-Tabelle plus EIN zusätzlicher Zweig im Audit-Lesetor.
--
-- Muster: `ma_confidentiality_clearances` (PROJ-100a) — genau eine SELECT-Policy,
-- keine schreibenden Policies, alle Writes über SECURITY-DEFINER-RPCs, und ein
-- nullbares `valid_until` als Befristung. Das ist im Produkt die einzige
-- Freigabe, deren Zeitfenster vom Tor selbst konsultiert wird; der externe
-- Prüfer braucht damit KEIN neues Token-Verfahren.
--
-- WICHTIG: die Freigabe hebt das Need-to-know-Tor aus γ1 NICHT auf. Ein Auditor
-- ohne Vertraulichkeits-Freischaltung sieht `strict`-Einträge weiterhin nicht.
-- Die Freigabe ersetzt die PROJEKT-MITGLIEDSCHAFT, nicht die Klassifikation.

-- =====================================================================
-- 1. Die Freigabe-Tabelle
-- =====================================================================
create table if not exists public.audit_reader_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Vorerst nur mandantenweit. Der CHECK dokumentiert die Absicht und macht
  -- eine spätere Projekt-Einschränkung zu einer bewussten Migration.
  scope text not null default 'tenant',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  note text,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  constraint audit_reader_grants_scope_check check (scope = 'tenant'),
  constraint audit_reader_grants_window_check check (valid_until is null or valid_until > valid_from),
  constraint audit_reader_grants_note_length check (note is null or char_length(note) <= 500)
);

create unique index if not exists audit_reader_grants_tenant_user_uniq
  on public.audit_reader_grants (tenant_id, user_id);
create index if not exists audit_reader_grants_lookup_idx
  on public.audit_reader_grants (user_id, tenant_id, valid_until);

alter table public.audit_reader_grants enable row level security;

-- Genau eine Policy, wie bei ma_confidentiality_clearances: Admins verwalten,
-- der Freigegebene darf seine eigene Freigabe sehen (sonst wüsste er nicht, bis
-- wann sein Prüfzugang läuft). Keine schreibenden Policies -> Writes nur per RPC.
drop policy if exists audit_reader_grants_select on public.audit_reader_grants;
create policy audit_reader_grants_select on public.audit_reader_grants
  for select using (
    public.is_tenant_admin(tenant_id) or user_id = (select auth.uid())
  );

comment on table public.audit_reader_grants is
  'PROJ-130-γ2: mandantenweite, rein lesende Revisions-Freigabe auf den Audit-Trail. Ersetzt die Projekt-Mitgliedschaft im Audit-Lesetor, NICHT die Vertraulichkeits-Prüfung aus γ1. valid_until = Befristung für externe Prüfer. Bewusst keine vierte tenant_memberships.role — die würde den Auditor produktweit zum Mitglied machen.';

-- =====================================================================
-- 2. Das Zeitfenster-Helper
-- =====================================================================
create or replace function public.has_audit_reader_grant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.audit_reader_grants g
     where g.tenant_id = p_tenant_id
       and g.user_id = auth.uid()
       and g.valid_from <= now()
       and (g.valid_until is null or g.valid_until > now())
  )
$fn$;

revoke all on function public.has_audit_reader_grant(uuid) from public;
revoke all on function public.has_audit_reader_grant(uuid) from anon;
grant execute on function public.has_audit_reader_grant(uuid) to postgres, service_role, authenticated;

comment on function public.has_audit_reader_grant(uuid) is
  'PROJ-130-γ2: prüft eine gültige, unbefristete oder noch laufende Revisions-Freigabe für den aufrufenden Nutzer. Liest auth.uid() intern — kein Actor-Parameter.';

-- =====================================================================
-- 3. Vergeben und widerrufen — nur über RPC, nur durch Mandanten-Admins
-- =====================================================================
create or replace function public.grant_audit_reader(
  p_tenant_id uuid,
  p_user_id uuid,
  p_valid_until timestamptz default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'PROJ-130-γ2: nur Mandanten-Admins dürfen Revisions-Freigaben vergeben'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'PROJ-130-γ2: user_id fehlt' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'PROJ-130-γ2: unbekannter Nutzer' using errcode = '23503';
  end if;

  if p_valid_until is not null and p_valid_until <= now() then
    raise exception 'PROJ-130-γ2: Befristung liegt in der Vergangenheit' using errcode = '22023';
  end if;

  insert into public.audit_reader_grants (tenant_id, user_id, valid_until, note, granted_by)
  values (p_tenant_id, p_user_id, p_valid_until, p_note, v_actor)
  on conflict (tenant_id, user_id) do update
    set valid_from  = now(),
        valid_until = excluded.valid_until,
        note        = excluded.note,
        granted_by  = excluded.granted_by,
        granted_at  = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

create or replace function public.revoke_audit_reader(
  p_tenant_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'PROJ-130-γ2: nur Mandanten-Admins dürfen Revisions-Freigaben widerrufen'
      using errcode = '42501';
  end if;

  delete from public.audit_reader_grants
   where tenant_id = p_tenant_id and user_id = p_user_id;

  return found;
end;
$fn$;

revoke all on function public.grant_audit_reader(uuid, uuid, timestamptz, text) from public;
revoke all on function public.grant_audit_reader(uuid, uuid, timestamptz, text) from anon;
grant execute on function public.grant_audit_reader(uuid, uuid, timestamptz, text) to postgres, service_role, authenticated;

revoke all on function public.revoke_audit_reader(uuid, uuid) from public;
revoke all on function public.revoke_audit_reader(uuid, uuid) from anon;
grant execute on function public.revoke_audit_reader(uuid, uuid) to postgres, service_role, authenticated;

-- =====================================================================
-- 4. Die Freigabe selbst ist auditpflichtig
-- =====================================================================
-- Wer wem Einsicht in den Audit-Trail gibt, ist selbst ein Governance-Ereignis.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conname = 'audit_log_entity_type_check'
    and conrelid = 'public.audit_log_entries'::regclass;

  if v_def is null then
    raise exception 'PROJ-130-γ2: audit_log_entity_type_check nicht gefunden — Abbruch statt Raten';
  end if;

  if position('''audit_reader_grants''' in v_def) > 0 then
    raise notice 'PROJ-130-γ2: entity_type-CHECK enthält audit_reader_grants bereits — übersprungen';
  else
    v_new := regexp_replace(v_def, '\]\s*\)\s*\)\s*\)\s*$', ', ''audit_reader_grants''::text])))');
    if position('''audit_reader_grants''' in v_new) = 0 then
      raise exception 'PROJ-130-γ2: Anker-Ersetzung am entity_type-CHECK fehlgeschlagen';
    end if;
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
  end if;
end $$;

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = '_tracked_audit_columns' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-γ2: _tracked_audit_columns nicht gefunden — Abbruch statt Raten';
  end if;

  if position('when ''audit_reader_grants'' then' in v_def) > 0 then
    raise notice 'PROJ-130-γ2: Whitelist-Zweig existiert bereits — übersprungen';
    return;
  end if;

  -- Identitätsspalten (tenant_id/user_id) bewusst nicht getrackt: sie ändern
  -- sich nicht, ihre Anlage/Löschung deckt der Lifecycle-Trigger aus β ab.
  v_new := regexp_replace(
    v_def,
    'else\s+array\[\]\s*::\s*text\s*\[\]',
    'when ''audit_reader_grants'' then array[''valid_from'',''valid_until'',''note''] else array[]::text[]'
  );

  if position('when ''audit_reader_grants'' then' in v_new) = 0 then
    raise exception 'PROJ-130-γ2: Anker-Ersetzung an _tracked_audit_columns fehlgeschlagen';
  end if;

  execute v_new;
end $$;

grant execute on function public._tracked_audit_columns(text) to postgres, service_role, authenticated;

drop trigger if exists audit_changes_audit_reader_grants on public.audit_reader_grants;
create trigger audit_changes_audit_reader_grants
  after update on public.audit_reader_grants
  for each row execute function public.record_audit_changes();

drop trigger if exists audit_lifecycle_audit_reader_grants on public.audit_reader_grants;
create trigger audit_lifecycle_audit_reader_grants
  after insert or delete on public.audit_reader_grants
  for each row execute function public.record_audit_lifecycle();

-- =====================================================================
-- 5. Das Audit-Lesetor kennt die Freigabe
-- =====================================================================
-- Genau EIN Anker: die Zeile, die γ1 eingefügt hat. Die Freigabe ersetzt die
-- Projekt-Mitgliedschaft — die Klassifikations-Prüfung dahinter bleibt
-- unverändert wirksam, ein Auditor ohne Freischaltung sieht `strict` nicht.
do $$
declare
  v_def text;
  v_new text;
  v_hits int;
  v_branches_before int;
  v_branches_after int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'PROJ-130-γ2: can_read_audit_entry nicht gefunden — Abbruch statt Raten';
  end if;

  if position('has_audit_reader_grant' in v_def) > 0 then
    raise notice 'PROJ-130-γ2: Lesetor kennt die Freigabe bereits — übersprungen';
    return;
  end if;

  if position('_audit_entry_classified_ok' in v_def) = 0 then
    raise exception 'PROJ-130-γ2: γ1 fehlt im Lesetor — Reihenfolge verletzt, Abbruch';
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, 'when ''', ''))) / length('when ''');

  select count(*) into v_hits
  from regexp_matches(
    v_def,
    'if\s+not\s+public\.is_project_member\(v_project\)\s+then\s+return\s+false;\s*end\s+if;',
    'g'
  );

  if v_hits <> 1 then
    raise exception 'PROJ-130-γ2: Anker nicht eindeutig (% Treffer) — Abbruch statt Raten', v_hits;
  end if;

  v_new := regexp_replace(
    v_def,
    'if\s+not\s+public\.is_project_member\(v_project\)\s+then\s+return\s+false;\s*end\s+if;',
    'if not (public.is_project_member(v_project) or public.has_audit_reader_grant(p_tenant_id)) then return false; end if;'
  );

  if position('has_audit_reader_grant' in v_new) = 0 then
    raise exception 'PROJ-130-γ2: Anker-Ersetzung am Lesetor fehlgeschlagen';
  end if;

  v_branches_after := (length(v_new) - length(replace(v_new, 'when ''', ''))) / length('when ''');
  if v_branches_after <> v_branches_before then
    raise exception 'PROJ-130-γ2: Zweig-Zahl verändert (vorher %, nachher %)', v_branches_before, v_branches_after;
  end if;

  execute v_new;
  raise notice 'PROJ-130-γ2: Lesetor erweitert, % Zweige unverändert', v_branches_after;
end $$;

revoke all on function public.can_read_audit_entry(text, uuid, uuid) from public;
revoke all on function public.can_read_audit_entry(text, uuid, uuid) from anon;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to postgres, service_role, authenticated;

-- =====================================================================
-- 6. Post-Conditions
-- =====================================================================
do $$
declare
  v_count int;
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'can_read_audit_entry' and pronamespace = 'public'::regnamespace;

  if position('has_audit_reader_grant' in v_def) = 0 then
    raise exception 'PROJ-130-γ2: Lesetor kennt die Freigabe nicht';
  end if;

  -- γ1 muss unangetastet dahinter stehen: die Freigabe ersetzt die
  -- Mitgliedschaft, nicht die Klassifikations-Prüfung.
  if position('_audit_entry_classified_ok' in v_def) = 0 then
    raise exception 'PROJ-130-γ2: γ1-Klassifikations-Prüfung aus dem Lesetor verschwunden';
  end if;

  -- Keine schreibende Policy auf der Freigabe-Tabelle (Writes nur per RPC)
  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'audit_reader_grants' and cmd <> 'SELECT';
  if v_count <> 0 then
    raise exception 'PROJ-130-γ2: % schreibende Policy(s) auf audit_reader_grants', v_count;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'audit_reader_grants' and c.relrowsecurity
  ) then
    raise exception 'PROJ-130-γ2: RLS auf audit_reader_grants nicht aktiv';
  end if;

  -- Die Freigabe ist selbst auditiert
  if coalesce(array_length(public._tracked_audit_columns('audit_reader_grants'), 1), 0) = 0 then
    raise exception 'PROJ-130-γ2: audit_reader_grants nicht in der Audit-Whitelist';
  end if;

  select count(*) into v_count from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'audit_reader_grants' and not tg.tgisinternal;
  if v_count < 2 then
    raise exception 'PROJ-130-γ2: Audit-Trigger auf audit_reader_grants fehlen (%/2)', v_count;
  end if;

  -- anon darf nichts
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name in ('grant_audit_reader', 'revoke_audit_reader', 'has_audit_reader_grant')
      and grantee = 'anon'
  ) then
    raise exception 'PROJ-130-γ2: anon hat EXECUTE auf einer der neuen Funktionen';
  end if;

  -- α-Zusagen halten
  select count(*) into v_count from pg_trigger
   where tgrelid = 'public.audit_log_entries'::regclass and not tgisinternal;
  if v_count <> 3 then
    raise exception 'PROJ-130-γ2: α-Guard-Trigger beschädigt (%/3)', v_count;
  end if;

  raise notice 'PROJ-130-γ2: Post-Conditions erfüllt';
end $$;
