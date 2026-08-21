-- =============================================================================
-- PROJ-Y-130i — die Revisions-Freigabe erreicht auch die mandantenweiten Zweige
-- =============================================================================
-- PROJ-130-γ2 hat die Freigabe `audit_reader_grants` eingeführt und im Lesetor
-- `can_read_audit_entry` an EINER Stelle verdrahtet: dem gemeinsamen Ausgang
--
--   if not (is_project_member(v_project) or has_audit_reader_grant(p_tenant_id))
--     then return false; end if;
--   return _audit_entry_classified_ok(...);
--
-- Der Grundsatz dort: **die Freigabe ersetzt die Mitgliedschaft, nicht die
-- Klassifikation.** Diese Slice ändert daran nichts — sie zieht ihn nur in die
-- Zweige nach, die den gemeinsamen Ausgang gar nicht erreichen, weil sie vorher
-- zurückgeben. γ2 hat das als bewusste Grenze notiert.
--
-- WAS GEMESSEN WURDE, UND WARUM DER ZUSCHNITT ANDERS AUSFÄLLT ALS NOTIERT
-- ---------------------------------------------------------------------------
-- Die Notiz sprach von „9 weiteren Einzel-Ersetzungen". Live sind es **10** —
-- `construction_trades` kam mit PROJ-45-α zwei Tage nach γ2 hinzu. Die Zahl
-- wächst mit jeder Slice, die einen mandantenweiten Katalog anlegt; deshalb
-- zählt diese Migration die Treffer, statt sich auf eine Zahl zu verlassen.
--
-- Wichtiger ist die zweite Messung. Die Zweige teilen sich in drei Formen:
--
--   A  `return is_tenant_member(p_tenant_id)`  — 10 Kataloge, mitglieds-sichtbar
--   B  `return is_tenant_admin(p_tenant_id)`   — 2 Skill-Kataloge, admin-only
--   C  `return false`                          — u. a. tenants, tenant_settings
--
-- Klasse A ist der registrierte Umfang und trägt in Prod **6** Audit-Zeilen.
-- Klasse C trägt **104** — darunter **5 Umschaltungen von
-- `audit_lifecycle_exempt`**, also genau des Schalters, den PROJ-Y-130h
-- auditpflichtig gemacht hat mit der Begründung, „wer die Ausnahme setzt, kann
-- seine eigene Spur nicht verwischen". Lesen durfte ihn bisher **nur** die
-- Mandanten-Administration — dieselbe Gruppe, die ihn setzt. Ein eingesetzter
-- Prüfer sah ihn nicht. Das ist der eigentliche Befund dieser Slice.
--
-- Nutzer-Entscheid daher: A **plus** die mandantenweite Konfiguration, aber
-- ohne `resources` und ohne die zwei Skill-Kataloge.
--
--   `tenants`/`tenant_settings`/die zwei Overrides sind Konfiguration. Inhalt
--   live geprüft, nicht vermutet: Branding, Sprache, `active_modules`,
--   `privacy_defaults`, `ai_provider_config` (Modell + Anbieter, **kein**
--   Schlüsselmaterial) und die exempt-Umschaltungen. Keine Personendaten.
--
--   `resources` bleibt draußen: dort stehen `display_name` und Tagessätze, also
--   Personendaten — und die Redaktion existiert nur im Export und nur für
--   `stakeholders` (`CLASS_3_STAKEHOLDER_FIELDS`), während Bericht und Verlauf
--   überhaupt nicht redigieren. Ein Zweig hier wäre Klartext an einen
--   möglicherweise externen Prüfer.
--
--   Die zwei Skill-Kataloge bleiben draußen, weil sie an `is_tenant_admin`
--   hängen: die Freigabe ersetzt die Mitgliedschaft, nicht die Rolle. Dieselbe
--   Linie zieht γ4 beim Export, wo `redaction_off` Admin-Vorbehalt bleibt.
--
-- ZWEI FORMEN, ZWEI BEDEUTUNGEN — die Ersetzung ist nicht einheitlich
-- ---------------------------------------------------------------------------
-- Klasse A wird zu `is_tenant_member(...) OR has_audit_reader_grant(...)`: die
-- Mitgliedschaft bleibt der reguläre Weg, die Freigabe tritt daneben.
-- Klasse C wird zu **nur** `has_audit_reader_grant(...)`: diese Zweige sind
-- absichtlich nicht mitglieds-sichtbar, ein `OR is_tenant_member` würde jedem
-- Mandanten-Mitglied die Konfigurationshistorie öffnen — eine Ausweitung, die
-- niemand beschlossen hat. Die Administration kommt weiterhin über den
-- Kurzschluss in Zeile 1 herein, nicht über diese Zweige.
--
-- Übersprungen wird nichts: `_audit_entry_classified_ok` hat 24 Zweige und
-- kennt **keinen** der 14 hier betroffenen Typen (live gezählt = 0). Die frühen
-- Rückgaben umgehen also keine existierende Prüfung.
--
-- ANKER-FORM
-- ---------------------------------------------------------------------------
-- Ersetzt wird aus der **Live-Definition**, mit whitespace-toleranten Ankern
-- (`\s+` je Trennstelle) statt literalem `replace`. Grund ist PROJ-Y-115c: dort
-- traf ein literaler Anker in Prod (einzeilig) und brach im Fresh-Apply, wo
-- dieselbe Verzweigung mehrzeilig geschrieben stand. Jeder Anker wird gezählt;
-- weicht die Zahl ab, bricht die Migration laut ab statt still nichts zu tun.
-- =============================================================================
do $mig$
declare
  d text;
  v_cnt int;
  v_entity text;
  -- Nur mandantenweite KONFIGURATION. `resources` fehlt hier bewusst
  -- (display_name + Tagessaetze = Personendaten, nirgends redigiert).
  v_config_entities text[] := array[
    'tenants',
    'tenant_settings',
    'tenant_project_type_overrides',
    'tenant_method_overrides'
  ];
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'can_read_audit_entry';

  if d is null then
    raise exception 'PROJ-Y-130i: can_read_audit_entry nicht gefunden';
  end if;

  if position('projy130i' in d) > 0 then
    raise notice 'PROJ-Y-130i: bereits angewendet, uebersprungen';
    return;
  end if;

  -- (1) Klasse A - die mandantenweiten Kataloge. Zahl wird gemessen, nicht
  --     angenommen: die Notiz sagte 9, live sind es 10, und sie waechst mit
  --     jeder Slice, die einen Katalog anlegt.
  select count(*) into v_cnt
  from regexp_matches(d, $re$return\s+public\.is_tenant_member\s*\(\s*p_tenant_id\s*\)\s*;$re$, 'g');
  if v_cnt < 1 then
    raise exception 'PROJ-Y-130i: kein Katalog-Zweig der Form is_tenant_member gefunden - Vorlage hat sich verschoben';
  end if;
  raise notice 'PROJ-Y-130i: % Katalog-Zweig(e) der Klasse A', v_cnt;
  d := regexp_replace(
         d,
         $re$return\s+public\.is_tenant_member\s*\(\s*p_tenant_id\s*\)\s*;$re$,
         $rp$return public.is_tenant_member(p_tenant_id) or public.has_audit_reader_grant(p_tenant_id); /* projy130i */$rp$,
         'g');

  -- (2) Klasse C - die vier Konfigurations-Zweige. Hier steht KEIN
  --     `or is_tenant_member`: diese Zweige sind absichtlich nicht
  --     mitglieds-sichtbar, die Administration kommt ueber den Kurzschluss in
  --     Zeile 1 herein. Jeder Anker muss genau EINMAL treffen.
  foreach v_entity in array v_config_entities loop
    select count(*) into v_cnt
    from regexp_matches(
      d,
      $re$when\s+'$re$ || v_entity || $re$'\s+then\s+return\s+false\s*;$re$,
      'g');
    if v_cnt <> 1 then
      raise exception 'PROJ-Y-130i: Anker fuer % traf % mal statt genau einmal', v_entity, v_cnt;
    end if;
    d := regexp_replace(
           d,
           $re$when\s+'$re$ || v_entity || $re$'\s+then\s+return\s+false\s*;$re$,
           $rp$when '$rp$ || v_entity || $rp$' then return public.has_audit_reader_grant(p_tenant_id); /* projy130i */$rp$);
  end loop;

  execute d;

  -- Re-Grant in derselben Migration (Hausregel): das Lesetor wird von der
  -- RLS-Policy auf `audit_log_entries` aufgerufen, ein verlorener Grant
  -- schliesst den Verlauf fuer alle. `anon` bleibt entzogen.
  execute 'revoke execute on function public.can_read_audit_entry(text, uuid, uuid) from public, anon';
  execute 'grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated';

  raise notice 'PROJ-Y-130i: Lesetor neu angelegt und Rechte gesetzt';
end $mig$;

-- =============================================================================
-- Post-Conditions - der Zustand wird geprueft, nicht angenommen. Sie sichern
-- beide Richtungen: dass die gewollten Zweige offen sind UND dass die bewusst
-- ausgeschlossenen zu bleiben.
-- =============================================================================
do $post$
declare
  d text;
  v_a int;
  v_bare int;
  v_grant int;
  v_when int;
  v_entity text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'can_read_audit_entry';

  -- (a) Klasse A: kombinierte Form vorhanden, blanke Form verschwunden.
  select count(*) into v_a from regexp_matches(
    d, $re$is_tenant_member\s*\(\s*p_tenant_id\s*\)\s+or\s+public\.has_audit_reader_grant$re$, 'g');
  select count(*) into v_bare from regexp_matches(
    d, $re$return\s+public\.is_tenant_member\s*\(\s*p_tenant_id\s*\)\s*;$re$, 'g');
  if v_a < 1 or v_bare <> 0 then
    raise exception 'PROJ-Y-130i: Klasse A nicht sauber ersetzt (kombiniert=%, blank=%)', v_a, v_bare;
  end if;

  -- (b) Die vier Konfigurations-Zweige tragen die Freigabe.
  foreach v_entity in array array['tenants','tenant_settings',
                                  'tenant_project_type_overrides','tenant_method_overrides'] loop
    if d !~ ($re$when\s+'$re$ || v_entity || $re$'\s+then\s+return\s+public\.has_audit_reader_grant$re$) then
      raise exception 'PROJ-Y-130i: Zweig % traegt die Freigabe nicht', v_entity;
    end if;
  end loop;

  -- (c) Die bewussten Ausschluesse stehen unveraendert. Ohne diese Probe wuerde
  --     eine spaetere unachtsame Ersetzung sie oeffnen, ohne dass es auffaellt.
  if d !~ $re$when\s+'resources'\s+then\s+return\s+false\s*;$re$ then
    raise exception 'PROJ-Y-130i: der resources-Zweig ist nicht mehr geschlossen - Personendaten';
  end if;
  if d !~ $re$when\s+'skill_examples'\s+then\s+return\s+public\.is_tenant_admin$re$
     or d !~ $re$when\s+'skill_knowledge_links'\s+then\s+return\s+public\.is_tenant_admin$re$ then
    raise exception 'PROJ-Y-130i: ein Skill-Katalog haengt nicht mehr an is_tenant_admin';
  end if;

  -- (d) Der gemeinsame Ausgang aus g1/g2 ist unberuehrt.
  if d !~ $re$is_project_member\s*\(\s*v_project\s*\)\s+or\s+public\.has_audit_reader_grant$re$ then
    raise exception 'PROJ-Y-130i: der gemeinsame Ausgang aus gamma2 fehlt';
  end if;
  if position('_audit_entry_classified_ok' in d) = 0 then
    raise exception 'PROJ-Y-130i: die gamma1-Klassifikationspruefung fehlt';
  end if;
  if d !~ $re$else\s+return\s+false\s*;$re$ then
    raise exception 'PROJ-Y-130i: der else-Zweig (unbekannter entity_type) fehlt';
  end if;

  -- (e) Geschwister-Zweige erhalten: die Zahl der `when` darf sich nicht
  --     bewegen, sonst hat die Ersetzung einen Zweig verschluckt.
  select count(*) into v_when from regexp_matches(d, $re$when\s$re$, 'g');
  if v_when < 60 then
    raise exception 'PROJ-Y-130i: nur % when-Zweige - Zweige verloren', v_when;
  end if;

  -- (f) Rechte: authenticated ja, anon nein.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_read_audit_entry'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'PROJ-Y-130i: Rechte am Lesetor stimmen nicht (authenticated fehlt oder anon offen)';
  end if;

  select count(*) into v_grant from regexp_matches(d, $re$has_audit_reader_grant$re$, 'g');
  raise notice 'PROJ-Y-130i: OK - Klasse A %, Konfigurations-Zweige 4, has_audit_reader_grant % Vorkommen, % when-Zweige',
    v_a, v_grant, v_when;
end $post$;
