-- PROJ-Y-130h — die Folgen der vier verbleibenden Fresh-Apply-Abbrüche nachholen.
--
-- LAGE
-- ---------------------------------------------------------------------------
-- Nach PROJ-Y-130g brechen noch vier Migrationen im Replay ab; 116 Zeilen laufen
-- nicht. Eine neue Migration kommt ans **Ende** und kann die Abbrüche an
-- Position 18/70/75/441 nicht heilen — nur ihre **Folgen** nachholen. Genau das
-- tut diese Datei, und nur für die Folgen, die Substanz haben.
--
-- Jede der 116 Zeilen wurde gelesen:
--
--   `harden_trigger_only_functions` (17 Zeilen)  → 11 `revoke` — echte Härtung
--   `security_internal_functions_lockdown` (10)  → 2 relevante `revoke`
--   `proj148_last_lead_cascade_fix` (25)         → **keine** Schema-Wirkung,
--                                                  nur Post-Conditions
--   `proj70_beta_accept_bulk_rpc` (64)           → **fast keine**: ein
--                                                  `comment on function` und
--                                                  Smoke-Checks
--
-- Substanz haben 13 `revoke`-Anweisungen, nicht 116 Zeilen.
--
-- WARUM DIE ALTEN ANWEISUNGEN NICHT WIEDERHOLT WERDEN
-- ---------------------------------------------------------------------------
-- Zwei live gemessene Gründe:
--
-- 1. `record_tenant_ai_provider_audit` trägt in Prod `authenticated=X`, obwohl
--    `security_internal_functions_lockdown` es entziehen wollte. Ein blindes
--    Nachholen machte die Shadow-DB **strenger als Prod** — neue Divergenz in
--    die andere Richtung. Diese Funktion bekommt daher **kein**
--    `authenticated`-revoke.
-- 2. `accept_proposal_from_context_undo` hat in Prod die Signatur
--    `(uuid, uuid[])`; die Migration revoked `(uuid, uuid)` — eine Signatur, die
--    nie existierte. Das ist der Grund ihres Abbruchs.
--
-- Maßstab ist deshalb nicht die historische Absicht, sondern der **gemessene
-- Prod-Zustand**: alle betroffenen Funktionen haben dort `anon = false` und kein
-- `PUBLIC`; `authenticated` unterscheidet sich pro Funktion und ist unten
-- einzeln abgebildet.
--
-- In Prod ist diese Datei ein No-op. Ihr Zweck ist der Replay: eine frisch aus
-- den Dateien gebaute Datenbank ließ `anon` bisher die Rollen-Helfer aufrufen —
-- `is_tenant_admin`, `is_tenant_member`, `has_tenant_role` und Geschwister. Das
-- ist der eigentliche Schaden der vier Abbrüche, und er trifft neue Umgebungen
-- und Staging, nicht Prod.
--
-- ZWEI FUNKTIONEN EXISTIEREN IM REPLAY NICHT
-- ---------------------------------------------------------------------------
-- `enforce_last_lead` und `enforce_project_membership_user_in_tenant` legt
-- **keine** Migrationsdatei an — genau die Alt-Divergenz, die PROJ-Y-148e als
-- `legacy` führt und die überhaupt der Grund für zwei der vier Abbrüche ist.
--
-- Eine erste Fassung dieser Datei prüfte darauf mit `raise exception`. Sie hätte
-- im Replay geworfen, und weil die Meldung nicht in das Toleranz-Muster des
-- Workflows passt (`ERROR: ... function ... does not exist`), wäre daraus ein
-- `structural failure` geworden — der Required Check hätte jeden PR blockiert.
-- Beide werden daher **übersprungen und laut gemeldet**. Eine **unerwartet**
-- fehlende Funktion bleibt ein Fehler; sonst wäre diese Datei ein stiller
-- Mitwisser künftiger Divergenz.
--
-- Die Prüfungen arbeiten über Name + Typliste statt über einen
-- `regprocedure`-Cast: der Cast wirft bei abwesender Funktion und würde die
-- Post-Conditions im Replay zum Fehler machen, obwohl die Abwesenheit dort
-- erwartet ist.
--
-- Die Typliste kommt aus `oidvectortypes(p.proargtypes)` und **nicht** aus
-- `pg_get_function_identity_arguments`. Der Unterschied ist nicht kosmetisch:
-- letzteres liefert `p_tenant_id uuid`, also **mit** Parameternamen, und der
-- Vergleich gegen `public.is_tenant_admin(uuid)` findet dann **nichts**. Eine
-- Zwischenfassung dieser Datei hatte genau das — die Helfer-Probe verglich 0
-- gegen 0 und war damit trivial erfüllt, ohne irgendetwas zu bewachen. Gefangen
-- wurde es nur, weil die Zahlen gegen Prod nachgemessen statt geglaubt wurden.

do $$
declare
  v_fn text;
  v_present text[] := array[]::text[];
  v_skipped text[] := array[]::text[];
  v_missing text[] := array[]::text[];

  -- Alle betroffenen Funktionen, Signaturen exakt wie in Prod gemessen.
  v_all text[] := array[
    'public.enforce_last_lead()',
    'public.enforce_project_membership_user_in_tenant()',
    'public.enforce_project_responsible_user_in_tenant()',
    'public.prevent_dependency_cycle()',
    'public.prevent_work_item_parent_cycle()',
    'public.is_tenant_admin(uuid)',
    'public.is_tenant_member(uuid)',
    'public.has_tenant_role(uuid, text)',
    'public.is_project_member(uuid)',
    'public.is_project_lead(uuid)',
    'public.has_project_role(uuid, text)',
    'public._valid_method_keys()',
    'public.record_tenant_ai_provider_audit(uuid, text, text, text, text)',
    'public.accept_proposal_from_context_undo(uuid, uuid[])'
  ];

  -- Nur diese tragen in Prod auch für `authenticated` KEIN Ausführungsrecht.
  -- Die sechs Rollen-Helfer fehlen hier bewusst — die RLS-Policies rufen sie auf.
  v_also_auth text[] := array[
    'public.enforce_last_lead()',
    'public.enforce_project_membership_user_in_tenant()',
    'public.enforce_project_responsible_user_in_tenant()',
    'public.prevent_dependency_cycle()',
    'public.prevent_work_item_parent_cycle()',
    'public._valid_method_keys()'
  ];

  -- Im Fresh-Apply erwartbar abwesend (PROJ-Y-148e führt beide als `legacy`).
  v_expected_absent text[] := array[
    'public.enforce_last_lead()',
    'public.enforce_project_membership_user_in_tenant()'
  ];
begin
  foreach v_fn in array v_all loop
    begin
      perform v_fn::regprocedure;
      v_present := v_present || v_fn;
    exception when undefined_function or invalid_text_representation then
      if v_fn = any (v_expected_absent) then
        v_skipped := v_skipped || v_fn;
      else
        v_missing := v_missing || v_fn;
      end if;
    end;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'PROJ-Y-130h: % unerwartet fehlende Funktion(en): % — Repo/Prod-Divergenz, vgl. PROJ-Y-148e',
      array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;

  foreach v_fn in array v_present loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    if v_fn = any (v_also_auth) then
      execute format('revoke execute on function %s from authenticated', v_fn);
    end if;
  end loop;

  if array_length(v_skipped, 1) > 0 then
    raise notice 'PROJ-Y-130h: % erwartet abwesend, uebersprungen: %',
      array_length(v_skipped, 1), array_to_string(v_skipped, ', ');
  end if;
  raise notice 'PROJ-Y-130h: % von % Funktion(en) gehaertet',
    array_length(v_present, 1), array_length(v_all, 1);
end $$;

-- Post-Conditions: der Zustand wird geprüft, nicht angenommen. Im Replay ist das
-- der eigentliche Gewinn, in Prod die Bestätigung, dass sich nichts verschoben hat.
do $$
declare
  v_anon int;
  v_guards_open int;
  v_helpers_kept int;
  v_helpers_present int;
begin
  -- (a) Keine der vorhandenen Funktionen darf für `anon` aufrufbar sein.
  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and format('public.%s(%s)', p.proname, oidvectortypes(p.proargtypes)) = any (array[
       'public.enforce_last_lead()',
       'public.enforce_project_membership_user_in_tenant()',
       'public.enforce_project_responsible_user_in_tenant()',
       'public.prevent_dependency_cycle()',
       'public.prevent_work_item_parent_cycle()',
       'public.is_tenant_admin(uuid)',
       'public.is_tenant_member(uuid)',
       'public.has_tenant_role(uuid, text)',
       'public.is_project_member(uuid)',
       'public.is_project_lead(uuid)',
       'public.has_project_role(uuid, text)',
       'public._valid_method_keys()',
       'public.record_tenant_ai_provider_audit(uuid, text, text, text, text)',
       'public.accept_proposal_from_context_undo(uuid, uuid[])'])
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_anon <> 0 then
    raise exception 'PROJ-Y-130h: % Funktion(en) noch fuer anon aufrufbar', v_anon;
  end if;

  -- (b) Trigger-Guards und der Validator sind auch für `authenticated` gesperrt.
  select count(*) into v_guards_open
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and format('public.%s(%s)', p.proname, oidvectortypes(p.proargtypes)) = any (array[
       'public.enforce_project_responsible_user_in_tenant()',
       'public.prevent_dependency_cycle()',
       'public.prevent_work_item_parent_cycle()',
       'public._valid_method_keys()'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_guards_open <> 0 then
    raise exception 'PROJ-Y-130h: % Trigger-Guard(s) noch fuer authenticated aufrufbar', v_guards_open;
  end if;

  -- (c) Gegenrichtung, und die eigentliche Absicherung: die sechs Rollen-Helfer
  --     MUESSEN für `authenticated` aufrufbar bleiben. Ohne diese Probe wäre ein
  --     zu breites revoke oben still durchgegangen und hätte jede RLS-Policy
  --     gebrochen. Verglichen wird gegen die Zahl der vorhandenen Helfer, nicht
  --     gegen eine feste 6 — sonst wäre die Probe in einer Umgebung ohne alle
  --     Helfer falsch-rot.
  select count(*) into v_helpers_present
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and format('public.%s(%s)', p.proname, oidvectortypes(p.proargtypes)) = any (array[
       'public.is_tenant_admin(uuid)', 'public.is_tenant_member(uuid)',
       'public.has_tenant_role(uuid, text)', 'public.is_project_member(uuid)',
       'public.is_project_lead(uuid)', 'public.has_project_role(uuid, text)']);
  select count(*) into v_helpers_kept
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and format('public.%s(%s)', p.proname, oidvectortypes(p.proargtypes)) = any (array[
       'public.is_tenant_admin(uuid)', 'public.is_tenant_member(uuid)',
       'public.has_tenant_role(uuid, text)', 'public.is_project_member(uuid)',
       'public.is_project_lead(uuid)', 'public.has_project_role(uuid, text)'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_helpers_kept <> v_helpers_present then
    raise exception
      'PROJ-Y-130h: nur % von % vorhandenen Rollen-Helfern fuer authenticated aufrufbar — zu breit entzogen',
      v_helpers_kept, v_helpers_present;
  end if;

  raise notice
    'PROJ-Y-130h: ACL-Paritaet geprueft (anon 0, Guards gesperrt, %/% Helfer erhalten)',
    v_helpers_kept, v_helpers_present;
end $$;
