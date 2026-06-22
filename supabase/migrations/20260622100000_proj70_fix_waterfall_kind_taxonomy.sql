-- PROJ-70 hotfix (found by the PROJ-136 golden-path smoke, 2026-06-22):
-- align the waterfall kind taxonomy in accept_proposal_from_context_bulk to the
-- authoritative method-template (src/lib/method-templates/waterfall.ts:
-- allowedAiKinds = work_package/task/bug — all valid work_items kinds).
--
-- THE BUG: the RPC validated waterfall = ('phase','work_package','todo') and the
-- AI prompts instructed the model to emit phase/todo, but work_items.kind_check
-- only allows epic/feature/story/task/subtask/bug/work_package. So every
-- waterfall AI-backlog containing a phase or todo failed at accept with
-- 23514 (method_kind_incompatible / work_items_kind_check). Proven: 0 work_items
-- with kind phase/todo across all of prod; all 43 accepted backlogs were
-- scrum/hybrid. The first ERP pilot is waterfall -> pilot-blocking.
--
-- FIX: waterfall now validates ('work_package','task','bug'). Phases belong to
-- the separate phases table (PROJ-19), not the backlog; todo -> task. The AI
-- schema enums + prompts are aligned in the same change (TS side).
--
-- In-place anchor-replace on the deployed SECURITY DEFINER function; the scrum
-- branch is untouched. Self-verifying.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.accept_proposal_from_context_bulk(uuid,uuid[],boolean)'::regprocedure) into v_def;
  v_def := replace(v_def, '(''phase'',''work_package'',''todo'')', '(''work_package'',''task'',''bug'')');
  v_def := replace(v_def, 'requires kind in (phase, work_package, todo).', 'requires kind in (work_package, task, bug).');
  if position('(''phase'',''work_package'',''todo'')' in v_def) > 0 then
    raise exception 'PROJ-70 waterfall taxonomy patch failed: old anchor still present';
  end if;
  if position('(''work_package'',''task'',''bug'')' in v_def) = 0 then
    raise exception 'PROJ-70 waterfall taxonomy patch failed: new anchor missing';
  end if;
  execute v_def;
end $$;
