-- PROJ-141-γ4/γ5 — operative_report RPC with in-DB filter args (M-4/M-5 fix).
--
-- Problem (from Cross-cutting-Audit M-4/M-5):
--   * The FE `filteredReport`-memo filters tasks/deliverables client-side but
--     leaves the Pre-Read kacheln + CSV export + Print page reading raw
--     unfiltered RPC output → the exported CSV is byte-identical regardless of
--     the on-screen filter, and the weekly-steering pre-read counter contradicts
--     what the user actually sees in the list underneath.
--
-- γ4/γ5 fix (Option Alpha, User-locked 2026-07-31): all four filter axes are
-- applied server-side inside the SECURITY-INVOKER `operative_report` RPC.
-- Alternative Option Beta (shared TypeScript lib) would replicate the filter
-- contract at four call sites (FE view, GET route, Export route, Print page)
-- with a permanent drift risk — Alpha is the single source of truth.
--
-- Filter semantics (see PROJ-141 Tech Design γ):
--
--   * p_classification  = cross-cutting → all four sections + pre_read
--   * p_workstream_id   = tasks + deliverables only (no FK on dd_findings/dd_questions)
--   * p_owner_id        = tasks + deliverables only (findings/qa are stream-scoped, no owner)
--   * p_phase_id        = tasks + deliverables only (findings hang on dd_stream, not phase)
--
-- Pre-Read counters recount from the already-filtered CTEs (per-section
-- consistency by construction).
--
-- Backward compatibility: the new 4-arg-with-defaults signature is called with
-- all defaults from the deployed PROJ-132 GET route + Print page → byte-
-- identical passthrough to the old 1-arg RPC. The PROJ-132 live pentest MUST
-- pass verbatim after this migration.
--
-- Need-to-know inheritance is UNCHANGED — the RPC stays SECURITY INVOKER,
-- filters are applied AFTER the RESTRICTIVE `can_access_classified` policies
-- on work_items/dd_findings/dd_questions/deliverables/dd_streams filter rows.
-- A row a caller cannot see appears in NEITHER the filtered nor the unfiltered
-- output — the filter argument narrows the caller-visible set further.

drop function if exists public.operative_report(uuid);

create function public.operative_report(
  p_project_id       uuid,
  p_workstream_id    uuid    default null,
  p_owner_id         uuid    default null,
  p_phase_id         uuid    default null,
  p_classification   text    default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $f$
  with
  -- ---- C1: open tasks (verbatim PROJ-103 project_task_bottlenecks logic) -----
  task_base as (
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
      case
        when wi.due_date is not null and wi.due_date < current_date
          then (current_date - wi.due_date)
        else 0
      end as days_overdue,
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
      and (p_workstream_id is null or wi.workstream_id = p_workstream_id)
      and (p_owner_id      is null or wi.responsible_user_id = p_owner_id)
      and (p_phase_id      is null or wi.phase_id = p_phase_id)
      and (p_classification is null or wi.confidentiality_level::text = p_classification)
  ),
  task_ordered as (
    select b.*
    from task_base b
    order by b.is_overdue desc, b.days_overdue desc, b.due_date asc nulls last, b.title
  ),
  -- ---- G3: open findings (status open/in_review) per stream × severity -------
  -- findings do NOT carry workstream_id/owner/phase — only the classification
  -- filter applies here.
  finding_open as (
    select
      f.id,
      f.dd_stream_id,
      s.label as stream_label,
      f.title,
      f.severity,
      f.economic_impact_eur,
      f.recommended_treatment,
      f.status,
      f.confidentiality_level
    from public.dd_findings f
    left join public.dd_streams s on s.id = f.dd_stream_id
    where f.project_id = p_project_id
      and f.status in ('open', 'in_review')
      and (p_classification is null or f.confidentiality_level::text = p_classification)
  ),
  finding_agg as (
    select
      fo.dd_stream_id,
      fo.stream_label,
      count(*) as open_total,
      count(*) filter (where fo.severity = 'niedrig') as sev_niedrig,
      count(*) filter (where fo.severity = 'mittel') as sev_mittel,
      count(*) filter (where fo.severity = 'hoch') as sev_hoch,
      count(*) filter (where fo.severity = 'deal_breaker') as sev_deal_breaker,
      coalesce(sum(fo.economic_impact_eur), 0)::numeric as eur_sum,
      count(*) filter (where fo.economic_impact_eur is null) as null_eur_count
    from finding_open fo
    group by fo.dd_stream_id, fo.stream_label
  ),
  -- ---- G2: Q&A per stream (same "offen" contract as PROJ-116) ----------------
  -- questions carry per-row confidentiality_level → classification filter cuts.
  qa_agg as (
    select
      q.dd_stream_id,
      s.label as stream_label,
      count(*) filter (where q.status not in ('answered','closed')) as qa_open,
      count(*) filter (where q.status in ('answered','closed')) as qa_answered
    from public.dd_questions q
    left join public.dd_streams s on s.id = q.dd_stream_id
    where q.project_id = p_project_id
      and (p_classification is null or q.confidentiality_level::text = p_classification)
    group by q.dd_stream_id, s.label
  ),
  -- ---- D1: deliverables status ----------------------------------------------
  deliverable_base as (
    select
      d.id,
      d.name,
      d.status,
      d.due_date,
      d.responsible_user_id,
      d.phase_id,
      ph.name  as phase_name,
      d.workstream_id,
      ws.label as workstream_label,
      d.confidentiality_level,
      (d.due_date is not null and d.due_date < current_date
        and d.status <> 'approved') as is_overdue
    from public.deliverables d
    left join public.phases ph on ph.id = d.phase_id
    left join public.workstreams ws on ws.id = d.workstream_id
    where d.project_id = p_project_id
      and (p_workstream_id is null or d.workstream_id = p_workstream_id)
      and (p_owner_id      is null or d.responsible_user_id = p_owner_id)
      and (p_phase_id      is null or d.phase_id = p_phase_id)
      and (p_classification is null or d.confidentiality_level::text = p_classification)
  )
  select jsonb_build_object(
    'tasks_overdue', jsonb_build_object(
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
        from task_ordered o
      ), '[]'::jsonb),
      'summary', (
        select jsonb_build_object(
          'open_total', count(*),
          'overdue_total', count(*) filter (where b.is_overdue),
          'due_today_total', count(*) filter (where b.is_due_today),
          'due_this_week_total', count(*) filter (where b.is_due_this_week),
          'blocked_total', count(*) filter (where b.is_blocked)
        )
        from task_base b
      )
    ),
    'findings_by_severity', jsonb_build_object(
      'streams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'dd_stream_id', fa.dd_stream_id,
          'stream_label', fa.stream_label,
          'open_total', fa.open_total,
          'sev_niedrig', fa.sev_niedrig,
          'sev_mittel', fa.sev_mittel,
          'sev_hoch', fa.sev_hoch,
          'sev_deal_breaker', fa.sev_deal_breaker,
          'eur_sum', fa.eur_sum,
          'null_eur_count', fa.null_eur_count
        ) order by fa.sev_deal_breaker desc, fa.sev_hoch desc, fa.stream_label)
        from finding_agg fa
      ), '[]'::jsonb),
      'findings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', fo.id,
          'dd_stream_id', fo.dd_stream_id,
          'stream_label', fo.stream_label,
          'title', fo.title,
          'severity', fo.severity,
          'economic_impact_eur', fo.economic_impact_eur,
          'recommended_treatment', fo.recommended_treatment,
          'status', fo.status,
          'confidentiality_level', fo.confidentiality_level
        ) order by (fo.severity = 'deal_breaker') desc, (fo.severity = 'hoch') desc, fo.economic_impact_eur desc nulls last)
        from finding_open fo
      ), '[]'::jsonb)
    ),
    'qa_by_stream', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dd_stream_id', qa.dd_stream_id,
        'stream_label', qa.stream_label,
        'qa_open', qa.qa_open,
        'qa_answered', qa.qa_answered
      ) order by qa.qa_open desc, qa.stream_label)
      from qa_agg qa
    ), '[]'::jsonb),
    'deliverables_status', jsonb_build_object(
      'deliverables', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'name', d.name,
          'status', d.status,
          'due_date', d.due_date,
          'responsible_user_id', d.responsible_user_id,
          'phase_id', d.phase_id,
          'phase_name', d.phase_name,
          'workstream_id', d.workstream_id,
          'workstream_label', d.workstream_label,
          'confidentiality_level', d.confidentiality_level,
          'is_overdue', d.is_overdue
        ) order by d.is_overdue desc, d.due_date asc nulls last, d.name)
        from deliverable_base d
      ), '[]'::jsonb),
      'summary', (
        select jsonb_build_object(
          'total', count(*),
          'planned', count(*) filter (where d.status = 'planned'),
          'in_progress', count(*) filter (where d.status = 'in_progress'),
          'in_review', count(*) filter (where d.status = 'in_review'),
          'approved', count(*) filter (where d.status = 'approved'),
          'suspended', count(*) filter (where d.status = 'suspended'),
          'overdue_total', count(*) filter (where d.is_overdue),
          'not_approved_total', count(*) filter (where d.status <> 'approved')
        )
        from deliverable_base d
      )
    ),
    'pre_read', jsonb_build_object(
      'overdue_tasks',                (select count(*) from task_base b where b.is_overdue),
      'open_deal_breaker_findings',   (select count(*) from finding_open fo where fo.severity = 'deal_breaker'),
      'open_qa',                      (select coalesce(sum(qa.qa_open), 0) from qa_agg qa),
      'deliverables_not_approved',    (select count(*) from deliverable_base d where d.status <> 'approved')
    )
  );
$f$;

revoke execute on function public.operative_report(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.operative_report(uuid, uuid, uuid, uuid, text) to authenticated;

comment on function public.operative_report(uuid, uuid, uuid, uuid, text) is
  'PROJ-132 + PROJ-141-gamma4/gamma5 — read-only operative reporting bundle (SECURITY INVOKER; need-to-know inherits via the RESTRICTIVE gates on work_items/dd_findings/dd_questions/deliverables/dd_streams). Optional filter args: p_workstream_id/p_owner_id/p_phase_id (tasks + deliverables only), p_classification (all four sections + pre_read). Pre-Read counters recount from the already-filtered CTEs.';
