-- PROJ-135 — `clarifying_questions_from_context` AI purpose
--
-- Dialogic wizard clarifying questions. UNLIKE the PROJ-70/88/89 "proposal"
-- purposes this writes NO ki_suggestions — its output is reviewed in the
-- wizard and persisted (at finalize) by appending the answered Q&A to the
-- kickoff `context_sources.content_excerpt`. It therefore behaves like the
-- narrative/sentiment/coaching purposes: ki_runs audit only, no accept/undo
-- RPC, no ki_provenance, no immutability bypass.
--
-- THE AUDIT FORK (CIA-reviewed 2026-06-18, Option 1): generation runs in the
-- wizard BEFORE the project exists, so the ki_runs row has no project to
-- point at. AC-135.6 still requires every AI call to be audited. We make
-- `ki_runs.project_id` nullable in a BOUNDED way:
--   * a partial CHECK allows NULL only for this purpose (NOT NULL stays
--     effectively enforced for all 8 other purposes);
--   * a `wizard_draft_id` correlation column ties the project-less run to its
--     draft; finalize best-effort re-links it to the new project (AC-135.11);
--   * ADDITIVE RLS policies grant tenant-scoped read/insert/update on the
--     project-less rows (tenant_id anchor → no cross-tenant leak); the
--     existing project-scoped policies are left untouched.
--
-- ⚠️ The ki_runs purpose CHECK re-enumeration INCLUDES 'sentiment' +
-- 'coaching' — they were restored by 20260614100000 after every prior
-- lockstep copy silently dropped them (coaching/sentiment 5xx'd in prod).
-- The smoke check below guards against a repeat.
--
-- ⚠️ ki_suggestions_purpose_check is INTENTIONALLY NOT extended — this purpose
-- never writes ki_suggestions (mirror of sentiment/coaching). The smoke check
-- asserts its ABSENCE there to prevent copy-paste drift from the PROJ-70/89
-- template.

-- ---------------------------------------------------------------------------
-- 1. ki_runs.project_id → bounded-nullable + wizard_draft_id correlation
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  alter column project_id drop not null;

alter table public.ki_runs
  add column if not exists wizard_draft_id uuid
    references public.project_wizard_drafts(id) on delete set null;

-- Bounded CHECK: project_id may be NULL only for the clarifying purpose.
alter table public.ki_runs
  drop constraint if exists ki_runs_project_id_bounded_null;
alter table public.ki_runs
  add constraint ki_runs_project_id_bounded_null
  check (
    project_id is not null
    or purpose = 'clarifying_questions_from_context'
  );

-- Partial index for the tenant-level audit view of project-less runs.
create index if not exists ki_runs_tenant_no_project_idx
  on public.ki_runs (tenant_id, created_at desc)
  where project_id is null;

-- ---------------------------------------------------------------------------
-- 2. ki_runs.purpose CHECK (re-enumerate full list + new purpose)
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    -- PROJ-34 (restored by 20260614100000 — keep in every re-enumeration!)
    'sentiment'::text,
    'coaching'::text,
    'trajectory_sequence'::text,
    'resource_swap'::text,
    'cross_project_links'::text,
    'proposal_from_context'::text,
    'proposal_stakeholders_from_context'::text,
    'proposal_risks_from_context'::text,
    -- PROJ-135
    'clarifying_questions_from_context'::text
  ]));

-- ---------------------------------------------------------------------------
-- 3. tenant_ai_cost_caps.purpose CHECK (lockstep)
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_purpose_check;
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_purpose_check
  check (
    purpose is null or purpose in (
      'risks','decisions','work_items','open_items',
      'narrative','sentiment','coaching',
      'trajectory_sequence',
      'resource_swap',
      'cross_project_links',
      'proposal_from_context',
      'proposal_stakeholders_from_context',
      'proposal_risks_from_context',
      -- PROJ-135
      'clarifying_questions_from_context'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Additive RLS for project-less clarifying runs (CIA Auflage 2).
--    The existing project-scoped policies stay as-is; these grant the
--    tenant-scoped path for rows with project_id IS NULL. Policies are OR'd,
--    so the 8 other purposes are unaffected. tenant_id anchor → no leak.
-- ---------------------------------------------------------------------------
drop policy if exists "ki_runs_select_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_select_member_tenant_draft" on public.ki_runs for select
  using (project_id is null and public.is_tenant_member(tenant_id));

drop policy if exists "ki_runs_insert_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_insert_member_tenant_draft" on public.ki_runs for insert
  with check (project_id is null and public.is_tenant_member(tenant_id));

drop policy if exists "ki_runs_update_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_update_member_tenant_draft" on public.ki_runs for update
  using (project_id is null and public.is_tenant_member(tenant_id))
  with check (
    -- Allow the finalize re-link (AC-135.11): a project-less row may gain a
    -- project_id, after which the project-scoped policies govern it. The
    -- tenant_id must not change.
    public.is_tenant_member(tenant_id)
  );

-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
  v_nullable text;
begin
  -- CHECK 1: ki_runs purpose CHECK admits the new purpose AND keeps
  -- sentiment + coaching (the 20260614100000 restore must survive).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';
  if v_def is null or v_def not like '%clarifying_questions_from_context%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check missing new purpose';
  end if;
  if v_def not like '%sentiment%' or v_def not like '%coaching%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check dropped sentiment/coaching again (def=%)', v_def;
  end if;
  if v_def not like '%proposal_risks_from_context%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check dropped an existing purpose (def=%)', v_def;
  end if;

  -- CHECK 2: tenant_ai_cost_caps purpose CHECK admits the new purpose.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'tenant_ai_cost_caps_purpose_check';
  if v_def is null or v_def not like '%clarifying_questions_from_context%' then
    raise exception 'SMOKE FAIL: tenant_ai_cost_caps_purpose_check missing new purpose';
  end if;

  -- CHECK 3: ki_suggestions_purpose_check must NOT admit the new purpose
  -- (no suggestions are written — mirror of sentiment/coaching).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is not null and v_def like '%clarifying_questions_from_context%' then
    raise exception 'SMOKE FAIL: ki_suggestions_purpose_check must NOT contain clarifying_questions_from_context (copy-paste drift)';
  end if;

  -- CHECK 4: project_id is now nullable.
  select is_nullable into v_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'ki_runs'
      and column_name = 'project_id';
  if v_nullable is distinct from 'YES' then
    raise exception 'SMOKE FAIL: ki_runs.project_id is not nullable (is_nullable=%)', v_nullable;
  end if;

  -- CHECK 5: bounded CHECK exists (NULL only for the clarifying purpose).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_project_id_bounded_null';
  if v_def is null or v_def not like '%clarifying_questions_from_context%' then
    raise exception 'SMOKE FAIL: ki_runs_project_id_bounded_null missing or unbounded';
  end if;

  -- CHECK 6: wizard_draft_id correlation column exists.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ki_runs'
      and column_name = 'wizard_draft_id'
  ) then
    raise exception 'SMOKE FAIL: ki_runs.wizard_draft_id missing';
  end if;

  -- CHECK 7: the three additive tenant-scoped policies exist.
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'ki_runs'
      and policyname in (
        'ki_runs_select_member_tenant_draft',
        'ki_runs_insert_member_tenant_draft',
        'ki_runs_update_member_tenant_draft'
      )
  ) <> 3 then
    raise exception 'SMOKE FAIL: additive project-less ki_runs RLS policies incomplete';
  end if;

  raise notice 'PROJ-135 migration smoke checks passed.';
end
$smoke$;