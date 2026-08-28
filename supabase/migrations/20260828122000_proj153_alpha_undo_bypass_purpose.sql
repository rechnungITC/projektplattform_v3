-- PROJ-153-α Fix-forward 2: der VIERTE Ort, an dem ein Zweck stehen muss.
--
-- Ebenfalls vom eigenen Pflicht-Live-Smoke gefunden, unmittelbar nach dem
-- dritten. `enforce_ki_suggestion_immutability` führt eine EIGENE, hartkodierte
-- Zweckliste für den kontrollierten Rückgängig-Ausweg. Steht ein Zweck dort
-- nicht, ist sein Rückgängig strukturell unmöglich — die Funktion existiert,
-- läuft, und scheitert am Trigger.
--
-- Damit ist der Lockstep für einen vorschlags-schreibenden Zweck VIERSTELLIG:
--   1. ki_runs_purpose_check
--   2. tenant_ai_cost_caps_purpose_check
--   3. ki_suggestions_purpose_check
--   4. enforce_ki_suggestion_immutability (Rückgängig-Ausweg)
-- CLAUDE.md nennt nur die ersten beiden. Die Regel gehört korrigiert.
--
-- Anker-Ersetzung aus der LIVE-Definition statt Neuschreiben: die Funktion
-- trägt neben dem Ausweg noch die Spalten-Unveränderlichkeit, und ein
-- Abschreiben aus der Erinnerung verliert regelmäßig Zweige (Hausregel
-- "Patching a deployed function: replace from live, never retype").

do $$
declare
  v_def text;
  v_new text;
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enforce_ki_suggestion_immutability';

  if v_def is null then
    raise exception 'PROJ-153: enforce_ki_suggestion_immutability nicht gefunden.';
  end if;

  if v_def like '%work_items_from_project_intent%' then
    raise notice 'PROJ-153: Zweck steht bereits im Rueckgaengig-Ausweg.';
    return;
  end if;

  v_hits := (length(v_def) - length(replace(v_def, '''proposal_risks_from_context''', '')))
            / length('''proposal_risks_from_context''');
  if v_hits <> 1 then
    raise exception 'PROJ-153: Anker nicht eindeutig (% Treffer) — Abbruch.', v_hits;
  end if;

  v_new := replace(
    v_def,
    '''proposal_risks_from_context''',
    '''proposal_risks_from_context'',' || chr(10) ||
    '         ''work_items_from_project_intent'''
  );

  execute v_new;
end
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'enforce_ki_suggestion_immutability';

  if v_def not like '%work_items_from_project_intent%' then
    raise exception 'PROJ-153: Zweck fehlt im Rueckgaengig-Ausweg.';
  end if;
  if v_def not like '%proposal_from_context%'
     or v_def not like '%proposal_stakeholders_from_context%'
     or v_def not like '%proposal_risks_from_context%' then
    raise exception 'PROJ-153: ein Bestandszweck ist aus dem Ausweg verschwunden.';
  end if;
  if v_def not like '%immutable columns cannot change%' then
    raise exception 'PROJ-153: die Spalten-Unveraenderlichkeit ist verloren gegangen.';
  end if;
  if v_def not like '%are sealed and cannot be updated%' then
    raise exception 'PROJ-153: die Versiegelung ist verloren gegangen.';
  end if;

  raise notice 'PROJ-153: Rueckgaengig-Ausweg traegt 4 Zwecke, beide Sperren erhalten.';
end
$$;
