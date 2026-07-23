-- PROJ-103 — Phasenübergreifende Aufgaben- und Engpass-Übersicht (VIEW-class, DUP→REUSE).
--
-- No new table/field/dep. ONE read-only SECURITY INVOKER aggregation over live
-- core objects — work_items (PROJ-9/101/102), phases (PROJ-19), workstreams
-- (PROJ-102). Mirrors the deployed risk_measure_overview (PROJ-109) and
-- workstream_dashboard (PROJ-102/104) patterns.
--
-- Because it runs as the CALLER (security invoker) and joins work_items, the
-- RESTRICTIVE need-to-know gate on work_items (PROJ-100a) filters rows BEFORE
-- aggregation — a task the caller may not see appears in neither the table, the
-- Top-3, nor the export. phases/workstreams joins are LEFT JOINs, so a
-- confidential phase/workstream the caller cannot see simply blanks its label;
-- the task itself stays gated by the work_items gate. No second permission model.
--
-- Returns jsonb { tasks: [...], top_bottlenecks: [...], summary: {...} }:
--   * tasks           — every OPEN task (status todo/in_progress/blocked) with
--                       workstream/phase labels + days_overdue + disjoint date
--                       buckets + is_blocked (orthogonal). AC1.
--   * top_bottlenecks — up to 3 oldest overdue tasks (days_overdue desc). AC3.
--   * summary         — open/overdue/due_today/due_this_week/blocked counts.
--
-- MUST be called with the session-bound user client, NEVER service-role.

create or replace function public.project_task_bottlenecks(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $f$
  with base as (
    -- work_items RESTRICTIVE confidentiality gate applies row-wise (INVOKER ctx).
    -- Open work only — done/cancelled tasks are not bottlenecks.
    select
      wi.id,
      wi.title,
      wi.kind,
      wi.status,
      wi.due_date,
      wi.responsible_user_id,
      wi.phase_id,
      ph.name  as phase_name,
      wi.workstream_id,
      ws.label as workstream_label,
      wi.confidentiality_level,
      -- days over the due date (0 when not overdue / no due date)
      case
        when wi.due_date is not null and wi.due_date < current_date
          then (current_date - wi.due_date)
        else 0
      end as days_overdue,
      -- disjoint date buckets (a blocked task can ALSO be overdue → is_blocked
      -- is orthogonal, kept separate so the chips can overlap correctly)
      (wi.due_date is not null and wi.due_date < current_date) as is_overdue,
      (wi.due_date = current_date) as is_due_today,
      (wi.due_date is not null
        and wi.due_date > current_date
        and wi.due_date <= (current_date + (7 - extract(isodow from current_date))::int)
      ) as is_due_this_week,
      (wi.status = 'blocked') as is_blocked
    from public.work_items wi
    left join public.phases ph on ph.id = wi.phase_id
    left join public.workstreams ws on ws.id = wi.workstream_id
    where wi.project_id = p_project_id
      and wi.is_deleted = false
      and wi.status in ('todo', 'in_progress', 'blocked')
  ),
  ordered as (
    select b.*
    from base b
    order by b.is_overdue desc, b.days_overdue desc, b.due_date asc nulls last, b.title
  )
  select jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'title', o.title,
        'kind', o.kind,
        'status', o.status,
        'due_date', o.due_date,
        'days_overdue', o.days_overdue,
        'responsible_user_id', o.responsible_user_id,
        'phase_id', o.phase_id,
        'phase_name', o.phase_name,
        'workstream_id', o.workstream_id,
        'workstream_label', o.workstream_label,
        'confidentiality_level', o.confidentiality_level,
        'is_overdue', o.is_overdue,
        'is_due_today', o.is_due_today,
        'is_due_this_week', o.is_due_this_week,
        'is_blocked', o.is_blocked
      ))
      from ordered o
    ), '[]'::jsonb),
    'top_bottlenecks', coalesce((
      select jsonb_agg(t)
      from (
        select jsonb_build_object(
          'id', o.id,
          'title', o.title,
          'workstream_label', o.workstream_label,
          'phase_name', o.phase_name,
          'responsible_user_id', o.responsible_user_id,
          'due_date', o.due_date,
          'days_overdue', o.days_overdue
        ) as t
        from ordered o
        where o.is_overdue
        order by o.days_overdue desc, o.due_date asc, o.title
        limit 3
      ) top3
    ), '[]'::jsonb),
    'summary', (
      select jsonb_build_object(
        'open_total', count(*),
        'overdue_total', count(*) filter (where b.is_overdue),
        'due_today_total', count(*) filter (where b.is_due_today),
        'due_this_week_total', count(*) filter (where b.is_due_this_week),
        'blocked_total', count(*) filter (where b.is_blocked)
      )
      from base b
    )
  );
$f$;

revoke execute on function public.project_task_bottlenecks(uuid) from public, anon;
grant execute on function public.project_task_bottlenecks(uuid) to authenticated;

comment on function public.project_task_bottlenecks(uuid) is
  'PROJ-103 — read-only cross-workstream task bottleneck overview (SECURITY '
  'INVOKER; need-to-know inherits via the work_items RESTRICTIVE gate). Open '
  'tasks (todo/in_progress/blocked) with workstream/phase labels, days_overdue '
  'and disjoint date buckets, plus Top-3 oldest overdue and summary counts. '
  'VIEW-class, no writes.';
