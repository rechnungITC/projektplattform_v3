-- PROJ-120 (F5) — Kaufpreisbandbreite in den PROJ-131-Steering-Report.
--
-- Löst den "n/a / noch nicht verfügbar"-Platzhalter der Steering-Kachel ein
-- (PROJ-131 AC-131-5 → PROJ-Y-131a) und macht damit AC-120-4 ("Aktuelle
-- Bewertungssicht zeigt die gültige Version und die Kaufpreisbandbreite")
-- auch auf Management-Ebene sichtbar.
--
-- CIA-Auflagen für diesen Eingriff in eine DEPLOYTE, GETEILTE Funktion:
--  1. LETZTE Migration der Slice (bewusst separat von der Kern-Migration, damit
--     sie im Konfliktfall herausgenommen werden kann — der Rest von PROJ-120
--     ist davon unabhängig).
--  2. Der Body ist aus der LIVE-Definition (pg_get_functiondef, abgerufen
--     2026-08-08) abgeleitet, NICHT aus der Repo-Datei — sonst würden parallele
--     Änderungen anderer Slices überschrieben. Additiv sind ausschließlich:
--       (a) die CTE `valuation_current`,
--       (b) der Top-Level-Key 'valuation',
--       (c) vier `pre_read`-Felder für die Kachel.
--     Alles andere ist wortgleich zur Live-Definition.
--  3. SECURITY **INVOKER** bleibt (kein `security definer`) → die RESTRICTIVE
--     can_access_classified-Policy auf ma_valuations greift im Aufrufer-Kontext.
--     Ein nicht freigegebener Nutzer sieht die Bandbreite einer `confidential`
--     Bewertung damit weder im Detail NOCH in der Pre-Read-Kachel
--     (Aggregat-Leak-Probe im PROJ-131-Pentest).
--  4. Die Synergie-Kachel bleibt bewusst `n/a` (K2/PROJ-126 existiert nicht).

create or replace function public.steering_report(p_project_id uuid)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with
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
  gate_next as (
    select g.id, g.sequence_number, g.status, g.target_phase_id,
           tp.name as target_phase_name, g.confidentiality_level
    from public.ma_stage_gates g
    left join public.phases tp on tp.id = g.target_phase_id
    where g.project_id = p_project_id and g.status = 'pending'
    order by g.sequence_number asc
    limit 1
  ),
  -- PROJ-120: die gültige Bewertungsversion. RLS-gefiltert über den
  -- Aufrufer-Kontext (SECURITY INVOKER) → ohne Clearance bleibt die CTE leer.
  valuation_current as (
    select v.id, v.version_no, v.title, v.valuation_date, v.method,
           v.value_low, v.value_high, v.currency, v.version_comment,
           v.author_user_id, v.confidentiality_level
    from public.ma_valuations v
    where v.project_id = p_project_id and v.is_current
    limit 1
  ),
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
    -- PROJ-120 (F5): aktuelle Bewertung + Kaufpreisbandbreite (null, solange es
    -- keine gibt ODER der Aufrufer nicht freigegeben ist).
    'valuation', (
      select case when vc.id is null then null else jsonb_build_object(
        'id', vc.id, 'version_no', vc.version_no, 'title', vc.title,
        'valuation_date', vc.valuation_date, 'method', vc.method,
        'value_low', vc.value_low, 'value_high', vc.value_high,
        'currency', vc.currency, 'version_comment', vc.version_comment,
        'author_user_id', vc.author_user_id,
        'confidentiality_level', vc.confidentiality_level
      ) end
      from (select * from valuation_current) vc
    ),
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
    'pre_read', jsonb_build_object(
      'lifecycle_status', (select lifecycle_status from public.projects where id = p_project_id),
      'current_phase_name', (select name from current_phase),
      'next_gate_sequence', (select sequence_number from gate_next),
      'next_gate_status', (select status from gate_next),
      'open_red_flag_findings', (select count(*) from rf_finding),
      'open_high_risks', (select count(*) from rf_risk),
      'critical_tasks', (select count(*) from task_base b where b.is_overdue or b.is_blocked),
      -- PROJ-120 (F5): Kachel-Felder; null ohne Bewertung oder ohne Clearance.
      'valuation_version_no', (select version_no from valuation_current),
      'valuation_value_low', (select value_low from valuation_current),
      'valuation_value_high', (select value_high from valuation_current),
      'valuation_currency', (select currency from valuation_current)
    )
  );
$function$;
