-- PROJ-153-α Fix-forward: der DRITTE Zweck-CHECK.
--
-- Vom eigenen Pflicht-Live-Smoke gefunden, und der Fund korrigiert die
-- Hausregel: CLAUDE.md nennt für einen neuen Zweck `ki_runs` UND
-- `tenant_ai_cost_caps` — es gibt aber noch `ki_suggestions_purpose_check`.
--
-- Der trägt bewusst nur die Zwecke, die wirklich Vorschläge schreiben (10 von
-- 17): narrative, sentiment, coaching, clarifying_questions_from_context,
-- document_summary und project_chat fehlen dort zu Recht, weil ihr Ergebnis
-- woanders landet. `work_items_from_project_intent` schreibt Vorschläge und
-- gehört daher hinein.
--
-- Wirkung ohne diesen Fix: die Generierung hätte den Lauf angelegt, das Modell
-- gerufen und bezahlt — und wäre erst beim Speichern der Vorschläge mit 23514
-- gescheitert. Also ein 500 NACH der Rechnung. Genau die Klasse Fehler, gegen
-- die die Lockstep-Regel geschrieben wurde, eine Tabelle weiter.

do $$
declare
  v_def text;
  v_anchor constant text := '''proposal_risks_from_context''::text';
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'ki_suggestions_purpose_check';

  if v_def is null then
    raise exception 'PROJ-153: ki_suggestions_purpose_check nicht gefunden.';
  end if;

  if v_def like '%work_items_from_project_intent%' then
    raise notice 'PROJ-153: Zweck steht bereits im Vorschlags-CHECK.';
    return;
  end if;

  if v_def not like '%' || v_anchor || '%' then
    raise exception 'PROJ-153: Anker fehlt in ki_suggestions_purpose_check: %', v_def;
  end if;

  execute 'alter table public.ki_suggestions drop constraint ki_suggestions_purpose_check';
  execute 'alter table public.ki_suggestions add constraint ki_suggestions_purpose_check '
          || replace(v_def, v_anchor,
                     v_anchor || ', ''work_items_from_project_intent''::text');
end
$$;

do $$
declare
  v_def text;
  v_siblings int;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'ki_suggestions_purpose_check';

  if v_def not like '%work_items_from_project_intent%' then
    raise exception 'PROJ-153: Vorschlags-CHECK kennt den Zweck nicht: %', v_def;
  end if;

  select count(*) into v_siblings
  from unnest(array['risks','decisions','work_items','open_items',
                    'trajectory_sequence','resource_swap','cross_project_links',
                    'proposal_from_context','proposal_stakeholders_from_context',
                    'proposal_risks_from_context']) as s
  where v_def like '%''' || s || '''%';

  if v_siblings <> 10 then
    raise exception 'PROJ-153: nur % von 10 Bestandswerten erhalten.', v_siblings;
  end if;

  raise notice 'PROJ-153: Vorschlags-CHECK traegt 11 Werte, 10 Geschwister erhalten.';
end
$$;
