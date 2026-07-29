-- PROJ-131 — Management-Reporting & Steering-Dashboard (VIEW-class, DUP→REUSE).
--
-- No new table/field/dep, no audit-trio touch. ONE read-only SECURITY INVOKER
-- aggregation that BUNDLES the steering-level sections over live core/M&A
-- objects. Mirrors the deployed PROJ-132 operative_report / PROJ-116
-- dd_report_consolidated patterns and REUSES their contracts so the numbers
-- never diverge from the operative reporting:
--   * deal_status   — project lifecycle_status + current phase (in_progress,
--                     else earliest active) + phase-status summary. (A2)
--   * next_stage_gate — earliest still-open ('pending') stage gate + status +
--                     target phase + a gate-status summary. (F1 = PROJ-110)
--   * red_flags     — open DD-findings severity hoch/deal_breaker (G3 = PROJ-114,
--                     canonical red flags) + open/mitigated high/critical risks
--                     (E2 = PROJ-107, score >= 13) + a combined summary. Lists
--                     are fully ordered; the UI shows the top-5 headline.
--   * critical_tasks — open tasks that are overdue OR blocked (subset of the
--                     verbatim PROJ-103/PROJ-132 task logic) + the full open-task
--                     summary. (PROJ-101/103)
--   * pre_read      — steering headline: lifecycle + current phase + next gate +
--                     open red-flag findings + open high risks + critical tasks.
--
-- Kaufpreis (I1/I2 = PROJ-120/121) and Synergie (K2 = PROJ-126) are NOT here —
-- those modules are not built yet; the UI renders "not-yet-available"
-- placeholders (AC-131-5 → PROJ-Y-131a).
--
-- Need-to-know (L2, AC-131-2) is FREE: the function runs as the CALLER (security
-- invoker), so the RESTRICTIVE need-to-know gates on work_items / dd_findings /
-- risks / ma_stage_gates / phases (PROJ-100a) filter rows BEFORE aggregation — a
-- row the caller may not see appears in neither the lists, the summaries, nor the
-- pre-read headline. The additive external-advisor rule (PROJ-99) scopes advisors
-- automatically. No second permission model. Container joins (stream/workstream/
-- target phase) are LEFT JOINs so an unseen container just blanks its label.
--
-- MUST be called with the session-bound user client, NEVER service-role.

create or replace function public.steering_report(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $f$
  with
  -- ---- A2: current phase (in_progress first, else earliest active) ----------
  phase_all as (
    select id, name, sequence_number, status
    from public.phases
    where project_id = p_project_id and is_deleted = false
  ),
  current_phase as (
    select id, name, sequence_number, status
    from phase_all
    where status not in ('completed', 'cancelled')
    order by (status = 'in_progress') desc, sequence_number asc
    limit 1
  ),
  -- ---- F1: next open stage gate (PROJ-110) ----------------------------------
  gate_next as (
    select g.id, g.sequence_number, g.status, g.target_phase_id,
           tp.name as target_phase_name, g.confidentiality_level
    from public.ma_stage_gates g
    left join public.phases tp on tp.id = g.target_phase_id
    where g.project_id = p_project_id and g.status = 'pending'
    order by g.sequence_number asc
    limit 1
  ),
  -- ---- G3: open red-flag findings (hoch / deal_breaker) ----------------------
  rf_finding as (
    select f.id, f.dd_stream_id, s.label as stream_label, f.title, f.severity,
           f.economic_impact_eur, f.recommended_treatment, f.status,
           f.confidentiality_level
    from public.dd_findings f
    left join public.dd_streams s on s.id = f.dd_stream_id
    where f.project_id = p_project_id
      and f.status in ('open', 'in_review')
      and f.severity in ('hoch', 'deal_breaker')
  ),
  -- ---- E2: open/mitigated high|critical risks (PROJ-107, score >= 13) --------
  rf_risk as (
    select r.id, r.title, r.probability, r.impact, r.score,
           public._risk_severity_bucket(r.score) as severity_bucket,
           r.status, r.workstream_id, ws.label as workstream_label,
           r.confidentiality_level
    from public.risks r
    left join public.workstreams ws on ws.id = r.workstream_id
    where r.project_id = p_project_id
      and r.status in ('open', 'mitigated')
      and r.score >= 13
  ),
  -- ---- C1: open tasks (verbatim PROJ-103/PROJ-132 logic) ---------------------
  task_base as (
    select
      wi.id, wi.title, wi.kind, wi.status, wi.due_date, wi.responsible_user_id,
      wi.phase_id, ph.name as phase_name, wi.workstream_id, ws.label as workstream_label,
      wi.confidentiality_level,
      case when wi.due_date is not null and wi.due_date < current_date
        then (current_date - wi.due_date) else 0 end as days_overdue,
      (wi.due_date is not null and wi.due_date < current_date) as is_overdue,
      (wi.due_date = current_date) as is_due_today,
      (wi.due_date is not null and wi.due_date > current_date
        and wi.due_date <= (current_date + (7 - extract(isodow from current_date))::int)) as is_due_this_week,
      (wi.status = 'blocked') as is_blocked
    from public.work_items wi
    left join public.phases ph on ph.id = wi.phase_id
    left join public.workstreams ws on ws.id = wi.workstream_id
    where wi.project_id = p_project_id
      and wi.is_deleted = false
      and wi.status in ('todo', 'in_progress', 'blocked')
  ),
  task_critical as (
    select b.* from task_base b
    where b.is_overdue or b.is_blocked
    order by b.is_overdue desc, b.days_overdue desc, b.due_date asc nulls last, b.title
  )
  select jsonb_build_object(
    -- ===== A2: deal status ===================================================
    'deal_status', jsonb_build_object(
      'lifecycle_status', (select lifecycle_status from public.projects where id = p_project_id),
      'current_phase', (
        select case when cp.id is null then null else jsonb_build_object(
          'id', cp.id, 'name', cp.name,
          'sequence_number', cp.sequence_number, 'status', cp.status
        ) end
        from (select * from current_phase) cp
      ),
      'phase_summary', (
        select jsonb_build_object(
          'total', count(*),
          'planned', count(*) filter (where status = 'planned'),
          'in_progress', count(*) filter (where status = 'in_progress'),
          'completed', count(*) filter (where status = 'completed'),
          'suspended', count(*) filter (where status = 'suspended'),
          'cancelled', count(*) filter (where status = 'cancelled')
        )
        from phase_all
      )
    ),
    -- ===== F1: next stage gate ===============================================
    'next_stage_gate', (
      select case when g.id is null then null else jsonb_build_object(
        'id', g.id, 'sequence_number', g.sequence_number, 'status', g.status,
        'target_phase_id', g.target_phase_id, 'target_phase_name', g.target_phase_name,
        'confidentiality_level', g.confidentiality_level
      ) end
      from (select * from gate_next) g
    ),
    'stage_gate_summary', (
      select jsonb_build_object(
        'total', count(*),
        'pending', count(*) filter (where status = 'pending'),
        'passed', count(*) filter (where status = 'passed'),
        'conditional', count(*) filter (where status = 'conditional'),
        'aborted', count(*) filter (where status = 'aborted')
      )
      from public.ma_stage_gates where project_id = p_project_id
    ),
    -- ===== G3 + E2: red flags ================================================
    'red_flags', jsonb_build_object(
      'findings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', rf.id, 'dd_stream_id', rf.dd_stream_id, 'stream_label', rf.stream_label,
          'title', rf.title, 'severity', rf.severity,
          'economic_impact_eur', rf.economic_impact_eur,
          'recommended_treatment', rf.recommended_treatment, 'status', rf.status,
          'confidentiality_level', rf.confidentiality_level
        ) order by (rf.severity = 'deal_breaker') desc, (rf.severity = 'hoch') desc,
          rf.economic_impact_eur desc nulls last, rf.title)
        from rf_finding rf
      ), '[]'::jsonb),
      'risks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', rr.id, 'title', rr.title, 'probability', rr.probability,
          'impact', rr.impact, 'score', rr.score, 'severity_bucket', rr.severity_bucket,
          'status', rr.status, 'workstream_id', rr.workstream_id,
          'workstream_label', rr.workstream_label,
          'confidentiality_level', rr.confidentiality_level
        ) order by rr.score desc, rr.title)
        from rf_risk rr
      ), '[]'::jsonb),
      'summary', jsonb_build_object(
        'finding_deal_breaker', (select count(*) from rf_finding where severity = 'deal_breaker'),
        'finding_hoch', (select count(*) from rf_finding where severity = 'hoch'),
        'risk_critical', (select count(*) from rf_risk where severity_bucket = 'critical'),
        'risk_high', (select count(*) from rf_risk where severity_bucket = 'high'),
        'total', (select count(*) from rf_finding) + (select count(*) from rf_risk)
      )
    ),
    -- ===== C1: critical open tasks (overdue OR blocked) ======================
    'critical_tasks', jsonb_build_object(
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'kind', t.kind, 'status', t.status,
          'due_date', t.due_date, 'days_overdue', t.days_overdue,
          'responsible_user_id', t.responsible_user_id,
          'phase_id', t.phase_id, 'phase_name', t.phase_name,
          'workstream_id', t.workstream_id, 'workstream_label', t.workstream_label,
          'confidentiality_level', t.confidentiality_level,
          'is_overdue', t.is_overdue, 'is_due_today', t.is_due_today,
          'is_due_this_week', t.is_due_this_week, 'is_blocked', t.is_blocked
        ))
        from task_critical t
      ), '[]'::jsonb),
      'summary', (
        select jsonb_build_object(
          'open_total', count(*),
          'overdue_total', count(*) filter (where b.is_overdue),
          'due_today_total', count(*) filter (where b.is_due_today),
          'due_this_week_total', count(*) filter (where b.is_due_this_week),
          'blocked_total', count(*) filter (where b.is_blocked),
          'critical_total', count(*) filter (where b.is_overdue or b.is_blocked)
        )
        from task_base b
      )
    ),
    -- ===== H1: steering pre-read headline ====================================
    'pre_read', jsonb_build_object(
      'lifecycle_status', (select lifecycle_status from public.projects where id = p_project_id),
      'current_phase_name', (select name from current_phase),
      'next_gate_sequence', (select sequence_number from gate_next),
      'next_gate_status', (select status from gate_next),
      'open_red_flag_findings', (select count(*) from rf_finding),
      'open_high_risks', (select count(*) from rf_risk),
      'critical_tasks', (select count(*) from task_base b where b.is_overdue or b.is_blocked)
    )
  );
$f$;

revoke execute on function public.steering_report(uuid) from public, anon;
grant execute on function public.steering_report(uuid) to authenticated;

comment on function public.steering_report(uuid) is
  'PROJ-131 — read-only management/steering reporting bundle (SECURITY INVOKER; '
  'need-to-know inherits via the RESTRICTIVE gates on phases/ma_stage_gates/'
  'dd_findings/risks/work_items). Bundles deal_status (A2), next_stage_gate (F1), '
  'red_flags (G3 findings + E2 risks), critical_tasks (PROJ-103 logic) and a '
  'steering pre_read (H1). VIEW-class, no writes. Kaufpreis/Synergie deferred '
  '(PROJ-Y-131a). Call with the session user client, never service-role.';
