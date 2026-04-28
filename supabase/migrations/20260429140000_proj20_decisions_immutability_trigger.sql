-- =============================================================================
-- PROJ-20 fix H1 + M1: enforce decision immutability at the database level
-- =============================================================================
-- QA found that a project editor/lead could mutate a decision's body fields
-- (decision_text, rationale, decided_at, title, …) silently via direct
-- supabase.from('decisions').update(...). The RLS UPDATE policy permits the
-- row to be touched, and audit-tracked-columns covered only is_revised, so
-- the mutation left no audit trail. M1: the same surface allowed flipping
-- is_revised back from true to false, "resurrecting" a revised decision.
--
-- Both bugs share a root cause and one trigger fixes them: a BEFORE UPDATE
-- trigger on `decisions` that rejects ANY column change, except a one-way
-- is_revised: false → true that was initiated by the legitimate predecessor-
-- flip path (decisions_after_insert_flip_predecessor). The flip trigger
-- announces itself via a transaction-local GUC; the new trigger consumes it.
-- =============================================================================

create or replace function public.enforce_decision_immutability()
returns trigger
language plpgsql
as $$
declare
  v_flip_token text;
begin
  v_flip_token := nullif(current_setting('decisions.allow_revise_flip', true), '');
  if v_flip_token = '1' then
    perform set_config('decisions.allow_revise_flip', '', true);

    if NEW.is_revised <> true or OLD.is_revised <> false then
      raise exception
        'enforce_decision_immutability: flip path may only set is_revised true (was %, now %)',
        OLD.is_revised, NEW.is_revised
        using errcode = 'check_violation';
    end if;
    if NEW.title                  is distinct from OLD.title
       or NEW.decision_text          is distinct from OLD.decision_text
       or NEW.rationale              is distinct from OLD.rationale
       or NEW.decided_at             is distinct from OLD.decided_at
       or NEW.decider_stakeholder_id is distinct from OLD.decider_stakeholder_id
       or NEW.context_phase_id       is distinct from OLD.context_phase_id
       or NEW.context_risk_id        is distinct from OLD.context_risk_id
       or NEW.supersedes_decision_id is distinct from OLD.supersedes_decision_id
       or NEW.tenant_id              is distinct from OLD.tenant_id
       or NEW.project_id             is distinct from OLD.project_id
       or NEW.created_by             is distinct from OLD.created_by
       or NEW.created_at             is distinct from OLD.created_at
    then
      raise exception
        'enforce_decision_immutability: flip path may only change is_revised'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  raise exception
    'decisions are immutable. Create a revision via POST /api/projects/[id]/decisions with supersedes_decision_id.'
    using errcode = 'check_violation';
end;
$$;

revoke execute on function public.enforce_decision_immutability() from public, anon, authenticated;

create trigger decisions_enforce_immutability
  before update on public.decisions
  for each row
  execute function public.enforce_decision_immutability();

create or replace function public.decisions_after_insert_flip_predecessor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.supersedes_decision_id is not null then
    perform set_config('decisions.allow_revise_flip', '1', true);
    update public.decisions
       set is_revised = true
     where id = NEW.supersedes_decision_id
       and is_revised = false;
  end if;
  return NEW;
end;
$$;
