-- PROJ-109 — Maßnahmen-Tracking und Owner-Verantwortung (DUP→REUSE, VIEW-class).
--
-- The "Maßnahme" primitive already exists: a task (work_items, kind='task')
-- linked to a risk via risk_links(linked_kind='work_item') — PROJ-107 shipped
-- this and the live UI already labels it "Aufgaben (Maßnahmen)". work_items
-- carry status/due_date/owner/workstream (PROJ-101/102); risks carry
-- status='accepted' + free-text `mitigation` (begründete Akzeptanz, PROJ-20).
--
-- This slice adds NO new table/field. It adds ONE read-only SECURITY INVOKER
-- aggregation that returns, per risk: its linked measure-tasks + a coverage
-- flag. Because it runs as the CALLER and joins risks/work_items, their
-- existing RESTRICTIVE need-to-know gates (PROJ-100a/107) filter rows BEFORE
-- aggregation — need-to-know inherits for free, no second permission model.
--
-- AC4: per-risk overview (UI groups by risk / risk-owner / workstream).
-- AC3: coverage signal `active_uncovered` (open risk, no measure, no accepted
--      rationale) — SOFT/read-only; the forward-compat contract PROJ-110
--      (stage-gate) will consume. NOT enforced here (spec "Out of Scope").
--
-- No new dep, no new policy. Idempotent (create or replace).

-- Fresh-apply guard: risks.confidentiality_level is added by PROJ-107
-- (20260703135741), but that migration is not fresh-apply-clean in the
-- schema-drift shadow DB — it aborts on a tolerated REVOKE/GRANT-on-missing-
-- function before reaching its own `add column`, so the column is absent when
-- migrations are replayed from files (production has it, applied statement-wise
-- via MCP). This idempotent guard makes THIS migration deterministic regardless
-- of PROJ-107's replay quirk: a no-op in production and in any correct apply
-- order, it only ensures the column exists so the SECURITY INVOKER function body
-- below validates. The need-to-know RESTRICTIVE policies still live in PROJ-107.
alter table public.risks
  add column if not exists confidentiality_level public.ma_confidentiality_level not null default 'standard';

create or replace function public.risk_measure_overview(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $f$
  with r as (
    -- risks RESTRICTIVE confidentiality gate applies row-wise in INVOKER ctx.
    select rk.id, rk.title, rk.status, rk.responsible_user_id,
           rk.workstream_id, rk.confidentiality_level, rk.mitigation,
           rk.probability, rk.impact, rk.score
    from public.risks rk
    where rk.project_id = p_project_id
  ),
  m as (
    -- Measures = work_items linked to the risk via risk_links(work_item).
    -- work_items RESTRICTIVE gate applies row-wise; a measure the caller may
    -- not see (higher confidentiality) simply does not appear.
    select rl.risk_id,
           jsonb_agg(jsonb_build_object(
             'id', wi.id,
             'title', wi.title,
             'kind', wi.kind,
             'status', wi.status,
             'due_date', wi.due_date,
             'responsible_user_id', wi.responsible_user_id,
             'workstream_id', wi.workstream_id
           ) order by wi.due_date asc nulls last, wi.title) as measures,
           count(*) as measure_count
    from public.risk_links rl
    join public.work_items wi
      on wi.id = rl.linked_id and wi.is_deleted = false
    where rl.linked_kind = 'work_item'
    group by rl.risk_id
  ),
  rows as (
    select r.*,
      coalesce(m.measures, '[]'::jsonb) as measures,
      coalesce(m.measure_count, 0) as measure_count,
      (coalesce(m.measure_count, 0) > 0) as has_measure,
      (r.status = 'accepted'
        and r.mitigation is not null
        and btrim(r.mitigation) <> '') as accepted_with_rationale
    from r
    left join m on m.risk_id = r.id
  ),
  scored as (
    select rows.*,
      -- covered = has a measure task, OR accepted with a documented rationale,
      -- OR already mitigated/closed.
      (rows.has_measure
        or rows.accepted_with_rationale
        or rows.status in ('mitigated', 'closed')) as covered,
      -- AC3 signal: an ACTIVE (open) risk with neither a measure nor a
      -- documented acceptance → advisory warning; PROJ-110 gate input.
      (rows.status = 'open'
        and not rows.has_measure
        and not (rows.status = 'accepted'
                 and rows.mitigation is not null
                 and btrim(rows.mitigation) <> '')) as active_uncovered
    from rows
  )
  select jsonb_build_object(
    'risks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'status', s.status,
        'responsible_user_id', s.responsible_user_id,
        'workstream_id', s.workstream_id,
        'confidentiality_level', s.confidentiality_level,
        'mitigation', s.mitigation,
        'probability', s.probability,
        'impact', s.impact,
        'score', s.score,
        'measure_count', s.measure_count,
        'has_measure', s.has_measure,
        'accepted_with_rationale', s.accepted_with_rationale,
        'covered', s.covered,
        'active_uncovered', s.active_uncovered,
        'measures', s.measures
      ) order by s.active_uncovered desc, s.score desc, s.title)
      from scored s
    ), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'risk_total', count(*),
        'active_total', count(*) filter (where s.status = 'open'),
        'active_uncovered', count(*) filter (where s.active_uncovered),
        'measure_total', coalesce(sum(s.measure_count), 0)
      )
      from scored s
    )
  );
$f$;

revoke execute on function public.risk_measure_overview(uuid) from public, anon;
grant execute on function public.risk_measure_overview(uuid) to authenticated;

comment on function public.risk_measure_overview(uuid) is
  'PROJ-109 — read-only measures overview per risk (SECURITY INVOKER, need-to-know '
  'inherits via risks/work_items RESTRICTIVE gates). Measure = work_item linked '
  'via risk_links(work_item). active_uncovered = AC3 soft coverage signal '
  '(forward-compat contract for PROJ-110 stage-gate; not enforced here).';
