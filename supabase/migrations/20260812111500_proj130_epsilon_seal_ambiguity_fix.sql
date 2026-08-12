-- PROJ-130-ε — Fix-forward auf 20260812110000.
--
-- `seal_audit_chain` deklarierte über `returns table (tenant_id uuid, …)` eine
-- plpgsql-Variable `tenant_id`. Im INSERT auf `audit_chain_anchors` — das eine
-- gleichnamige SPALTE hat — ist der Bezeichner damit mehrdeutig (42702), und die
-- Funktion bricht beim ersten Siegelversuch ab. Gefunden vom Live-Pentest, bevor
-- irgendein Anker entstanden ist.
--
-- Behoben durch Umbenennen der Rückgabespalte (`sealed_tenant_id`); die Migration
-- 20260812110000 bleibt unangetastet (append-only).
-- Die Rückgabespalte ändert den Zeilentyp, deshalb erst löschen: `create or
-- replace` kann den OUT-Parameter-Typ nicht ändern (42P13).
drop function if exists public.seal_audit_chain(interval, integer);

create function public.seal_audit_chain(
  p_margin interval default interval '2 hours',
  p_max_windows integer default 4000
)
returns table (sealed_tenant_id uuid, sealed_windows integer, last_window_start timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cutoff timestamptz := date_trunc('day', (now() - p_margin) at time zone 'UTC') at time zone 'UTC';
  v_tenant uuid;
  v_day timestamptz;
  v_prev text;
  v_count int;
  v_digest text;
  v_chain text;
  v_sealed int;
  v_last timestamptz;
  v_guard int := 0;
begin
  for v_tenant in
    select distinct e.tenant_id from public.audit_log_entries e
  loop
    v_sealed := 0;
    v_last := null;
    v_prev := null;

    select a.chain_digest, a.window_start into v_prev, v_last
      from public.audit_chain_anchors a
     where a.tenant_id = v_tenant
     order by a.window_start desc
     limit 1;

    if v_prev is null then
      v_prev := repeat('0', 64);
      select date_trunc('day', min(e.changed_at) at time zone 'UTC') at time zone 'UTC'
        into v_day
        from public.audit_log_entries e where e.tenant_id = v_tenant;
    else
      v_day := v_last + interval '1 day';
    end if;

    while v_day is not null and v_day < v_cutoff loop
      v_guard := v_guard + 1;
      exit when v_guard > p_max_windows;

      select d.entry_count, d.entries_digest into v_count, v_digest
        from public._audit_window_digest(v_tenant, v_day, v_day + interval '1 day') d;

      v_chain := public._audit_chain_digest(
        v_prev, v_day, v_day + interval '1 day', v_count, v_digest, 1::smallint);

      insert into public.audit_chain_anchors
        (tenant_id, window_start, window_end, entry_count, entries_digest, prev_digest, chain_digest)
      values
        (v_tenant, v_day, v_day + interval '1 day', v_count, v_digest, v_prev, v_chain)
      on conflict (tenant_id, window_start) do nothing;

      v_prev := v_chain;
      v_last := v_day;
      v_sealed := v_sealed + 1;
      v_day := v_day + interval '1 day';
    end loop;

    if v_sealed > 0 then
      sealed_tenant_id := v_tenant;
      sealed_windows := v_sealed;
      last_window_start := v_last;
      return next;
    end if;
  end loop;
end;
$fn$;

revoke all on function public.seal_audit_chain(interval, integer) from public, anon, authenticated;
grant execute on function public.seal_audit_chain(interval, integer) to postgres, service_role;

do $do$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='seal_audit_chain'
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'PROJ-130-ε: seal_audit_chain ist für Anwendungsnutzer aufrufbar';
  end if;
  raise notice 'PROJ-130-ε: Siegel-Funktion korrigiert';
end $do$;
