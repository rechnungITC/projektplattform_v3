-- PROJ-132 — Operatives Reporting für PMO, Deal Lead und Workstreams (VIEW-class, DUP→REUSE).
--
-- No new table/field/dep, no audit-trio touch. ONE read-only SECURITY INVOKER
-- aggregation that BUNDLES four operative sections + a weekly-steering pre-read
-- over live core/M&A objects. Mirrors the deployed PROJ-116 dd_report_consolidated
-- and PROJ-103 project_task_bottlenecks patterns and REUSES their exact contracts
-- so the numbers never diverge:
--   * tasks_overdue        — open tasks (todo/in_progress/blocked) with days_overdue
--                            + disjoint date buckets (verbatim PROJ-103 logic). C1.
--   * findings_by_severity — OPEN dd_findings (status open/in_review) per stream ×
--                            severity + individual rows for drill-down/export. G3.
--   * qa_by_stream         — dd_questions open/answered per stream, same "offen"
--                            contract as PROJ-116 (status ∉ answered/closed). G2.
--   * deliverables_status  — deliverables per workstream/phase with status + overdue
--                            flag + status-count summary. D1.
--   * pre_read             — weekly-steering headline: overdue tasks · open
--                            deal-breaker findings · open Q&A · deliverables not
--                            yet approved. H1.
--
-- Need-to-know (B4) is FREE: because the function runs as the CALLER (security
-- invoker), the RESTRICTIVE need-to-know gates on work_items / dd_findings /
-- dd_questions / deliverables / dd_streams (PROJ-100a) filter rows BEFORE
-- aggregation — a row the caller may not see appears in neither the lists, the
-- summaries, nor the export. The additive external-advisor rule in
-- can_access_classified (PROJ-99: NDA + active mandate + stream) automatically
-- scopes advisors to their own stream. No second permission model.
-- phases/workstreams/dd_streams joins are LEFT JOINs, so a confidential
-- container the caller cannot see just blanks its label; the row itself stays
-- gated by its own object gate.
--
-- MUST be called with the session-bound user client, NEVER service-role.

create or replace function public.operative_report(p_project_id uuid)
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
  ),
  task_ordered as (
    select b.*
    from task_base b
    order by b.is_overdue desc, b.days_overdue desc, b.due_date asc nulls last, b.title
  ),
  -- ---- G3: open findings (status open/in_review) per stream × severity -------
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
  qa_agg as (
    select
      q.dd_stream_id,
      s.label as stream_label,
      count(*) filter (where q.status not in ('answered','closed')) as qa_open,
      count(*) filter (where q.status in ('answered','closed')) as qa_answered
    from public.dd_questions q
    left join public.dd_streams s on s.id = q.dd_stream_id
    where q.project_id = p_project_id
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
  )
  select jsonb_build_object(
    -- ===== C1 ================================================================
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
    -- ===== G3 ================================================================
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
    -- ===== G2 ================================================================
    'qa_by_stream', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dd_stream_id', qa.dd_stream_id,
        'stream_label', qa.stream_label,
        'qa_open', qa.qa_open,
        'qa_answered', qa.qa_answered
      ) order by qa.qa_open desc, qa.stream_label)
      from qa_agg qa
    ), '[]'::jsonb),
    -- ===== D1 ================================================================
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
    -- ===== H1: weekly-steering pre-read ======================================
    'pre_read', jsonb_build_object(
      'overdue_tasks', (select count(*) from task_base b where b.is_overdue),
      'open_deal_breaker_findings', (select count(*) from finding_open fo where fo.severity = 'deal_breaker'),
      'open_qa', (select coalesce(sum(qa.qa_open), 0) from qa_agg qa),
      'deliverables_not_approved', (select count(*) from deliverable_base d where d.status <> 'approved')
    )
  );
$f$;

revoke execute on function public.operative_report(uuid) from public, anon;
grant execute on function public.operative_report(uuid) to authenticated;

comment on function public.operative_report(uuid) is
  'PROJ-132 — read-only operative reporting bundle (SECURITY INVOKER; need-to-know '
  'inherits via the RESTRICTIVE gates on work_items/dd_findings/dd_questions/'
  'deliverables/dd_streams). Bundles tasks_overdue (C1, PROJ-103 logic), '
  'findings_by_severity (G3, open findings), qa_by_stream (G2, PROJ-116 contract), '
  'deliverables_status (D1) and a weekly-steering pre_read (H1). VIEW-class, no writes.';