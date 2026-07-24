-- PROJ-77-α: editable drafts + updated_at.
-- Relaxes the PROJ-76 content-immutability trigger FOR DRAFTS ONLY:
-- a content change with no status-flag is allowed only when the row stays
-- 'draft' on both sides and identity fields are unchanged. active/archived
-- remain frozen; a draft->active/archived flip by a plain write still blocks
-- (promotion only via the activate/rollback RPCs, which keep the GUC path).
-- updated_at (auto via extensions.moddatetime) powers If-Match concurrency
-- and is intentionally NOT compared by the trigger.

alter table public.skill_versions
  add column if not exists updated_at timestamptz not null default now();

-- name 'set_updated_at' sorts AFTER 'enforce_immutability' → enforce runs first
-- (convention; order is functionally irrelevant since the trigger ignores updated_at).
create trigger skill_versions_set_updated_at
  before update on public.skill_versions
  for each row execute function extensions.moddatetime('updated_at');

create or replace function public.enforce_skill_version_immutability()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  -- (1) controlled status transitions — activate/rollback RPCs set this GUC.
  if nullif(current_setting('skills.allow_status_change', true), '') = '1' then
    if NEW.skill_id         is distinct from OLD.skill_id
       or NEW.tenant_id        is distinct from OLD.tenant_id
       or NEW.version_number   is distinct from OLD.version_number
       or NEW.markdown_content is distinct from OLD.markdown_content
       or NEW.frontmatter      is distinct from OLD.frontmatter
       or NEW.change_summary   is distinct from OLD.change_summary
       or NEW.created_by       is distinct from OLD.created_by
       or NEW.created_at       is distinct from OLD.created_at
    then
      raise exception 'enforce_skill_version_immutability: only status may change on a version'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;
  -- (2) PROJ-77-α: in-place draft edits. Security core = draft-in/draft-out
  -- double-check + identity frozen. updated_at deliberately not compared.
  if OLD.status = 'draft' and NEW.status = 'draft'
     and NEW.skill_id       is not distinct from OLD.skill_id
     and NEW.tenant_id      is not distinct from OLD.tenant_id
     and NEW.version_number is not distinct from OLD.version_number
     and NEW.created_by     is not distinct from OLD.created_by
     and NEW.created_at     is not distinct from OLD.created_at
  then
    return NEW;
  end if;
  -- (3) everything else — active/archived edits, plain-write promotions — blocked.
  raise exception 'skill versions are immutable; use activate/rollback RPCs to change status'
    using errcode = 'check_violation';
end;
$$;
revoke execute on function public.enforce_skill_version_immutability() from public, anon, authenticated;
