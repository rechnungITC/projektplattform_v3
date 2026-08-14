-- PROJ-Y-146c — Schreibwächter für tenants.audit_lifecycle_exempt
--
-- Befund (live gemessen 2026-08-13): das Flag schaltet die Anlage-/Löschprotokollierung
-- (record_audit_lifecycle, PROJ-130-β) für einen Mandanten ab, war aber an keine Bedingung
-- gebunden. `tenants_update_admin` gewährt `is_tenant_admin(id)` ein Zeilen-UPDATE, und RLS
-- kann nicht auf Spalten einschränken — ein Tenant-Admin konnte die Protokollierung seines
-- EIGENEN Mandanten abschalten (in einer zurückgerollten Prod-Probe mit 1 geänderter Zeile
-- nachgewiesen). Dass unsere Oberfläche die Spalte nicht anbietet, schützt nicht: der Browser
-- trägt den anon-Key, ein Admin kann mit seinem eigenen JWT direkt gegen die REST-API gehen.
--
-- Verworfene Alternativen, jeweils mit Grund (damit sie nicht erneut vorgeschlagen werden):
--   * CHECK gegen das '[E2E]'-Namenspräfix — wirkungslos: derselbe Admin darf `tenants.name`
--     schreiben (src/app/api/tenants/[id]/route.ts), also umbenennen → Flag setzen → zurück.
--   * Spalten-Grant chirurgisch entziehen — erzwingt `revoke update on tenants` plus einen
--     aufzählenden `grant update (<alle übrigen Spalten>)`. Jede künftige Spalte wäre für
--     `authenticated` still nicht mehr schreibbar. Genau die Registerdrift, gegen die PROJ-130
--     angetreten ist.
--   * Allowlist-Tabelle — zweite Wahrheitsquelle bei gleichem Effekt wie dieser Wächter.
--
-- Gewählt: die Frage lautet nicht "WELCHE Mandanten dürfen ausgenommen sein", sondern
-- "WER darf es entscheiden". Rollen-gebunden, fail-closed.
--
-- Gemessene Grundlage der Rollenerkennung (zurückgerollte Prod-Probe, 2026-08-13):
--   direkter Zugang (MCP/psql) → current_user = 'postgres'
--   PostgREST eingeloggt      → current_user = 'authenticated'
--   Service-Role              → current_user = 'service_role'
--   anon                      → current_user = 'anon'
-- `session_user` ist auf allen vier Wegen 'postgres' und daher untauglich. `auth.role()` ist
-- auf dem direkten Weg NULL und hängt an den JWT-Claims — `current_user` ist die Postgres-Ebene
-- und der robustere Diskriminator. `authenticated` ist in KEINER Rollenmitgliedschaft von
-- `service_role`/`postgres` (gemessen), ein SET-ROLE-Aufstieg ist also ausgeschlossen.

-- WICHTIG: SECURITY INVOKER (Default, hier bewusst nicht überschrieben).
-- Unter SECURITY DEFINER wäre `current_user` der Funktionseigentümer (postgres) — die Prüfung
-- würde IMMER durchlassen und der Wächter wäre eine wirkungslose Attrappe.
create or replace function public.enforce_audit_exempt_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Nur die gefährliche Richtung ist privilegiert: Protokollierung ABschalten.
  -- Das Wiedereinschalten (true -> false) bleibt jedem Tenant-Admin erlaubt — es ist die
  -- sichere Richtung, und ein versehentlich gesetztes Flag muss ohne Service-Role zurücknehmbar
  -- sein (sonst wäre der Wächter selbst eine Sackgasse).
  if not coalesce(new.audit_lifecycle_exempt, false) then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.audit_lifecycle_exempt, false) then
    return new;  -- war schon an, keine Zustandsänderung
  end if;

  -- Fail-closed: erlaubt ist eine benannte Menge, nicht "alles außer".
  -- Eine künftige, unbekannte Rolle wird laut abgewiesen statt still durchgelassen.
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception
      using errcode = '42501',
            message = 'tenants.audit_lifecycle_exempt darf nicht über die Anwendungsrolle gesetzt werden',
            detail  = format(
              'Rolle %L ist nicht berechtigt, die Anlage-/Loeschprotokollierung fuer Mandant %s abzuschalten.',
              current_user, new.id),
            hint    = 'Wegwerf-Fixtures in Produktion laufen ueber die Service-Role: siehe docs/production/prod-test-fixtures.md.';
  end if;

  return new;
end $$;

comment on function public.enforce_audit_exempt_write() is
  'PROJ-Y-146c: laesst das Abschalten der Anlage-/Loeschprotokollierung (tenants.audit_lifecycle_exempt = true) nur fuer service_role/postgres/supabase_admin zu; das Wiedereinschalten bleibt frei. MUSS SECURITY INVOKER bleiben — unter DEFINER waere current_user der Eigentuemer und die Pruefung wirkungslos.';

-- Supabase gewährt neuen Funktionen per Default EXECUTE an authenticated (PROJ-Y-115c-Lehre).
-- Trigger-Funktionen werden intern aufgerufen; der Entzug nimmt nur den direkten Aufruf weg
-- und lässt das Feuern des Triggers unberührt (in PROJ-Y-115c 5/5 nachgemessen).
revoke all on function public.enforce_audit_exempt_write() from public;
revoke all on function public.enforce_audit_exempt_write() from anon;
revoke all on function public.enforce_audit_exempt_write() from authenticated;

-- UPDATE: feuert dank WHEN-Klausel nur, wenn sich genau diese Spalte ändert. Die fünf Felder
-- der PROJ-17-Einstellungsfläche (name, domain, language, branding, holiday_region) lösen den
-- Trigger damit gar nicht erst aus.
drop trigger if exists tenants_audit_exempt_write_guard on public.tenants;
create trigger tenants_audit_exempt_write_guard
  before update on public.tenants
  for each row
  when (old.audit_lifecycle_exempt is distinct from new.audit_lifecycle_exempt)
  execute function public.enforce_audit_exempt_write();

-- INSERT: heute theoretisch (auf `tenants` existiert keine INSERT-Policy, `authenticated`
-- kann gar keinen Mandanten anlegen), aber sonst bliebe "Mandant gleich ausgenommen anlegen"
-- als Umweg offen, falls je eine INSERT-Policy dazukommt. Anlagen mit exempt = false feuern
-- wegen der WHEN-Klausel nicht.
drop trigger if exists tenants_audit_exempt_insert_guard on public.tenants;
create trigger tenants_audit_exempt_insert_guard
  before insert on public.tenants
  for each row
  when (new.audit_lifecycle_exempt)
  execute function public.enforce_audit_exempt_write();

-- Post-Conditions: laut scheitern statt still danebenliegen.
do $$
declare v_prosecdef boolean; v_triggers int; v_auth_exec boolean;
begin
  select p.prosecdef into v_prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_audit_exempt_write';

  if v_prosecdef is null then
    raise exception 'PROJ-Y-146c: Wächterfunktion wurde nicht angelegt';
  end if;

  -- Die wichtigste Zusicherung der ganzen Migration.
  if v_prosecdef then
    raise exception 'PROJ-Y-146c: Wächterfunktion ist SECURITY DEFINER — current_user waere der Eigentuemer und die Pruefung wirkungslos';
  end if;

  select count(*) into v_triggers
    from pg_trigger
   where tgrelid = 'public.tenants'::regclass
     and not tgisinternal
     and tgname in ('tenants_audit_exempt_write_guard', 'tenants_audit_exempt_insert_guard');

  if v_triggers <> 2 then
    raise exception 'PROJ-Y-146c: erwartet 2 Wächter-Trigger auf tenants, gefunden %', v_triggers;
  end if;

  select has_function_privilege('authenticated', 'public.enforce_audit_exempt_write()', 'execute')
    into v_auth_exec;
  if v_auth_exec then
    raise exception 'PROJ-Y-146c: authenticated haelt weiterhin EXECUTE auf der Waechterfunktion';
  end if;

  raise notice 'PROJ-Y-146c: Wächter aktiv (SECURITY INVOKER, 2 Trigger, kein authenticated-EXECUTE)';
end $$;
