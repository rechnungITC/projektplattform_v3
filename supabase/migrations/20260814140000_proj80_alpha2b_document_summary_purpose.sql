-- PROJ-80-α.2b — neuer AI-Zweck `document_summary` (Quintessenz)
--
-- **Lockstep, nicht optional.** CLAUDE.md hält fest, warum: ein Zweck, der nur
-- in einer der beiden Prüfregeln steht, 5xx't in Produktion — genau so
-- geschehen für `sentiment`/`coaching`, die seit PROJ-34 aus
-- `ki_runs_purpose_check` fehlten und erst in PROJ-88 nachgetragen wurden.
-- Deshalb beide Constraints in DERSELBEN Migration.
--
-- Anker ist jeweils der jüngste Zweck (`clarifying_questions_from_context`,
-- PROJ-135). Whitespace-tolerant und mit Treffer-Eindeutigkeit, weil eine frisch
-- aus den Migrationsdateien gebaute Datenbank anders umbrechen kann als Prod
-- (PROJ-Y-115c-Lehre), und mit Post-Verifikation, weil eine stillschweigend
-- fehlgeschlagene Ersetzung sonst wie Erfolg aussieht (PROJ-Y-122a-Lehre).

do $$
declare
  v_spec record;
  v_def text;
  v_new text;
  v_anchor_re constant text := '(''clarifying_questions_from_context''(::text)?)';
  v_matches int;
begin
  for v_spec in
    select 'ki_runs'::text as tbl, 'ki_runs_purpose_check'::text as con
    union all
    select 'tenant_ai_cost_caps', 'tenant_ai_cost_caps_purpose_check'
  loop
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint where conname = v_spec.con;
    if v_def is null then
      raise exception 'PROJ-80: % nicht gefunden', v_spec.con;
    end if;

    if v_def like '%document_summary%' then
      raise notice 'PROJ-80: % trägt den Zweck bereits', v_spec.con;
    else
      select count(*) into v_matches from regexp_matches(v_def, v_anchor_re, 'g');
      if v_matches <> 1 then
        raise exception 'PROJ-80: Anker in % % mal getroffen, erwartet 1', v_spec.con, v_matches;
      end if;
      v_new := regexp_replace(v_def, v_anchor_re, '\1, ''document_summary''::text');
      execute format('alter table public.%I drop constraint %I', v_spec.tbl, v_spec.con);
      execute format('alter table public.%I add constraint %I %s', v_spec.tbl, v_spec.con, v_new);
    end if;

    -- Post-Verifikation je Tabelle, nicht erst am Ende: sonst könnte die zweite
    -- Ersetzung die erste überdecken.
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint where conname = v_spec.con;
    if v_def not like '%document_summary%'
       or v_def not like '%clarifying_questions_from_context%'
       or v_def not like '%narrative%' then
      raise exception 'PROJ-80: % nach der Ersetzung unvollständig', v_spec.con;
    end if;
  end loop;
end $$;

-- Verhaltensprobe statt Textprobe: die Regeln müssen den neuen Wert wirklich
-- annehmen und einen erfundenen wirklich ablehnen. Beides in einer
-- zurückgerollten Unter-Transaktion, damit nichts zurückbleibt.
do $$
declare
  v_tenant uuid;
  v_ok boolean := false;
  v_rejected boolean := false;
begin
  select id into v_tenant from public.tenants limit 1;
  if v_tenant is null then
    raise notice 'PROJ-80: kein Mandant vorhanden — Verhaltensprobe übersprungen';
    return;
  end if;

  begin
    insert into public.tenant_ai_cost_caps (tenant_id, purpose, monthly_input_token_cap)
      values (v_tenant, 'document_summary', 1);
    v_ok := true;
    raise exception 'PROJ80_ROLLBACK';
  exception
    when others then
      if sqlerrm = 'PROJ80_ROLLBACK' then
        null; -- gewollter Rollback der Probe-Zeile
      elsif sqlstate = '23514' then
        raise exception 'PROJ-80: die Regel lehnt den NEUEN Zweck ab — Ersetzung hat nicht gegriffen';
      else
        -- Alles andere ist ein Fehler der Probe selbst (falsche Spalte o. ä.)
        -- und darf nicht als "Zweck abgelehnt" durchgehen.
        raise exception 'PROJ-80: Verhaltensprobe fehlerhaft (%): %', sqlstate, sqlerrm;
      end if;
  end;

  begin
    insert into public.tenant_ai_cost_caps (tenant_id, purpose, monthly_input_token_cap)
      values (v_tenant, 'erfundener_zweck', 1);
    raise exception 'PROJ-80: erfundener Zweck wurde AKZEPTIERT — die Regel greift nicht';
  exception
    when check_violation then
      v_rejected := true;
    when others then
      if sqlerrm like 'PROJ-80:%' then raise; end if;
      v_rejected := true;
  end;

  if not v_ok or not v_rejected then
    raise exception 'PROJ-80: Verhaltensprobe unschlüssig (ok=%, rejected=%)', v_ok, v_rejected;
  end if;
  raise notice 'PROJ-80: Verhaltensprobe bestanden — neuer Zweck akzeptiert, erfundener abgelehnt';
end $$;
