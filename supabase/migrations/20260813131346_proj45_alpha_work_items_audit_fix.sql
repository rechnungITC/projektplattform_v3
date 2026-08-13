-- =============================================================================
-- PROJ-45-α — Fix forward: work_items audit whitelist missed trade_id/section_id
-- =============================================================================
-- WHY
-- 20260813131238_proj45_alpha_construction_trades_sections.sql injects three
-- construction branches into `_tracked_audit_columns` and then tries to extend
-- the `work_items` branch, guarded by:
--
--     if position('''trade_id''' in v_def) = 0 then ...
--
-- That guard collides with the migration's OWN injected text: the
-- `project_construction_trades` branch written moments earlier already contains
-- the literal 'trade_id'. The condition is therefore false on the first run and
-- the work_items patch is silently skipped — while the sibling `risks` block,
-- which anchors on the precise branch shape
-- (`when 'risks' then array['trade_id'`), applied correctly.
--
-- Consequence: moving a work item between trades or sections was NOT recorded
-- in the field-level audit, so AC-45.11 / CIA obligation A-2 were only half
-- satisfied. Verified against prod after the first apply:
--   risks      -> trade_id present
--   work_items -> trade_id ABSENT
--
-- The original migration is already applied to prod and is therefore not
-- edited (append-only rule). This migration fixes forward with the precise
-- branch anchor and the same post-verification discipline (A-3), and is a
-- no-op once the branch is present.
-- =============================================================================

do $mig$
declare
  v_def text;
  v_new text;
  v_sib text;
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

  -- Precise anchor: the work_items branch itself, not the bare literal.
  if v_def !~ 'when\s+''work_items''\s+then\s+array\[''trade_id''' then
    v_new := regexp_replace(
      v_def,
      '(when\s+''work_items''\s+then\s+array\[)',
      '\1''trade_id'',''section_id'','
    );

    if v_new = v_def then
      raise exception
        'PROJ-45-fix: work_items branch anchor not found in ANY whitespace shape — refusing to guess';
    end if;

    execute v_new;

    v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
    if v_def !~ 'when\s+''work_items''\s+then\s+array\[''trade_id''' then
      raise exception 'PROJ-45-fix: work_items branch patch did not apply';
    end if;
  end if;

  -- Post-condition: the eleven pre-existing work_items columns must survive.
  foreach v_sib in array array['title','description','status','priority',
                               'responsible_user_id','kind','sprint_id','parent_id',
                               'story_points','confidentiality_level','is_deleted']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-fix: _tracked_audit_columns lost work_items column %', v_sib;
    end if;
  end loop;

  -- Sibling guard against a concurrent recreate-from-live.
  foreach v_sib in array array['spa_issues','ma_valuations','skill_knowledge_links',
                               'construction_trades','construction_sections']
  loop
    if position('''' || v_sib || '''' in v_def) = 0 then
      raise exception 'PROJ-45-fix: _tracked_audit_columns lost sibling branch %', v_sib;
    end if;
  end loop;
end
$mig$;

-- Final assertion: both new references are tracked for work_items, and the
-- risks branch (which applied correctly the first time) is still intact.
do $mig$
begin
  if not ('trade_id' = any (public._tracked_audit_columns('work_items')))
     or not ('section_id' = any (public._tracked_audit_columns('work_items'))) then
    raise exception 'PROJ-45-fix: work_items is still missing trade_id/section_id';
  end if;
  if not ('trade_id' = any (public._tracked_audit_columns('risks'))) then
    raise exception 'PROJ-45-fix: risks.trade_id tracking was lost';
  end if;
end
$mig$;
