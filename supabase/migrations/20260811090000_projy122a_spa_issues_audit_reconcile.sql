-- PROJ-Y-122a — Reconcile and harden the PROJ-122 audit wiring.
--
-- WHY
-- 20260807110000_proj122_spa_issues.sql patches the two shared audit helpers
-- (`_tracked_audit_columns`, `can_read_audit_entry`) with a literal replace()
-- and then EXECUTEs the result *without verifying that the replacement
-- applied* — unlike its sibling slices PROJ-78/119/120, which all raise when
-- their anchor is missing. A literal replace() that finds nothing returns its
-- input unchanged, so `execute d` re-creates the function verbatim and the
-- migration reports success.
--
-- Consequence in any freshly built environment whose whitespace differs from
-- prod: `spa_issues` UPDATEs silently lose field-level audit, and audit reads
-- for spa_issues fall through to `else return false` -> permanently empty
-- history tab. No error, no log. The Schema Drift Guard cannot catch it
-- either: it only compares SELECT columns, and a silent no-op raises nothing.
--
-- Today the anchor matches (verified against both prod and the repo-replayed
-- shape), so the defect is LATENT, not active. This migration makes the end
-- state correct regardless of whitespace:
--   * no-op when the branch is already present (the prod path, and any replay
--     in which PROJ-122's own literal anchor happened to match),
--   * otherwise re-injects the branch through a WHITESPACE-TOLERANT regex
--     anchor and raises loudly if even that shape is absent.
--
-- The injected text is byte-identical to PROJ-122's, so the resulting
-- definition is the same whichever migration actually placed the branch.
--
-- Both blocks additionally assert that no sibling slice's branch was dropped
-- by a concurrent recreate-from-live — the one hazard that is inherent to N
-- parallel sessions sharing these two functions (see
-- feedback_audit_fn_recreate_drops_grant, second facet).
--
-- Reference: feedback_rpc_body_patch_pattern — literal anchors match prod but
-- can miss the repo-replayed shape; PROJ-Y-115c hit exactly this and had to
-- switch to `\s+`-tolerant regexes.

-- --------------------------------------------------------------------------
-- 1) _tracked_audit_columns — the field-level audit whitelist
-- --------------------------------------------------------------------------
do $mig$
declare
  v_def    text;
  v_new    text;
  v_branch constant text :=
       'when ''spa_issues'' then array[''title'',''clause_reference'',''category'','
    || '''own_position'',''counterparty_position'',''recommended_solution'','
    || '''risk_if_no_agreement'',''status'',''importance'',''responsible_user_id'','
    || '''due_date'',''linked_finding_id'',''linked_risk_id'',''confidentiality_level''] ';
begin
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);

  if position('''spa_issues''' in v_def) = 0 then
    -- regexp_replace without the 'g' flag rewrites only the FIRST match. The
    -- else-branch is unique: "when 'report_snapshots' then array[]::text[]"
    -- carries no leading `else`, so it cannot be hit by accident.
    v_new := regexp_replace(
      v_def,
      'else\s+array\[\]::text\[\]',
      v_branch || 'else array[]::text[]'
    );

    if v_new = v_def then
      raise exception
        'PROJ-Y-122a: _tracked_audit_columns else-anchor not found in ANY whitespace shape — refusing to guess';
    end if;

    execute v_new;

    if position('''spa_issues''' in
         pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)) = 0 then
      raise exception 'PROJ-Y-122a: _tracked_audit_columns patch did not apply';
    end if;
  end if;

  -- Sibling-clobber guard: every branch that must already exist at this point
  -- in the replay order (PROJ-Y-96b, PROJ-119, PROJ-120 all carry earlier
  -- timestamps than this migration).
  v_def := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
  if position('''ma_valuations''' in v_def) = 0
     or position('''communication_matrix_entries''' in v_def) = 0
     or position('''raci_assignments''' in v_def) = 0 then
    raise exception 'PROJ-Y-122a: _tracked_audit_columns lost a sibling slice''s branch — aborting';
  end if;
end
$mig$;

-- --------------------------------------------------------------------------
-- 2) can_read_audit_entry — the audit_log_entries RLS read gate
-- --------------------------------------------------------------------------
do $mig$
declare
  v_def    text;
  v_new    text;
  v_branch constant text :=
    'when ''spa_issues'' then select project_id into v_project from public.spa_issues where id = p_entity_id; ';
begin
  v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);

  if position('''spa_issues''' in v_def) = 0 then
    -- `else return false;` is unique; the other `return false` occurrences are
    -- guard clauses ("if v_project is null then return false; end if;") and
    -- carry no leading `else`.
    v_new := regexp_replace(
      v_def,
      'else\s+return\s+false;',
      v_branch || 'else return false;'
    );

    if v_new = v_def then
      raise exception
        'PROJ-Y-122a: can_read_audit_entry else-anchor not found in ANY whitespace shape — refusing to guess';
    end if;

    execute v_new;

    if position('''spa_issues''' in
         pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure)) = 0 then
      raise exception 'PROJ-Y-122a: can_read_audit_entry patch did not apply';
    end if;
  end if;

  -- Sibling-clobber guard (PROJ-78, PROJ-120, PROJ-Y-115c — all earlier).
  v_def := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
  if position('''project_skills''' in v_def) = 0
     or position('''ma_valuations''' in v_def) = 0
     or position('''document_tree_nodes''' in v_def) = 0 then
    raise exception 'PROJ-Y-122a: can_read_audit_entry lost a sibling slice''s branch — aborting';
  end if;
end
$mig$;

-- CREATE OR REPLACE preserves the ACL (measured on this database: proacl
-- byte-identical after a recreate-from-live), so these are no-ops. They are
-- kept because they document the intent and cost nothing — a genuine grant
-- loss only happens when the function is replaced as a NEW object (DROP+CREATE
-- or a signature change). See feedback_audit_fn_recreate_drops_grant.
grant execute on function public._tracked_audit_columns(text) to authenticated;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
