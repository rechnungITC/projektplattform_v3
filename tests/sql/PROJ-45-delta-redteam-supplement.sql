-- PROJ-45-δ — Rot-Team-Supplement zu `construction_schedule_signals`.
--
-- Sechs Vektoren, die der Haupt-Pentest NICHT abdeckt: Daten-Einschleusung,
-- tiefer Baum am Rekursions-Riegel, Nenner-Null, geratene Kennungen,
-- fremder Mandant mit echten Zeilen, Grenzdatum am Fenster.
--
-- Hausform: DO-Blöcke, JEDER endet in `raise exception` — die Fehlermeldung IST
-- der Bericht, alles rollt zurück, 0 Rückstände per Konstruktion.
-- Zielmandant `[E2E] Projektplattform Test` = e2e…0002, NICHT der Kundenmandant.
--
-- ZWEI PRÄMISSEN DES AUFTRAGS WAREN FALSCH, live gemessen und korrigiert:
--   1. "190 Zeichen" ist nicht einfügbar. `construction_trades_label_len` deckelt
--      bei 120, `construction_sections_label_len` bei 160. R1 fährt daher die
--      MAXIMALLÄNGE (120/160) und prüft `char_length` mit — eine Kürzung im
--      jsonb-Pfad fiele damit auf.
--   2. `e2e…000a` ist kein Mandant, sondern das BAU-PROJEKT im Mandanten
--      `e2e…0009` (`[E2E] Bau-Projekt Mängel`). Dort liegen die echten Bau-Zeilen
--      (1 Projekt-Gewerk, 2 Abschnitte, 14 Mängel); der Mandant e2e…0002 hat 0.
--      R5 ruft also mit dieser PROJEKT-Kennung unter einer Identität, die im
--      Mandanten 0009 nachweislich kein Mitglied ist (`e2e…0006`, Visual-Nutzer;
--      Mitglieder sind 0001/000b/000c).
--
-- Gemessene Nebenbedingungen beim Seeden: `phases.sequence_number` NOT NULL ·
-- `defect_number`/`acceptance_number` je Projekt UNIQUE (max+n) ·
-- `construction_defects.trade_id` NOT NULL · Gewerk-`key` ~ '^[a-z0-9_]+$'.
--
-- ERGEBNIS 2026-08-21 gegen Prod: 21/21 PASS, 0 FAIL, dazu 2 ausdrückliche
-- BEFUNDE (Zahlen statt Behauptung). 0 Rückstände über 9 Zähler nachgemessen
-- (ptd_rt*-Gewerke 0, PT-D-RT-Abschnitte/Mängel/Arbeitspakete/Projekte je 0,
-- Mandant e2e…0002 weiter 0 Abschnitte / 0 Projekt-Gewerke / 0 Mängel,
-- Projekte unverändert 20).
--
--   Block 1 (9): R2a_answers=PASS R1a_trade_label_intact=PASS
--     R1b_section_label_intact=PASS R1c_nested_labels_intact=PASS
--     R1d_structure_ok=PASS R2b_all_25_rows=PASS R2c_deep_node_sees_own=PASS
--     R3_zero_denominator=PASS
--     R2d_BEFUND: root_subtree_depth=20, root_linked_count=1
--   Block 2 (9): R4a_random_uuid=PASS R4b_soft_deleted_empty=PASS
--     R6a_today_not_overdue=PASS R6b_today_in_deadlines=PASS
--     R6c_plus14_in_deadlines=PASS R6d_plus15_excluded=PASS
--     R6e_all_three_seeded=PASS R6f_window_days=PASS
--     R4c_BEFUND: Zeilen eines weich gelöschten Projekts sind SICHTBAR
--   Block 3 (4): K0_rows_exist_as_postgres=PASS(sections=2,trades=1,defects=14)
--     K0b_signals_nonempty_as_postgres=PASS K2_stranger_is_not_member=PASS
--     K1_stranger_sees_nothing=PASS
--
-- BEFUND 1 (R2d, Low) — der Rekursions-Riegel `depth < 20` schneidet ab, und
-- zwar nicht nur die Anzeige: bei 25 verschachtelten Abschnitten meldet der
-- Wurzelknoten `subtree_depth=20` und zählt in seine Teilbaum-Summe NUR das
-- Arbeitspaket auf Tiefe 4 (`linked_count=1`), nicht das auf Tiefe 24. Der
-- tiefe Knoten selbst sieht es (R2c), die Wurzel unterberichtet also ihren
-- Fortschritt still. Kein Fehler, kein Hängen — aber ab Tiefe 21 ist die
-- Zahl an der Wurzel zu niedrig, ohne dass die Oberfläche das sagen könnte.
--
-- BEFUND 2 (R4c, Info) — die Auswertung filtert NICHT auf `projects.is_deleted`
-- (sie joint `projects` überhaupt nicht). Zeilen in einem weich gelöschten
-- Projekt erscheinen vollständig, wenn man dessen Kennung kennt. R4b allein
-- wäre hier falsch-grün gewesen: ein leeres Projekt antwortet leer, ganz egal
-- ob der Papierkorb beachtet wird — deshalb die Messung R4c mit echten Zeilen.
-- Kein Rechteproblem (RLS und Projekt-Mitgliedschaft entscheiden unverändert),
-- und die Oberfläche verlinkt gelöschte Projekte nicht.

-- ---------------------------------------------------------------------------
-- Block 1 — R1 Daten-Einschleusung · R2 tiefer Baum · R3 Nenner Null
-- ---------------------------------------------------------------------------
do $rt1$
declare
  v_tenant  constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000002';
  v_admin   constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000001';
  v_project uuid;
  v_evil_trade text;
  v_evil_sec   text;
  v_trade_r1 uuid; v_pt_r1 uuid;
  v_sec_r1 uuid;
  v_chain uuid[] := '{}';
  v_prev uuid;
  v_sec_zero uuid;
  v_dn int;
  v_sig jsonb; v_t jsonb; v_s jsonb; v_dl jsonb;
  v_root_linked int; v_root_depth int; v_deep_linked int;
  v_i int;
  v_r text := '';
begin
  select id into v_project from public.projects
   where tenant_id = v_tenant and is_deleted = false order by created_at limit 1;
  if v_project is null then
    raise exception 'PROJ-45-δ REDTEAM: kein Projekt im Zielmandanten';
  end if;
  select coalesce(max(defect_number), 0) into v_dn
    from public.construction_defects where project_id = v_project;

  -- Anführungszeichen, Backslash, Skript-Tag, Zeilenumbruch — auf die
  -- zulässige Maximallänge aufgefüllt (120 bzw. 160).
  v_evil_trade := left('PT-D RT "q" \ </script> ' || chr(10) || ' & ''x'''
                        || repeat('Z', 200), 120);
  v_evil_sec   := left('PT-D RT-Sec "q" \ </script> ' || chr(10) || ' & ''y'''
                        || repeat('Y', 300), 160);

  insert into public.construction_trades (tenant_id, key, label)
    values (v_tenant, 'ptd_rt_evil', v_evil_trade) returning id into v_trade_r1;
  insert into public.project_construction_trades (tenant_id, project_id, trade_id, rag_status)
    values (v_tenant, v_project, v_trade_r1, 'gruen') returning id into v_pt_r1;
  insert into public.construction_sections (tenant_id, project_id, label)
    values (v_tenant, v_project, v_evil_sec) returning id into v_sec_r1;
  -- Mangel mit Frist im Fenster, damit auch die verschachtelten Label-
  -- Unterabfragen in `deadlines` die Werte anfassen.
  insert into public.construction_defects
    (tenant_id, project_id, defect_number, title, trade_id, section_id,
     severity, status, due_date, created_by)
  values (v_tenant, v_project, v_dn + 1, 'PT-D RT Einschleusung', v_pt_r1, v_sec_r1,
          'gering', 'offen', current_date + 2, v_admin);

  -- ── R2 — 25 verschachtelte Abschnitte (Riegel steht bei depth < 20) ──────
  v_prev := null;
  for v_i in 1..25 loop
    insert into public.construction_sections (tenant_id, project_id, parent_id, label)
      values (v_tenant, v_project, v_prev, 'PT-D RT Tiefe ' || v_i)
      returning id into v_prev;
    v_chain := v_chain || v_prev;
  end loop;
  -- Arbeitspaket am TIEFSTEN Knoten (Tiefe 24 vom Wurzelknoten aus) …
  insert into public.work_items (tenant_id, project_id, kind, title, status, section_id, created_by)
    values (v_tenant, v_project, 'work_package', 'PT-D RT WP tief', 'done',
            v_chain[25], v_admin);
  -- … und eines innerhalb des Riegels (Tiefe 4) als Kontrolle: ohne diese
  -- Gegenprobe wäre "der tiefe zählt nicht" auch bei komplett kaputter
  -- Teilbaum-Summe grün.
  insert into public.work_items (tenant_id, project_id, kind, title, status, section_id, created_by)
    values (v_tenant, v_project, 'work_package', 'PT-D RT WP flach', 'done',
            v_chain[5], v_admin);

  -- ── R3 — Nenner Null: alle verknüpften Arbeitspakete `cancelled` ─────────
  insert into public.construction_sections (tenant_id, project_id, label)
    values (v_tenant, v_project, 'PT-D RT Nenner Null') returning id into v_sec_zero;
  insert into public.work_items (tenant_id, project_id, kind, title, status, section_id, created_by)
    values (v_tenant, v_project, 'work_package', 'PT-D RT verworfen 1', 'cancelled',
            v_sec_zero, v_admin);
  insert into public.work_items (tenant_id, project_id, kind, title, status, section_id, created_by)
    values (v_tenant, v_project, 'work_package', 'PT-D RT verworfen 2', 'cancelled',
            v_sec_zero, v_admin);

  -- Die Auswertung muss überhaupt antworten (kein Hängen, kein Fehler).
  begin
    v_sig := public.construction_schedule_signals(v_project);
    v_r := v_r || 'R2a_answers=PASS; ';
  exception when others then
    raise exception 'PROJ-45-δ REDTEAM BLOCK 1 (rollback): R2a_answers=FAIL(% %)',
      SQLSTATE, SQLERRM;
  end;

  -- ── R1 — kommen die Werte unbeschadet an? ───────────────────────────────
  select x into v_t from jsonb_array_elements(v_sig -> 'trades') x
   where x ->> 'project_trade_id' = v_pt_r1::text;
  v_r := v_r || 'R1a_trade_label_intact='
      || case when v_t ->> 'trade_label' = v_evil_trade
               and char_length(v_t ->> 'trade_label') = 120
              then 'PASS'
              else 'FAIL(len=' || coalesce(char_length(v_t ->> 'trade_label')::text,'null')
                   || ')' end || '; ';
  select x into v_s from jsonb_array_elements(v_sig -> 'sections') x
   where x ->> 'section_id' = v_sec_r1::text;
  v_r := v_r || 'R1b_section_label_intact='
      || case when v_s ->> 'label' = v_evil_sec
               and char_length(v_s ->> 'label') = 160
              then 'PASS'
              else 'FAIL(len=' || coalesce(char_length(v_s ->> 'label')::text,'null')
                   || ')' end || '; ';
  select x into v_dl from jsonb_array_elements(v_sig -> 'deadlines') x
   where x ->> 'kind' = 'mangel' and x ->> 'project_trade_id' = v_pt_r1::text;
  v_r := v_r || 'R1c_nested_labels_intact='
      || case when v_dl ->> 'trade_label' = v_evil_trade
               and v_dl ->> 'section_label' = v_evil_sec
              then 'PASS' else 'FAIL(' || coalesce(v_dl::text,'null') || ')' end || '; ';
  -- Struktur bricht nicht: Zeilenumbruch/Backslash haben die Aggregation nicht
  -- zerlegt, alle drei Blöcke sind noch Arrays mit erwarteter Mindestlänge.
  v_r := v_r || 'R1d_structure_ok='
      || case when jsonb_typeof(v_sig -> 'trades') = 'array'
               and jsonb_typeof(v_sig -> 'sections') = 'array'
               and jsonb_typeof(v_sig -> 'deadlines') = 'array'
               and (v_sig -> 'summary' ->> 'trades_total')::int >= 1
              then 'PASS' else 'FAIL' end || '; ';

  -- ── R2 — Befund am Riegel, mit Zahlen statt Behauptung ──────────────────
  v_r := v_r || 'R2b_all_25_rows='
      || case when (select count(*) from jsonb_array_elements(v_sig -> 'sections') x
                     where x ->> 'label' like 'PT-D RT Tiefe %') = 25
              then 'PASS'
              else 'FAIL(' || (select count(*) from jsonb_array_elements(v_sig -> 'sections') x
                                where x ->> 'label' like 'PT-D RT Tiefe %')::text || ')'
         end || '; ';
  select (x ->> 'subtree_depth')::int, (x ->> 'linked_count')::int
    into v_root_depth, v_root_linked
    from jsonb_array_elements(v_sig -> 'sections') x
   where x ->> 'section_id' = v_chain[1]::text;
  select (x ->> 'linked_count')::int into v_deep_linked
    from jsonb_array_elements(v_sig -> 'sections') x
   where x ->> 'section_id' = v_chain[25]::text;
  -- Kontrolle: der tiefe Knoten SIEHT sein eigenes Arbeitspaket (sonst wäre
  -- "Wurzel zählt ihn nicht" kein Aussage über den Riegel).
  v_r := v_r || 'R2c_deep_node_sees_own='
      || case when v_deep_linked = 1 then 'PASS'
              else 'FAIL(' || coalesce(v_deep_linked::text,'null') || ')' end || '; ';
  -- BEFUND, nicht PASS/FAIL: was schneidet `depth < 20` an der Wurzel ab?
  v_r := v_r || 'R2d_BEFUND_root_subtree_depth=' || coalesce(v_root_depth::text,'null')
             || ' root_linked_count=' || coalesce(v_root_linked::text,'null')
             || ' (2 = auch Tiefe 24 zaehlt mit; 1 = Riegel schneidet ab); ';

  -- ── R3 — keine Division durch Null, und `null` statt `0` ────────────────
  select x into v_s from jsonb_array_elements(v_sig -> 'sections') x
   where x ->> 'section_id' = v_sec_zero::text;
  v_r := v_r || 'R3_zero_denominator='
      || case when (v_s -> 'progress_percent') = 'null'::jsonb
               and (v_s ->> 'linked_count')::int = 2
               and (v_s ->> 'source_count')::int = 0
              then 'PASS' else 'FAIL(' || coalesce(v_s::text,'null') || ')' end || '; ';

  raise exception 'PROJ-45-δ REDTEAM BLOCK 1 (rollback): %', v_r;
end
$rt1$;

-- ---------------------------------------------------------------------------
-- Block 2 — R4 geratene Kennungen · R6 Grenzdatum
-- ---------------------------------------------------------------------------
do $rt2$
declare
  v_tenant  constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000002';
  v_admin   constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000001';
  v_project uuid;
  v_fake    uuid := gen_random_uuid();
  v_deleted uuid;
  v_del_sec uuid; v_del_trade uuid; v_del_pt uuid;
  v_trade_r6 uuid; v_pt_r6 uuid;
  v_d_today uuid; v_d_14 uuid; v_d_15 uuid;
  v_dn int;
  v_sig jsonb; v_t jsonb;
  v_r text := '';
begin
  select id into v_project from public.projects
   where tenant_id = v_tenant and is_deleted = false order by created_at limit 1;

  -- ── R4a — frei erfundene Projekt-Kennung ────────────────────────────────
  begin
    v_sig := public.construction_schedule_signals(v_fake);
    v_r := v_r || 'R4a_random_uuid='
        || case when v_sig -> 'trades' = '[]'::jsonb
                 and v_sig -> 'sections' = '[]'::jsonb
                 and v_sig -> 'deadlines' = '[]'::jsonb
                 and v_sig -> 'overdue_defects' = '[]'::jsonb
                 and (v_sig -> 'summary' ->> 'overdue_defects')::int = 0
                 and (v_sig -> 'summary' ->> 'trades_total')::int = 0
                 and (v_sig -> 'summary' ->> 'sections_total')::int = 0
                 and (v_sig ->> 'project_id') = v_fake::text
                then 'PASS' else 'FAIL(' || v_sig::text || ')' end || '; ';
  exception when others then
    v_r := v_r || 'R4a_random_uuid=FAIL(' || SQLSTATE || ' ' || SQLERRM || '); ';
  end;

  -- ── R4b — weich gelöschtes Projekt. In Prod existiert keines, also eines
  --          anlegen (rollt mit zurück). Die Zusicherung allein wäre schwach:
  --          ein LEERES Projekt antwortet leer, ganz egal ob die Auswertung
  --          `is_deleted` beachtet. Deshalb R4c als echte Messung.
  insert into public.projects
    (tenant_id, name, responsible_user_id, created_by, project_type, is_deleted)
  values (v_tenant, 'PT-D RT weich geloescht', v_admin, v_admin, 'construction', true)
    returning id into v_deleted;
  begin
    v_sig := public.construction_schedule_signals(v_deleted);
    v_r := v_r || 'R4b_soft_deleted_empty='
        || case when v_sig -> 'trades' = '[]'::jsonb
                 and v_sig -> 'sections' = '[]'::jsonb
                 and (v_sig -> 'summary' ->> 'sections_total')::int = 0
                then 'PASS' else 'FAIL(' || v_sig::text || ')' end || '; ';
  exception when others then
    v_r := v_r || 'R4b_soft_deleted_empty=FAIL(' || SQLSTATE || ' ' || SQLERRM || '); ';
  end;

  -- ── R4c — BEFUND: beachtet die Auswertung den Papierkorb überhaupt? ─────
  insert into public.construction_trades (tenant_id, key, label)
    values (v_tenant, 'ptd_rt_del', 'PT-D RT geloescht') returning id into v_del_trade;
  insert into public.project_construction_trades (tenant_id, project_id, trade_id, rag_status)
    values (v_tenant, v_deleted, v_del_trade, 'gruen') returning id into v_del_pt;
  insert into public.construction_sections (tenant_id, project_id, label)
    values (v_tenant, v_deleted, 'PT-D RT Abschnitt im Papierkorb')
    returning id into v_del_sec;
  v_sig := public.construction_schedule_signals(v_deleted);
  v_r := v_r || 'R4c_BEFUND_rows_in_deleted_project_visible='
      || case when (v_sig -> 'summary' ->> 'sections_total')::int = 1
                and (v_sig -> 'summary' ->> 'trades_total')::int = 1
               then 'ja (kein projects-Join, kein is_deleted-Filter)'
              when (v_sig -> 'summary' ->> 'sections_total')::int = 0
               then 'nein (gefiltert)'
              else 'unklar(' || (v_sig -> 'summary')::text || ')' end || '; ';

  -- ── R6 — Grenzdatum: heute · +14 · +15 (Fenster ist eine Konstante) ─────
  select coalesce(max(defect_number), 0) into v_dn
    from public.construction_defects where project_id = v_project;
  insert into public.construction_trades (tenant_id, key, label)
    values (v_tenant, 'ptd_rt_grenze', 'PT-D RT Grenze') returning id into v_trade_r6;
  insert into public.project_construction_trades (tenant_id, project_id, trade_id, rag_status)
    values (v_tenant, v_project, v_trade_r6, 'gruen') returning id into v_pt_r6;
  insert into public.construction_defects
    (tenant_id, project_id, defect_number, title, trade_id, severity, status, due_date, created_by)
  values (v_tenant, v_project, v_dn + 1, 'PT-D RT Frist heute', v_pt_r6, 'gering', 'offen',
          current_date, v_admin) returning id into v_d_today;
  insert into public.construction_defects
    (tenant_id, project_id, defect_number, title, trade_id, severity, status, due_date, created_by)
  values (v_tenant, v_project, v_dn + 2, 'PT-D RT Frist +14', v_pt_r6, 'gering', 'offen',
          current_date + 14, v_admin) returning id into v_d_14;
  insert into public.construction_defects
    (tenant_id, project_id, defect_number, title, trade_id, severity, status, due_date, created_by)
  values (v_tenant, v_project, v_dn + 3, 'PT-D RT Frist +15', v_pt_r6, 'gering', 'offen',
          current_date + 15, v_admin) returning id into v_d_15;

  v_sig := public.construction_schedule_signals(v_project);
  select x into v_t from jsonb_array_elements(v_sig -> 'trades') x
   where x ->> 'project_trade_id' = v_pt_r6::text;
  v_r := v_r || 'R6a_today_not_overdue='
      || case when (v_t ->> 'overdue_defects')::int = 0
               and not (v_t ->> 'is_blocked')::boolean
              then 'PASS' else 'FAIL(' || coalesce(v_t::text,'null') || ')' end || '; ';
  v_r := v_r || 'R6b_today_in_deadlines='
      || case when exists (select 1 from jsonb_array_elements(v_sig -> 'deadlines') x
                            where x ->> 'ref_id' = v_d_today::text
                              and (x ->> 'due_on')::date = current_date
                              and (x ->> 'is_elapsed')::boolean = false)
              then 'PASS' else 'FAIL' end || '; ';
  v_r := v_r || 'R6c_plus14_in_deadlines='
      || case when exists (select 1 from jsonb_array_elements(v_sig -> 'deadlines') x
                            where x ->> 'ref_id' = v_d_14::text)
              then 'PASS' else 'FAIL' end || '; ';
  v_r := v_r || 'R6d_plus15_excluded='
      || case when not exists (select 1 from jsonb_array_elements(v_sig -> 'deadlines') x
                                where x ->> 'ref_id' = v_d_15::text)
              then 'PASS' else 'FAIL(erscheint)' end || '; ';
  -- Gegenprobe: alle drei Mängel existieren wirklich — sonst wäre R6d auch
  -- dann grün, wenn `deadlines` generell leer bliebe.
  v_r := v_r || 'R6e_all_three_seeded='
      || case when (select count(*) from public.construction_defects
                     where trade_id = v_pt_r6) = 3
              then 'PASS' else 'FAIL' end || '; ';
  v_r := v_r || 'R6f_window_days='
      || case when (v_sig ->> 'window_days')::int = 14 then 'PASS'
              else 'FAIL(' || (v_sig ->> 'window_days') || ')' end || '; ';

  raise exception 'PROJ-45-δ REDTEAM BLOCK 2 (rollback): %', v_r;
end
$rt2$;

-- ---------------------------------------------------------------------------
-- Block 3 — R5 fremder Mandant, echte Zeilen
--
-- `e2e…000a` ist das Bau-PROJEKT im Mandanten `e2e…0009`; dort liegen alle
-- Bau-Zeilen in Prod. `e2e…0006` ist dort nachweislich kein Mitglied (K2).
-- Ohne die Gegenprobe als `postgres` (K0) beweist "leer" nichts.
-- ---------------------------------------------------------------------------
do $rt3$
declare
  v_bau_project constant uuid := 'e2e00000-0000-4e2e-8e2e-00000000000a';
  v_bau_tenant  constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000009';
  v_stranger    constant uuid := 'e2e00000-0000-4e2e-8e2e-000000000006';
  v_sig jsonb;
  v_sec int; v_pt int; v_def int; v_mem int;
  v_r text := '';
begin
  -- ── K0 — Gegenprobe: dort liegen wirklich Zeilen ────────────────────────
  select count(*) into v_sec from public.construction_sections
   where project_id = v_bau_project;
  select count(*) into v_pt from public.project_construction_trades
   where project_id = v_bau_project;
  select count(*) into v_def from public.construction_defects
   where project_id = v_bau_project;
  v_r := v_r || 'K0_rows_exist_as_postgres='
      || case when v_sec > 0 and v_pt > 0 and v_def > 0 then 'PASS' else 'FAIL' end
      || '(sections=' || v_sec || ',trades=' || v_pt || ',defects=' || v_def || '); ';
  v_sig := public.construction_schedule_signals(v_bau_project);
  v_r := v_r || 'K0b_signals_nonempty_as_postgres='
      || case when (v_sig -> 'summary' ->> 'sections_total')::int = v_sec
               and (v_sig -> 'summary' ->> 'trades_total')::int = v_pt
              then 'PASS' else 'FAIL(' || (v_sig -> 'summary')::text || ')' end || '; ';

  -- ── K2 — die gewählte Identität ist dort wirklich kein Mitglied ─────────
  select count(*) into v_mem from public.tenant_memberships
   where tenant_id = v_bau_tenant and user_id = v_stranger;
  v_r := v_r || 'K2_stranger_is_not_member='
      || case when v_mem = 0 then 'PASS' else 'FAIL(' || v_mem || ')' end || '; ';

  -- ── K1 — derselbe Aufruf unter der fremden Identität: alles leer ────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_stranger)::text, true);
  begin
    v_sig := public.construction_schedule_signals(v_bau_project);
    v_r := v_r || 'K1_stranger_sees_nothing='
        || case when v_sig -> 'trades' = '[]'::jsonb
                 and v_sig -> 'sections' = '[]'::jsonb
                 and v_sig -> 'deadlines' = '[]'::jsonb
                 and v_sig -> 'overdue_defects' = '[]'::jsonb
                 and (v_sig -> 'summary' ->> 'overdue_defects')::int = 0
                 and (v_sig -> 'summary' ->> 'defects_without_due_date')::int = 0
                 and (v_sig -> 'summary' ->> 'defects_awaiting_review')::int = 0
                 and (v_sig -> 'summary' ->> 'blocked_trades')::int = 0
                 and (v_sig -> 'summary' ->> 'trades_total')::int = 0
                 and (v_sig -> 'summary' ->> 'sections_total')::int = 0
                then 'PASS' else 'FAIL(' || v_sig::text || ')' end || '; ';
  exception when others then
    v_r := v_r || 'K1_stranger_sees_nothing=FAIL(' || SQLSTATE || ' ' || SQLERRM || '); ';
  end;
  reset role;

  raise exception 'PROJ-45-δ REDTEAM BLOCK 3 (rollback): %', v_r;
end
$rt3$;
