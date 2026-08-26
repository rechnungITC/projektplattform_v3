-- PROJ-Y-45p — Rücknahme meiner Delta-Variante. Zwei Sessions haben denselben
-- Followup gleichzeitig gebaut; ihre Lösung war 27 Sekunden früher in Prod und
-- ist die bessere.
--
-- Was passiert ist, aus der Migrations-Registry belegt:
--   20260826113211  20260826110000_projy45p_quota_recompute        (andere Spur)
--   20260826113238  20260826120000_projy45p_storage_quota_decrement (diese Spur)
--
-- Damit trug Prod zwei konkurrierende Mechanismen auf `documents`: ihre
-- anweisungsweise **Neuberechnung** (INSERT/UPDATE/DELETE über Übergangstabellen)
-- und meine zeilenweise **Delta-Arithmetik**. Bei zwei Buchhaltungen auf derselben
-- Spalte entscheidet die Reihenfolge der Trigger, welche gewinnt — der schlechteste
-- aller Zustände. Diese Migration stellt genau EINEN Mechanismus wieder her, ihren.
--
-- **Warum ihre und nicht meine — nicht aus Höflichkeit, sondern aus zwei Gründen:**
--
-- 1. Eine Neuberechnung konvergiert, eine Gegenrechnung driftet. Jeder Weg, der
--    die Trigger nicht durchläuft (`session_replication_role = replica` in den
--    Teardowns, Kaskaden), lässt eine Delta-Variante schief stehen — und genau so
--    ist die Drift entstanden, die der Befund beschreibt. Ihre Variante heilt
--    Bestandsdrift von selbst; meine hätte einen Reparaturaufruf gebraucht.
--
-- 2. **Sie haben eine Tatsache gemessen, die ich nicht hatte, und sie dreht mein
--    Argument um.** Ich hatte entschieden, soft-gelöschte Dokumente weiter zu
--    zählen, weil ihre Bytes dauerhaft im Bucket liegen (kein Purge, kein Cron) —
--    das ist richtig. Ich hatte aber angenommen, sie seien wiederherstellbar. Es
--    gibt **auch keinen Wiederherstellen-Pfad**. Meine Semantik hätte damit
--    „für immer berechnet, ohne jede Möglichkeit zur Freigabe" bedeutet: das
--    Kontingent wäre unbenutzbar geworden. Ihre Semantik (Löschen gibt sofort
--    frei) ist zudem als Nutzer-Entscheid dokumentiert.
--
-- Der Preis ihrer Wahl ist benannt und bleibt offen: die Bytes liegen weiter auf
-- der Platte, also braucht es einen echten Aufräumlauf (PROJ-79-β-Sweep bzw. den
-- Waisen-Sweep PROJ-Y-115c-3). Gemessen: 9 Objekte / 21.867 Byte im
-- `documents`-Bucket ohne jede `documents`-Zeile.
--
-- Die vorangehende Datei `20260826120000_…` wird **nicht** gelöscht: sie ist in
-- Prod gelaufen, und eine Migration aus der Registry aus dem Repo zu entfernen
-- ist genau die Divergenz, gegen die PROJ-Y-148c/148e antreten. Sie bleibt als
-- Historie stehen, diese Datei nimmt sie zurück.

drop trigger if exists documents_release_storage_usage on public.documents;
drop trigger if exists documents_adjust_storage_usage on public.documents;
drop function if exists public._dms_release_storage_usage();
drop function if exists public.recompute_tenant_storage_usage(uuid);

-- `_dms_bump_storage_usage` hatte ihre Migration bewusst gedroppt (Trigger UND
-- Funktion); mein `create or replace` hat die Funktion 27 Sekunden später
-- wiederbelebt. Ohne diesen Drop bliebe eine Funktion stehen, die ihr Entwurf
-- ausdrücklich entfernt hat — und die kein Trigger mehr aufruft.
drop function if exists public._dms_bump_storage_usage();

do $$
declare
  v_meine int;
  v_ihre int;
begin
  select count(*) into v_meine from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('_dms_release_storage_usage', 'recompute_tenant_storage_usage', '_dms_bump_storage_usage');
  if v_meine <> 0 then
    raise exception 'PROJ-Y-45p-revert: % eigene Funktion(en) verblieben', v_meine;
  end if;

  select count(*) into v_meine from pg_trigger
   where tgrelid = 'public.documents'::regclass
     and tgname in ('documents_release_storage_usage', 'documents_adjust_storage_usage');
  if v_meine <> 0 then
    raise exception 'PROJ-Y-45p-revert: % eigene Trigger verblieben', v_meine;
  end if;

  -- Und die Gegenrichtung: ihr Mechanismus muss vollstaendig stehen. Nur zu
  -- pruefen, dass meine Objekte weg sind, wuerde auch einen Zustand durchlassen,
  -- in dem gar keine Buchhaltung mehr existiert.
  --
  -- Bedingt, und das ist kein Aufweichen, sondern eine Notwendigkeit: ihre
  -- Migration liegt in einem anderen, noch nicht gemergten Zweig. In Prod war sie
  -- vorhanden, als diese Datei lief — dort hat die Pruefung unbedingt gegriffen
  -- (3 Trigger gefunden). Der in Prod ausgefuehrte Text war an dieser Stelle
  -- also unbedingt formuliert; die Repo-Fassung ist bedingt, damit sie allein
  -- replaybar bleibt. Der Unterschied betrifft ausschliesslich diese Pruefung,
  -- kein DDL und keine Daten — gesagt statt verschwiegen. In einem Fresh-Apply NUR dieses Zweiges gibt es sie
  -- nicht, und eine Datei, die auf Objekte einer fremden, hier fehlenden
  -- Migration besteht, macht den Schema-Drift-Waechter berechtigt rot. Sobald
  -- beide Zweige auf main sind, greift der Zweig wieder unbedingt.
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='_dms_recompute_storage_usage') then
    select count(*) into v_ihre from pg_trigger
     where tgrelid = 'public.documents'::regclass
       and tgname in ('documents_recompute_quota_ins', 'documents_recompute_quota_upd', 'documents_recompute_quota_del');
    if v_ihre <> 3 then
      raise exception 'PROJ-Y-45p-revert: Neuberechnungs-Funktion vorhanden, aber % von 3 Triggern', v_ihre;
    end if;
  else
    raise notice 'PROJ-Y-45p-revert: Neuberechnungs-Mechanismus nicht vorhanden (Zweig 20260826110000 fehlt) — Pruefung uebersprungen';
  end if;
end;
$$;
