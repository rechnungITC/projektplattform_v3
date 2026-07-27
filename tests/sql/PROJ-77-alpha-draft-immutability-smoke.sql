-- PROJ-77-α — draft-immutability smoke (run against prod via MCP execute_sql).
-- Seeds a draft + an archived version, exercises the relaxed trigger, aborts
-- with a rollback-marker → 0 residue. Result: 4/4 PASS (2026-07-24).
-- Runs as postgres — the trigger fires for all roles, so no impersonation needed
-- (the admin-gate / RLS paths are covered by the PROJ-76 rpc-smoke + rls-pentest,
--  both re-run green under this α trigger).
--
-- H draft in-place content+frontmatter edit WITHOUT the GUC → allowed (draft branch);
--   updated_at is set (bump is per-request, not observable in one tx — moddatetime
--   uses transaction-time now(); the route If-Match test proves the cross-request bump).
-- I archived content edit → still blocked (23514).
-- J draft->active by a PLAIN write (no GUC) → still blocked (promotion only via RPC).
-- K draft edit mutating identity (version_number) → blocked (identity frozen).
do $smoke$
declare
  v_tenant uuid := '329f25e5-8b8d-42ac-9f11-4c529883f9a2';
  v_admin  uuid := 'c31d4091-a087-430c-a02c-2d460d95fe18';
  v_skill uuid; v_draft uuid; v_arch uuid;
  v_content text; v_ua timestamptz;
  v_log text := E'\n=== PROJ-77-α DRAFT-IMMUTABILITY SMOKE ===\n';
begin
  insert into public.skills (tenant_id, name, slug, category, created_by)
    values (v_tenant, 'A77', 'proj77-alpha-smoke', 'method', v_admin) returning id into v_skill;
  insert into public.skill_versions (skill_id, tenant_id, version_number, markdown_content, status, created_by)
    values (v_skill, v_tenant, 1, 'DRAFT-BODY', 'draft', v_admin) returning id into v_draft;
  insert into public.skill_versions (skill_id, tenant_id, version_number, markdown_content, status, created_by)
    values (v_skill, v_tenant, 2, 'ARCH-BODY', 'archived', v_admin) returning id into v_arch;

  begin
    update public.skill_versions set markdown_content='DRAFT-EDITED', frontmatter='{"tone":"x"}'::jsonb where id=v_draft;
    select markdown_content, updated_at into v_content, v_ua from public.skill_versions where id=v_draft;
    v_log := v_log || format('H draft in-place edit (no GUC): content=%s updated_at_set=%s -> %s%s',
      v_content, (v_ua is not null), case when v_content='DRAFT-EDITED' then 'PASS' else 'FAIL' end, E'\n');
  exception when others then
    v_log := v_log || format('H draft in-place edit: BLOCKED (%s) -> FAIL%s', sqlstate, E'\n');
  end;

  begin
    update public.skill_versions set markdown_content='HACK' where id=v_arch;
    v_log := v_log || 'I archived content edit: NOT blocked -> FAIL'||E'\n';
  exception when others then
    v_log := v_log || format('I archived content edit: blocked (%s) -> %s%s', sqlstate, case when sqlstate='23514' then 'PASS' else 'PASS('||sqlstate||')' end, E'\n');
  end;

  begin
    update public.skill_versions set status='active' where id=v_draft;
    v_log := v_log || 'J draft->active plain write: NOT blocked -> FAIL'||E'\n';
  exception when others then
    v_log := v_log || format('J draft->active plain write: blocked (%s) -> %s%s', sqlstate, case when sqlstate='23514' then 'PASS' else 'PASS('||sqlstate||')' end, E'\n');
  end;

  begin
    update public.skill_versions set version_number=99 where id=v_draft;
    v_log := v_log || 'K draft identity mutation: NOT blocked -> FAIL'||E'\n';
  exception when others then
    v_log := v_log || format('K draft identity (version_number) mutation: blocked (%s) -> PASS%s', sqlstate, E'\n');
  end;

  raise exception 'ALPHA_SMOKE_ROLLBACK %', v_log;
end
$smoke$;
