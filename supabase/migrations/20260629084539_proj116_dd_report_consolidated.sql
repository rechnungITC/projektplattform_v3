-- PROJ-116 — consolidated DD report + red-flag report (VIEW-class, read-only).
-- One SECURITY INVOKER RPC over the deployed PROJ-112/113/114 tables. Because it
-- runs as the caller, the RESTRICTIVE need-to-know policies on dd_streams /
-- dd_findings / dd_questions filter rows BEFORE aggregation → AC4 (no aggregate
-- leak; an advisor sees only cleared streams/findings) is satisfied for free.
-- No new table, no new policy, no new dep.

create or replace function public.dd_report_consolidated(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $f$
  with strm as (
    -- dd_streams carries its own RESTRICTIVE need-to-know gate (PROJ-112);
    -- locked streams never appear here (H4).
    select s.id, s.label, s.status
    from public.dd_streams s
    where s.project_id = p_project_id
  ),
  fagg as (
    -- dd_findings RESTRICTIVE gate applies row-wise in INVOKER context.
    select f.dd_stream_id,
      count(*) as findings_total,
      count(*) filter (where f.severity = 'niedrig') as sev_niedrig,
      count(*) filter (where f.severity = 'mittel') as sev_mittel,
      count(*) filter (where f.severity = 'hoch') as sev_hoch,
      count(*) filter (where f.severity = 'deal_breaker') as sev_deal_breaker,
      coalesce(sum(f.economic_impact_eur), 0)::numeric as eur_sum,
      count(*) filter (where f.economic_impact_eur is null) as null_eur_count
    from public.dd_findings f
    where f.project_id = p_project_id
    group by f.dd_stream_id
  ),
  qagg as (
    select q.dd_stream_id,
      count(*) filter (where q.status not in ('answered','closed')) as qa_open,
      count(*) filter (where q.status in ('answered','closed')) as qa_answered
    from public.dd_questions q
    where q.project_id = p_project_id
    group by q.dd_stream_id
  )
  select jsonb_build_object(
    'streams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dd_stream_id', s.id,
        'label', s.label,
        'status', s.status,
        'findings_total', coalesce(fa.findings_total, 0),
        'sev_niedrig', coalesce(fa.sev_niedrig, 0),
        'sev_mittel', coalesce(fa.sev_mittel, 0),
        'sev_hoch', coalesce(fa.sev_hoch, 0),
        'sev_deal_breaker', coalesce(fa.sev_deal_breaker, 0),
        'eur_sum', coalesce(fa.eur_sum, 0),
        'null_eur_count', coalesce(fa.null_eur_count, 0),
        'qa_open', coalesce(qa.qa_open, 0),
        'qa_answered', coalesce(qa.qa_answered, 0)
      ) order by s.label)
      from strm s
      left join fagg fa on fa.dd_stream_id = s.id
      left join qagg qa on qa.dd_stream_id = s.id
    ), '[]'::jsonb),
    'red_flags', coalesce((
      -- H3: selected DIRECTLY from dd_findings (row-wise RESTRICTIVE gate),
      -- never from a pre-aggregated definer source.
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'dd_stream_id', f.dd_stream_id,
        'title', f.title,
        'severity', f.severity,
        'economic_impact_eur', f.economic_impact_eur,
        'status', f.status
      ) order by (f.severity = 'deal_breaker') desc, f.economic_impact_eur desc nulls last)
      from public.dd_findings f
      where f.project_id = p_project_id
        and f.severity in ('hoch','deal_breaker')
    ), '[]'::jsonb)
  );
$f$;

revoke execute on function public.dd_report_consolidated(uuid) from public, anon;
grant execute on function public.dd_report_consolidated(uuid) to authenticated;
