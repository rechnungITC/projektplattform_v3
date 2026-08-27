-- PROJ-Y-130s — Geisterspalten aus der Audit-Whitelist entfernen, PII-freie reale Spalten aufnehmen.
--
-- `_tracked_audit_columns` nannte 58 Spalten, die es nicht gibt. `record_audit_changes` macht
-- `to_jsonb(OLD) -> v_col`; ein fehlender Schluessel liefert SQL-NULL, und `NULL is distinct from
-- NULL` ist false — die Feldaenderung wurde lautlos nicht protokolliert. Ursprung ist eine
-- Whitelist-Regression in PROJ-21 (20260501140000), nicht Schema-Drift.
--
-- Anker-Ersetzung aus der LIVE-Definition (CLAUDE.md: never retype). Anker whitespace-tolerant,
-- weil ein literaler Anker in PROJ-Y-115c in Prod traf und im Fresh-Apply brach. Jede Ersetzung
-- zaehlt ihre Treffer und bricht bei != 1 laut ab. `record_audit_changes` bleibt unberuehrt.
--
-- PII ist bewusst NICHT aufgenommen (resources.display_name, vendors.primary_contact_email):
-- die Class-3-Redaktion deckt laut PROJ-Y-130r nur `stakeholders` in nur der Export-Flaeche ab,
-- und der Trail hat seit PROJ-130-alpha keinen Loeschpfad. -> PROJ-Y-130s-beta.

do $mig$
declare
  d text;
  v_before_branches int;
  v_after_branches int;
  v_hits int;
  v_ghosts int;
  v_grant_before boolean;
  r record;
  -- Zieltabelle -> neuer Zweig. Alte Liste minus Geister, plus PII-freie reale Spalten.
  repl constant text[][] := array[
    ['work_items',                    $q$array['trade_id','section_id','title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','confidentiality_level','is_deleted','planned_start','planned_end','wbs_code','release_id','due_date','workstream_id']$q$],
    ['communication_outbox',          $q$array['status','subject','body','channel','sent_at']$q$],
    ['resources',                     $q$array['linked_user_id','daily_rate_override','daily_rate_override_currency','organization_unit_id','kind','fte_default','availability_default','is_active']$q$],
    ['work_item_resources',           $q$array['allocation_pct']$q$],
    ['tenant_project_type_overrides', $q$array['overrides']$q$],
    ['tenant_method_overrides',       $q$array['enabled']$q$],
    ['vendors',                       $q$array['name','category','status','website']$q$],
    ['vendor_project_assignments',    $q$array['role','valid_from','valid_until']$q$],
    ['vendor_evaluations',            $q$array['score','comment','criterion']$q$],
    ['vendor_documents',              $q$array['kind','title','external_url','document_date']$q$],
    ['compliance_tags',               $q$array['key','description','display_name','is_active','default_child_kinds','template_keys','is_platform_default']$q$],
    ['work_item_documents',           $q$array['title','kind']$q$],
    ['budget_postings',               $q$array['amount','currency','posted_at','reverses_posting_id']$q$],
    ['vendor_invoices',               $q$array['vendor_id','invoice_number','currency','invoice_date','gross_amount','file_storage_key']$q$]
  ];
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_tracked_audit_columns';

  if d is null then
    raise exception 'PROJ-Y-130s: _tracked_audit_columns nicht gefunden';
  end if;

  select count(*) into v_before_branches
  from regexp_matches(d, $$when\s+'[a-z_]+'\s+then\s+array\[$$, 'g');

  select has_function_privilege('authenticated', p.oid, 'EXECUTE') into v_grant_before
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_tracked_audit_columns';

  for i in 1 .. array_length(repl, 1) loop
    select count(*) into v_hits
    from regexp_matches(d, $$when\s+$$ || quote_literal(repl[i][1]) || $$\s+then\s+array\[[^\]]*\]$$, 'g');

    if v_hits <> 1 then
      raise exception 'PROJ-Y-130s: Anker fuer % traf % mal (erwartet 1) — abgebrochen',
        repl[i][1], v_hits;
    end if;

    d := regexp_replace(
      d,
      $$when\s+$$ || quote_literal(repl[i][1]) || $$\s+then\s+array\[[^\]]*\]$$,
      'when ' || quote_literal(repl[i][1]) || ' then ' || repl[i][2]
    );
  end loop;

  -- Zweigzahl darf sich nicht aendern: wir ersetzen, wir fuegen nicht hinzu und loeschen nicht.
  select count(*) into v_after_branches
  from regexp_matches(d, $$when\s+'[a-z_]+'\s+then\s+array\[$$, 'g');

  if v_after_branches <> v_before_branches then
    raise exception 'PROJ-Y-130s: Zweigzahl % -> % veraendert — abgebrochen',
      v_before_branches, v_after_branches;
  end if;

  execute d;

  -- Post-Condition 1: kein Geist mehr, ueber ALLE Zweige (nicht nur die 14 bearbeiteten).
  v_ghosts := 0;
  for r in
    select distinct m[1] as tbl
    from regexp_matches(
           (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = '_tracked_audit_columns'),
           $$when\s+'([a-z_]+)'\s+then\s+array\[$$, 'g') as m
  loop
    -- Nur pruefen, wenn die Tabelle existiert; eine fehlende Tabelle ist ein anderer Befund.
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = r.tbl and table_type = 'BASE TABLE') then
      v_ghosts := v_ghosts + (
        select count(*) from unnest(public._tracked_audit_columns(r.tbl)) as c(col)
        where not exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = r.tbl and column_name = c.col)
      );
    end if;
  end loop;

  if v_ghosts <> 0 then
    raise exception 'PROJ-Y-130s: nach der Ersetzung noch % Geisterspalten — abgebrochen', v_ghosts;
  end if;

  -- Post-Condition 2: Grant erhalten (create-or-replace bewahrt ihn, aber gemessen statt geglaubt).
  if v_grant_before and not (
    select has_function_privilege('authenticated', p.oid, 'EXECUTE')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_tracked_audit_columns'
  ) then
    raise exception 'PROJ-Y-130s: authenticated-EXECUTE verloren — abgebrochen';
  end if;

  raise notice 'PROJ-Y-130s: % Zweige, 14 ersetzt, 0 Geisterspalten', v_after_branches;
end $mig$;
