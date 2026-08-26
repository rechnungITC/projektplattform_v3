-- PROJ-Y-45p — der Speicherzähler bekommt ein Dekrement, und zwar als
-- Neuberechnung statt als Gegenrechnung.
--
-- Ausgangslage, gemessen statt vermutet: `_dms_bump_storage_usage` ist ein
-- AFTER-INSERT-Trigger und addiert nur. Es gibt im ganzen Repo kein Dekrement
-- und keine Neuberechnung, und `last_recomputed_at` wurde geschrieben, ohne dass
-- je etwas neu berechnet wurde. Folge in Prod: zwei Mandanten mit 1344 bzw. 1176
-- gezählten Bytes bei **null** Dokumenten — die Bytes stammen aus hart
-- gelöschten Zeilen (Kaskade aus `document_tree_nodes`, Rücknahme eines
-- fehlgeschlagenen Uploads, Teardowns unter Dienst-Schlüssel).
--
-- Das ist keine Kosmetik: der Zähler speist den Upload-Vorabcheck (413 in
-- `POST …/documents`) und die Speicheranzeige. Ein zu hoher Wert verkleinert
-- das nutzbare Kontingent stillschweigend.
--
-- **Warum Neuberechnung und nicht ein Dekrement-Trigger.** Die ursprüngliche
-- Anforderung von PROJ-79 sagt es selbst: „`current_usage_bytes` is recomputed
-- on every upload, every soft delete, and on a daily sweep." Eine
-- Gegenrechnung driftet bei jedem Weg, der die Trigger nicht durchläuft — und
-- genau so ist die heutige Drift entstanden (unter
-- `session_replication_role = replica` sind die Trigger aus). Eine
-- Neuberechnung konvergiert stattdessen und heilt Bestandsdrift von selbst.
--
-- **Was der Zähler bedeutet (Nutzer-Entscheid):** die Summe der *lebenden*
-- internen Dokumente. Löschen gibt sofort frei. Das weicht von der
-- α-Formulierung „Soft-delete does NOT free bytes (30-day retention window;
-- freeing happens in β nightly truth-sweep)" ab — bewusst, weil diese Politik
-- sich auf zwei Dinge beruft, die es nicht gibt: eine Aufbewahrungsfrist mit
-- Purge und einen Wiederherstellen-Pfad (beides gemessen: kein Cron, kein
-- Codepfad). Wörtlich umgesetzt hieße sie „für immer berechnet", und kein
-- Produktpfad gäbe je ein Byte frei.
--
-- **Was der Zähler NICHT ist:** die Bytes auf der Platte. ε legt je Foto zwei
-- abgeleitete Größen als Geschwister-Objekte ohne eigene `documents`-Zeile ab
-- (AC-45εH-17, bewusst) — die zählen nicht mit. Wer das später „reparieren"
-- will, ändert eine getroffene Entscheidung, nicht einen Fehler.

-- 1) Die eine Autorität: was ein Mandant belegt.
create or replace function public._dms_recompute_storage_usage(p_tenant_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(size_bytes), 0) into v_total
  from public.documents
  where tenant_id = p_tenant_id
    and storage_backend = 'internal'   -- externe Spiegel sind Verweise, kein Speicher
    and deleted_at is null;

  insert into public.tenant_storage_quotas as q
    (tenant_id, current_usage_bytes, last_recomputed_at)
  values (p_tenant_id, v_total, now())
  on conflict (tenant_id) do update
    set current_usage_bytes = v_total,
        last_recomputed_at  = now();

  return v_total;
end;
$$;

-- 2) Der Trigger. **Anweisungsweise, nicht zeilenweise** — und das ist keine
-- Optimierung, sondern der von der Spec benannte Fall: `dms_soft_delete_subtree`
-- löscht den ganzen Teilbaum in EINER UPDATE-Anweisung („PM deletes a folder
-- containing 200 documents"). Zeilenweise wären das 200 Neuberechnungen über
-- jeweils alle Dokumente des Mandanten; anweisungsweise ist es eine.
--
-- Dynamisches SQL, weil Übergangstabellen je Ereignis verschieden heissen und
-- ein Trigger mit Übergangstabellen nur für EIN Ereignis erklärt werden darf.
-- Die drei Abfragen sind feste Literale — keine Einsetzung, keine Angriffsfläche.
create or replace function public._dms_recompute_quota_stmt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_sql text;
begin
  -- Beim UPDATE wird nur neu gerechnet, wenn sich wirklich eine zählrelevante
  -- Spalte bewegt hat. `documents` trägt `moddatetime` und
  -- `record_audit_changes`; eine Umbenennung darf keine Neuberechnung auslösen.
  -- Die symmetrische Differenz nimmt beide Richtungen, damit ein (heute
  -- unmöglicher) Mandantenwechsel auch den ALTEN Zähler korrigiert.
  v_sql := case tg_op
    when 'INSERT' then 'select distinct tenant_id from new_docs'
    when 'DELETE' then 'select distinct tenant_id from old_docs'
    else '
      select distinct tenant_id from (
        select tenant_id from (
          select id, tenant_id, deleted_at, size_bytes, storage_backend from new_docs
          except
          select id, tenant_id, deleted_at, size_bytes, storage_backend from old_docs
        ) a
        union all
        select tenant_id from (
          select id, tenant_id, deleted_at, size_bytes, storage_backend from old_docs
          except
          select id, tenant_id, deleted_at, size_bytes, storage_backend from new_docs
        ) b
      ) changed'
  end;

  for r in execute v_sql loop
    perform public._dms_recompute_storage_usage(r.tenant_id);
  end loop;

  return null;
end;
$$;

-- Das reine Inkrement weicht. Es stehen zu lassen hiesse, zwei widersprüchliche
-- Autoritäten für dieselbe Zahl zu führen.
drop trigger if exists documents_bump_storage_usage on public.documents;
drop function if exists public._dms_bump_storage_usage();

drop trigger if exists documents_recompute_quota_ins on public.documents;
create trigger documents_recompute_quota_ins
  after insert on public.documents
  referencing new table as new_docs
  for each statement execute function public._dms_recompute_quota_stmt();

drop trigger if exists documents_recompute_quota_upd on public.documents;
-- KEINE Spaltenliste: Postgres lehnt Übergangstabellen mit Spaltenliste ab
-- („transition tables cannot be specified for triggers with column lists",
-- beim ersten Anwendungsversuch gemessen). Die Verengung sitzt stattdessen in
-- der Funktion — und ist dort schärfer, weil eine Spaltenliste bereits beim
-- Nennen einer Spalte feuert, auch wenn der Wert gleich bleibt.
create trigger documents_recompute_quota_upd
  after update on public.documents
  referencing old table as old_docs new table as new_docs
  for each statement execute function public._dms_recompute_quota_stmt();

drop trigger if exists documents_recompute_quota_del on public.documents;
create trigger documents_recompute_quota_del
  after delete on public.documents
  referencing old table as old_docs
  for each statement execute function public._dms_recompute_quota_stmt();

-- 3) Der tägliche Lauf. Sicherheitsnetz gegen alles, was die Trigger nicht
-- durchläuft — genau der Weg, über den die heutige Drift entstanden ist.
-- Läuft über bestehende Mandanten UND über Mandanten mit Dokumenten, damit eine
-- fehlende Zeile ebenso geheilt wird wie eine falsche.
create or replace function public.dms_sweep_storage_quotas()
returns table (tenants_swept integer, corrected integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_before bigint;
  v_after bigint;
begin
  tenants_swept := 0;
  corrected := 0;
  for r in
    select tenant_id from public.tenant_storage_quotas
    union
    select distinct tenant_id from public.documents
      where storage_backend = 'internal' and deleted_at is null
  loop
    select current_usage_bytes into v_before
      from public.tenant_storage_quotas where tenant_id = r.tenant_id;
    v_after := public._dms_recompute_storage_usage(r.tenant_id);
    tenants_swept := tenants_swept + 1;
    if v_before is distinct from v_after then
      corrected := corrected + 1;
    end if;
  end loop;
  return next;
end;
$$;

-- Rechte: alle drei sind interne Wege. Der Sweep wird vom nächtlichen Lauf
-- unter Dienst-Schlüssel gerufen (Muster PROJ-130-ε: wer siegeln/fegen kann,
-- wählt den Zeitpunkt) — niemand aus der Anwendung.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._dms_recompute_storage_usage(uuid)',
    'public._dms_recompute_quota_stmt()',
    'public.dms_sweep_storage_quotas()'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('revoke execute on function %s from authenticated', fn);
  end loop;
  execute 'grant execute on function public.dms_sweep_storage_quotas() to service_role';
end $$;

-- 4) Bestandsdrift einmalig heilen (der erste Sweep) und danach beweisen.
do $$
declare
  v_swept integer;
  v_corrected integer;
  v_bad integer;
  v_acl integer;
begin
  select tenants_swept, corrected into v_swept, v_corrected
    from public.dms_sweep_storage_quotas();
  raise notice 'PROJ-Y-45p Erst-Sweep: % Mandanten, % korrigiert', v_swept, v_corrected;

  -- Post-Bedingung, die wirklich etwas behauptet: kein Zähler weicht mehr von
  -- der Summe der lebenden Dokumente ab.
  select count(*) into v_bad
  from public.tenant_storage_quotas q
  where q.current_usage_bytes <> (
    select coalesce(sum(d.size_bytes), 0) from public.documents d
    where d.tenant_id = q.tenant_id
      and d.storage_backend = 'internal' and d.deleted_at is null);
  if v_bad > 0 then
    raise exception 'PROJ-Y-45p: % Mandanten weichen nach dem Sweep noch ab', v_bad;
  end if;

  -- Das alte Inkrement ist weg, die drei neuen Trigger sind da und sind
  -- anweisungsweise (tgtype-Bit 0 = FOR EACH STATEMENT).
  if exists (select 1 from pg_trigger where tgname = 'documents_bump_storage_usage') then
    raise exception 'PROJ-Y-45p: das reine Inkrement steht noch';
  end if;
  select count(*) into v_bad from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'documents'
     and t.tgname like 'documents_recompute_quota_%'
     and (t.tgtype & 1) = 0;
  if v_bad <> 3 then
    raise exception 'PROJ-Y-45p: % statt 3 anweisungsweise Neuberechnungs-Trigger', v_bad;
  end if;

  -- Kein EXECUTE für anon/authenticated/PUBLIC auf den drei Funktionen.
  -- PUBLIC rendert mit leerem Empfänger, der Eintrag BEGINNT also mit '='.
  select count(*) into v_acl
  from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('_dms_recompute_storage_usage','_dms_recompute_quota_stmt','dms_sweep_storage_quotas')
    and (a::text like 'anon=%' or a::text like 'authenticated=%' or a::text like '=%');
  if v_acl > 0 then
    raise exception 'PROJ-Y-45p: % offene EXECUTE-Rechte auf den internen Funktionen', v_acl;
  end if;

  raise notice 'PROJ-Y-45p: Post-Bedingungen erfüllt.';
end $$;
