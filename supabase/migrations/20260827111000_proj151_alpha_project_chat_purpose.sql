-- PROJ-151-α — neuer AI-Zweck `project_chat`.
--
-- LOCKSTEP, nicht optional. CLAUDE.md haelt fest warum: ein Zweck, der nur in einer der
-- beiden Pruefregeln steht, antwortet in Produktion mit 5xx — genau so geschehen fuer
-- `sentiment`/`coaching`, die seit PROJ-34 aus `ki_runs_purpose_check` fehlten und erst in
-- PROJ-88 nachgetragen wurden. Deshalb beide Regeln in DERSELBEN Migration.
--
-- Anker ist der juengste Zweck (`document_summary`, PROJ-80-α). Whitespace-tolerant und mit
-- Treffer-Eindeutigkeit, weil eine frisch aus den Migrationsdateien gebaute Datenbank anders
-- umbrechen kann als Prod (PROJ-Y-115c-Lehre), und mit Post-Verifikation, weil eine still
-- fehlgeschlagene Ersetzung sonst wie Erfolg aussieht (PROJ-Y-122a-Lehre).

do $mig$
declare
  v_spec record;
  v_def text;
  v_new text;
  v_anchor_re constant text := '(''document_summary''(::text)?)';
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
      raise exception 'PROJ-151: % nicht gefunden', v_spec.con;
    end if;

    if v_def like '%project_chat%' then
      raise notice 'PROJ-151: % traegt den Zweck bereits', v_spec.con;
    else
      select count(*) into v_matches from regexp_matches(v_def, v_anchor_re, 'g');
      if v_matches <> 1 then
        raise exception 'PROJ-151: Anker in % % mal getroffen, erwartet 1', v_spec.con, v_matches;
      end if;
      v_new := regexp_replace(v_def, v_anchor_re, '\1, ''project_chat''::text');
      execute format('alter table public.%I drop constraint %I', v_spec.tbl, v_spec.con);
      execute format('alter table public.%I add constraint %I %s', v_spec.tbl, v_spec.con, v_new);
    end if;

    -- Post-Verifikation je Tabelle, nicht erst am Ende: sonst koennte die zweite Ersetzung
    -- die erste ueberdecken. Geschwister-Werte werden mitgeprueft (Clobber-Kontrolle).
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint where conname = v_spec.con;
    if v_def not like '%project_chat%'
       or v_def not like '%document_summary%'
       or v_def not like '%clarifying_questions_from_context%'
       or v_def not like '%narrative%'
       or v_def not like '%sentiment%'
       or v_def not like '%coaching%' then
      raise exception 'PROJ-151: % nach der Ersetzung unvollstaendig', v_spec.con;
    end if;
  end loop;
end $mig$;

-- Verhaltensprobe statt Textprobe. `classification` und `provider` sind in `ki_runs`
-- PFLICHT — ohne sie meldete die Probe einen Fehlalarm ("Zweck wird nicht angenommen"),
-- obwohl die Regel stimmt.
-- Verhaltensprobe statt Textprobe: die Regeln muessen den neuen Wert wirklich annehmen und
-- einen erfundenen wirklich ablehnen. In einer zurueckgerollten Unter-Transaktion, damit
-- nichts zurueckbleibt.
do $probe$
declare
  v_tenant uuid;
  v_project uuid;
  v_user uuid;
  v_ok boolean := false;
  v_rejected boolean := false;
begin
  select t.id into v_tenant from public.tenants t limit 1;
  select p.id, p.responsible_user_id into v_project, v_user
    from public.projects p where p.tenant_id = v_tenant limit 1;
  if v_project is null then
    raise notice 'PROJ-151: kein Projekt zum Proben vorhanden — Verhaltensprobe uebersprungen';
    return;
  end if;

  begin
    insert into public.ki_runs (tenant_id, project_id, purpose, classification, provider, status)
      values (v_tenant, v_project, 'project_chat', 2, 'stub', 'success');
    v_ok := true;
    raise exception 'rollback-marker';
  exception when others then
    if sqlerrm <> 'rollback-marker' then
      raise exception 'PROJ-151: ki_runs nimmt project_chat NICHT an: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.ki_runs (tenant_id, project_id, purpose, classification, provider, status)
      values (v_tenant, v_project, 'kein_echter_zweck', 2, 'stub', 'success');
    raise exception 'PROJ-151: ki_runs nimmt einen erfundenen Zweck an — Regel wirkungslos';
  exception when check_violation then
    v_rejected := true;
  when others then
    if sqlerrm like 'PROJ-151:%' then raise; end if;
    v_rejected := true;
  end;

  if not (v_ok and v_rejected) then
    raise exception 'PROJ-151: Verhaltensprobe unvollstaendig (ok=%, rejected=%)', v_ok, v_rejected;
  end if;
  raise notice 'PROJ-151: Verhaltensprobe bestanden — Zweck akzeptiert, Erfundenes abgelehnt';
end $probe$;
