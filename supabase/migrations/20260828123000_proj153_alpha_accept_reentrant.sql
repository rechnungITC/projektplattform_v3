-- PROJ-153-α Fix-forward 3: zwei Annahmen in EINER Transaktion.
--
-- Dritter Fund desselben Pflicht-Live-Smokes. `on commit drop` verwirft die
-- Arbeitstabelle erst beim Commit, nicht beim Verlassen der Funktion — ein
-- zweiter Aufruf in derselben Transaktion scheitert mit 42P07
-- ("relation already exists").
--
-- Über HTTP heute nicht erreichbar: jede Anfrage ist ihre eigene Transaktion.
-- Aber die Einschränkung steht nirgends, und der nächste Aufrufer, der zwei
-- Annahmen zusammenfassen will (etwa ein orchestriertes "alles annehmen" in
-- einer Transaktion), liefe hinein. Eine Funktion, die nur einmal je
-- Transaktion aufrufbar ist, muss das entweder sagen oder es nicht sein — hier
-- ist "nicht sein" zwei Zeilen billig.
--
-- Bestandsbefund, NICHT hier behoben: `accept_proposal_from_context_bulk`
-- (PROJ-70) trägt dasselbe Muster mit `_accept_working`. Fremde, deployte
-- Slice; als Followup registriert statt nebenbei angefasst.

do $$
declare
  v_def text;
  v_new text;
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_work_items_from_intent_bulk';

  if v_def is null then
    raise exception 'PROJ-153: accept_work_items_from_intent_bulk nicht gefunden.';
  end if;

  if v_def like '%drop table if exists _intent_accept_working%' then
    raise notice 'PROJ-153: Funktion ist bereits mehrfach aufrufbar.';
    return;
  end if;

  v_hits := (length(v_def) - length(replace(v_def, 'create temporary table _intent_accept_working', '')))
            / length('create temporary table _intent_accept_working');
  if v_hits <> 1 then
    raise exception 'PROJ-153: Anker nicht eindeutig (% Treffer).', v_hits;
  end if;

  v_new := replace(
    v_def,
    'create temporary table _intent_accept_working',
    'drop table if exists _intent_accept_working;' || chr(10) ||
    '  create temporary table _intent_accept_working'
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
  where n.nspname = 'public' and p.proname = 'accept_work_items_from_intent_bulk';

  if v_def not like '%drop table if exists _intent_accept_working%' then
    raise exception 'PROJ-153: Mehrfach-Aufruf nicht behoben.';
  end if;
  if v_def not like '%ki_provenance%'
     or v_def not like '%topological_sort_failed%'
     or v_def not like '%method_kind_incompatible%'
     or v_def not like '%work_items_from_project_intent%' then
    raise exception 'PROJ-153: ein tragender Zweig ist beim Ersetzen verloren gegangen.';
  end if;
  raise notice 'PROJ-153: Funktion mehrfach aufrufbar, alle Zweige erhalten.';
end
$$;
