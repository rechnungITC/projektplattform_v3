-- PROJ-Y-45p — Der Speicherplatz-Zähler kann jetzt auch fallen.
--
-- Befund (PROJ-79-α, verschärft durch PROJ-45-ε): `_dms_bump_storage_usage`
-- addiert bei jedem `documents`-INSERT, und im ganzen Repo existierte **kein**
-- Dekrement und **kein** Neuberechnungspfad. Live gemessen vor dieser Migration:
-- `[E2E] Projektplattform Test` behauptete 1.176 Byte, `[E2E] Bau Test` 1.344 —
-- bei **null** Dokumentzeilen.
--
-- Vier Messungen haben den Zuschnitt bestimmt, und zwei davon widersprechen der
-- naheliegenden Lesart:
--
-- 1. **Es gibt keinen Hart-Lösch-Pfad in der Anwendung.** `documents` wird
--    ausschliesslich soft-gelöscht (`dms_soft_delete_subtree`); ein `delete` auf
--    die Tabelle kommt heute nur über die Dienst-Rolle vor (Test-Teardown). Ein
--    Dekrement-Trigger ist trotzdem richtig — er macht genau diesen Pfad und
--    jeden künftigen Aufräumlauf konsistent —, aber er behebt für sich allein
--    noch nichts, was ein Nutzer auslöst.
--
-- 2. **Es gibt keinen Aufräumlauf für DMS-Dokumente** (die sechs Vercel-Crons
--    betreffen anderes) und keinen Weg, ein gespeichertes Objekt nutzerseitig zu
--    entfernen: `deleteDocumentFile` wird nur im Rollback nach fehlgeschlagenem
--    Insert gerufen. Soft-gelöschte Dokumente behalten ihre Bytes also
--    **dauerhaft** im Bucket.
--
--    Daraus folgt die Semantik-Entscheidung, die das Followup ausdrücklich offen
--    liess: **soft-gelöschte Dokumente zählen weiter gegen das Kontingent.**
--    Sie auszunehmen wäre keine Kulanz, sondern ein unbegrenztes Speicherloch —
--    hochladen, löschen, wieder hochladen, und die Bytes bleiben alle liegen.
--    Der Zähler bleibt beim Soft-Delete deshalb absichtlich unverändert; das
--    entspricht dem heutigen Verhalten und ist jetzt begründet statt zufällig.
--
-- 3. **`last_recomputed_at` hat null Konsumenten** (`src/` und alle anderen
--    Migrationen durchsucht) und wurde vom Bump bei jedem Upload gesetzt — die
--    Spalte versprach eine Neuberechnung, die es nicht gab. Ab hier schreibt sie
--    **nur** `recompute_tenant_storage_usage`, womit "nie neu berechnet" ein
--    echtes Signal wird.
--
-- 4. **Der Bucket hält Bytes ohne Zeile.** Gemessen: 9 Objekte / 21.867 Byte
--    unter dem Präfix von `[E2E] Bau Test`, während `documents` dort 0 Zeilen
--    hat. Diese Waisen sind **nicht** Gegenstand dieser Migration: der Zähler
--    spiegelt bewusst die Sicht der Anwendung (was der Mandant im DMS besitzt
--    und wiederherstellen kann), nicht den physischen Bucket-Inhalt. Einem
--    Mandanten Bytes zu berechnen, die ihm keine Oberfläche zeigt und die er
--    nicht freigeben kann, wäre falsch. Der Waisen-Sweep bleibt PROJ-Y-115c-3.

-- ---------------------------------------------------------------------------
-- 1. Bump: unverändert in der Zählung, ohne die irreführende Zeitstempel-Zeile.
-- ---------------------------------------------------------------------------
create or replace function public._dms_bump_storage_usage()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.storage_backend = 'internal' and new.deleted_at is null then
    insert into public.tenant_storage_quotas as q
      (tenant_id, current_usage_bytes)
    values (new.tenant_id, new.size_bytes)
    on conflict (tenant_id) do update
      set current_usage_bytes = q.current_usage_bytes + new.size_bytes;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Freigabe beim Hart-Löschen und Delta bei geänderter Grösse.
-- ---------------------------------------------------------------------------
-- Die Bedingung spiegelt den Bump NICHT wörtlich: der Bump prüft
-- `deleted_at is null`, hier wäre das falsch. Eine Zeile wird lebend gezählt,
-- überlebt den Soft-Delete im Zähler (Entscheidung 2) und muss beim Hart-Löschen
-- deshalb **immer** abgezogen werden — sonst bliebe genau der Fall stehen, der
-- den Befund erzeugt hat. Der einzige Gegenfall ist eine Zeile, die bereits
-- soft-gelöscht eingefügt wurde (nie gezählt, kein Pfad in der Anwendung tut
-- das); dagegen schützt die Untergrenze.
create or replace function public._dms_release_storage_usage()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_delta bigint;
begin
  if tg_op = 'DELETE' then
    if old.storage_backend <> 'internal' then
      return old;
    end if;
    v_delta := -old.size_bytes;
  else
    -- UPDATE OF size_bytes: heute ändert kein Pfad die Grösse einer Zeile
    -- (Versionen sind neue Zeilen, PROJ-106). Das Delta schliesst die latente
    -- Lücke, bevor sie jemand aufreisst.
    if new.storage_backend <> 'internal' or old.storage_backend <> 'internal' then
      return new;
    end if;
    v_delta := new.size_bytes - old.size_bytes;
  end if;

  if v_delta = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Untergrenze 0: die vorhandene Abweichung geht nach OBEN, ein Abzug für eine
  -- nie gezählte Zeile darf den Zähler nicht unter null drücken. Ein negativer
  -- Verbrauch wäre schlimmer als ein zu hoher — er sieht wie freier Platz aus.
  update public.tenant_storage_quotas
     set current_usage_bytes = greatest(current_usage_bytes + v_delta, 0)
   where tenant_id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists documents_release_storage_usage on public.documents;
create trigger documents_release_storage_usage
  after delete on public.documents
  for each row execute function public._dms_release_storage_usage();

drop trigger if exists documents_adjust_storage_usage on public.documents;
create trigger documents_adjust_storage_usage
  after update of size_bytes on public.documents
  for each row execute function public._dms_release_storage_usage();

-- ---------------------------------------------------------------------------
-- 3. Neuberechnung für den Bestand.
-- ---------------------------------------------------------------------------
-- Bewusst **ohne** Client-Fläche: `anon` und `authenticated` bekommen kein
-- EXECUTE. Die Reparatur ist eine Wartungshandlung über den Runbook-Weg
-- (Dienst-Rolle), kein Knopf im Produkt — eine `SECURITY DEFINER`-Funktion mit
-- Client-Recht, die niemand aufruft, wäre nur zusätzliche Angriffsfläche
-- (Muster: PROJ-130-ε, wo das Siegeln aus demselben Grund service_role-only ist).
-- Deshalb trägt sie auch keine `auth.uid()`-Rollenprüfung: sie ist für Clients
-- strukturell unerreichbar, und eine Prüfung, die nie greift, gibt falsche
-- Sicherheit.
create or replace function public.recompute_tenant_storage_usage(p_tenant_id uuid)
returns table (previous_bytes bigint, recomputed_bytes bigint, delta_bytes bigint)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_before bigint;
  v_actual bigint;
begin
  select current_usage_bytes into v_before
    from public.tenant_storage_quotas where tenant_id = p_tenant_id;
  if v_before is null then
    raise exception 'no storage quota row for tenant %', p_tenant_id using errcode = 'P0002';
  end if;

  -- Soft-gelöschte zählen mit (Entscheidung 2). Externe Backends nie — der Bump
  -- zählt sie auch nicht, ihre Bytes liegen woanders.
  select coalesce(sum(size_bytes), 0) into v_actual
    from public.documents
   where tenant_id = p_tenant_id
     and storage_backend = 'internal';

  update public.tenant_storage_quotas
     set current_usage_bytes = v_actual,
         last_recomputed_at = now()
   where tenant_id = p_tenant_id;

  return query select v_before, v_actual, v_actual - v_before;
end;
$function$;

revoke all on function public.recompute_tenant_storage_usage(uuid) from public;
revoke all on function public.recompute_tenant_storage_usage(uuid) from anon;
revoke all on function public.recompute_tenant_storage_usage(uuid) from authenticated;

-- Trigger-interne Funktionen sind für Clients nicht aufrufbar (PROJ-68-Muster).
revoke all on function public._dms_release_storage_usage() from public;
revoke all on function public._dms_release_storage_usage() from anon;
revoke all on function public._dms_release_storage_usage() from authenticated;

-- ---------------------------------------------------------------------------
-- Post-Conditions — fail loud, nicht still.
-- ---------------------------------------------------------------------------
do $$
declare
  v_triggers int;
  v_bump_touches_timestamp boolean;
  v_client_exec int;
begin
  select count(*) into v_triggers from pg_trigger
   where tgrelid = 'public.documents'::regclass and not tgisinternal
     and tgname in ('documents_release_storage_usage', 'documents_adjust_storage_usage');
  if v_triggers <> 2 then
    raise exception 'PROJ-Y-45p: erwartet 2 neue Trigger auf documents, gefunden %', v_triggers;
  end if;

  select pg_get_functiondef(oid) like '%last_recomputed_at%' into v_bump_touches_timestamp
    from pg_proc where proname = '_dms_bump_storage_usage' and pronamespace = 'public'::regnamespace;
  if v_bump_touches_timestamp then
    raise exception 'PROJ-Y-45p: der Bump schreibt weiterhin last_recomputed_at';
  end if;

  select count(*) into v_client_exec
    from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('recompute_tenant_storage_usage', '_dms_release_storage_usage')
     and (a::text like 'anon=%' or a::text like 'authenticated=%' or a::text like '=%');
  if v_client_exec > 0 then
    raise exception 'PROJ-Y-45p: % Client-EXECUTE-Eintraege verblieben', v_client_exec;
  end if;
end;
$$;
