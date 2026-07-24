-- PROJ-76: Skill-Framework Foundation
-- Tenant-managed catalog of Skills (form-first authoring; the .md string is
-- serialised server-side, never parsed back — see ADR skills-data-model.md).
-- Two tables: skills (catalog) + skill_versions (immutable content snapshots).
-- Single active version enforced via partial-unique index + current_version_id.
-- Activate/rollback via SECURITY DEFINER RPCs (state-machine convention);
-- content immutability via BEFORE UPDATE trigger (mirrors PROJ-20 decisions).
-- Audit: both tables opt into PROJ-10; audit helper fns patched from LIVE defs
-- via anchor-replace + assertions, then authenticated EXECUTE re-granted.

-- ============================================================
-- skills — tenant-wide catalog entry
-- ============================================================
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  category text not null check (category in ('method','project_type','cross_cutting')),
  method_tags text[] not null default '{}',
  project_type_tags text[] not null default '{}',
  is_active boolean not null default false,
  current_version_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skills_name_len check (char_length(name) between 1 and 160),
  constraint skills_slug_len check (char_length(slug) between 1 and 80),
  constraint skills_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint skills_description_len check (char_length(description) <= 2000),
  constraint skills_tenant_slug_unique unique (tenant_id, slug)
);
create index if not exists skills_tenant_active_idx
  on public.skills (tenant_id, is_active);

-- ============================================================
-- skill_versions — immutable content snapshots
-- ============================================================
create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version_number integer not null,
  markdown_content text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  change_summary text,
  status text not null check (status in ('draft','active','archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint skill_versions_body_len check (char_length(markdown_content) <= 50000),
  constraint skill_versions_skill_number_unique unique (skill_id, version_number)
);
-- exactly one active version per skill
create unique index if not exists skill_versions_one_active_idx
  on public.skill_versions (skill_id) where status = 'active';
create index if not exists skill_versions_skill_idx
  on public.skill_versions (skill_id, version_number desc);

-- current-version pointer FK (added after skill_versions exists)
alter table public.skills
  add constraint skills_current_version_fk
  foreign key (current_version_id) references public.skill_versions(id) on delete set null;

-- ============================================================
-- RLS
-- ============================================================
alter table public.skills enable row level security;
alter table public.skill_versions enable row level security;

-- skills: read = admin OR (member AND active); write = admin
create policy skills_select_member on public.skills
  for select using (
    public.is_tenant_admin(tenant_id)
    or (public.is_tenant_member(tenant_id) and is_active = true)
  );
create policy skills_insert_admin on public.skills
  for insert with check (public.is_tenant_admin(tenant_id));
create policy skills_update_admin on public.skills
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy skills_delete_admin on public.skills
  for delete using (public.is_tenant_admin(tenant_id));

-- skill_versions: read inherits parent-skill visibility; write = admin
create policy skill_versions_select_member on public.skill_versions
  for select using (
    public.is_tenant_admin(tenant_id)
    or (
      public.is_tenant_member(tenant_id)
      and exists (
        select 1 from public.skills s
        where s.id = skill_versions.skill_id and s.is_active = true
      )
    )
  );
create policy skill_versions_insert_admin on public.skill_versions
  for insert with check (public.is_tenant_admin(tenant_id));
create policy skill_versions_update_admin on public.skill_versions
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy skill_versions_delete_admin on public.skill_versions
  for delete using (public.is_tenant_admin(tenant_id));

-- ============================================================
-- updated_at trigger on skills
-- ============================================================
create trigger skills_set_updated_at
  before update on public.skills
  for each row execute function extensions.moddatetime('updated_at');

-- ============================================================
-- skill_versions content immutability (mirrors PROJ-20 decisions)
-- Only `status` may change, and only via the activate/rollback RPCs
-- (they announce themselves via a transaction-local GUC token).
-- ============================================================
create or replace function public.enforce_skill_version_immutability()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
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
  raise exception 'skill versions are immutable; use activate/rollback RPCs to change status'
    using errcode = 'check_violation';
end;
$$;
revoke execute on function public.enforce_skill_version_immutability() from public, anon, authenticated;

create trigger skill_versions_enforce_immutability
  before update on public.skill_versions
  for each row execute function public.enforce_skill_version_immutability();

-- ============================================================
-- audit triggers (AFTER UPDATE only — record_audit_changes is UPDATE-diff)
-- ============================================================
create trigger audit_changes_skills
  after update on public.skills
  for each row execute function record_audit_changes();
create trigger audit_changes_skill_versions
  after update on public.skill_versions
  for each row execute function record_audit_changes();

-- ============================================================
-- activate_skill_version(version) — SECURITY DEFINER state-machine RPC.
-- Demotes the current active version to archived, promotes the target,
-- repoints skills.current_version_id. Admin re-checked via auth.uid().
-- ============================================================
create or replace function public.activate_skill_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_skill uuid;
  v_tenant uuid;
  v_status text;
begin
  select skill_id, tenant_id, status
    into v_skill, v_tenant, v_status
    from public.skill_versions where id = p_version_id;
  if v_skill is null then
    raise exception 'skill version not found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_admin(v_tenant) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if v_status = 'active' then
    return;
  end if;

  perform set_config('skills.allow_status_change', '1', true);
  update public.skill_versions
     set status = 'archived'
   where skill_id = v_skill and status = 'active';
  update public.skill_versions
     set status = 'active'
   where id = p_version_id;
  perform set_config('skills.allow_status_change', '', true);

  update public.skills
     set current_version_id = p_version_id
   where id = v_skill;
end;
$$;
revoke execute on function public.activate_skill_version(uuid) from public, anon;
grant execute on function public.activate_skill_version(uuid) to authenticated;

-- ============================================================
-- rollback_skill_version(version) — copies content of the target version
-- into a NEW draft version (number = max+1), then activates it. Never
-- mutates a historical row. Returns the new version id.
-- ============================================================
create or replace function public.rollback_skill_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_skill uuid;
  v_tenant uuid;
  v_src_number integer;
  v_next integer;
  v_md text;
  v_fm jsonb;
  v_new_id uuid;
begin
  select skill_id, tenant_id, version_number, markdown_content, frontmatter
    into v_skill, v_tenant, v_src_number, v_md, v_fm
    from public.skill_versions where id = p_version_id;
  if v_skill is null then
    raise exception 'skill version not found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_admin(v_tenant) then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.skill_versions where skill_id = v_skill;

  insert into public.skill_versions (
    skill_id, tenant_id, version_number, markdown_content, frontmatter,
    change_summary, status, created_by
  ) values (
    v_skill, v_tenant, v_next, v_md, v_fm,
    'Rollback auf v' || v_src_number, 'draft', auth.uid()
  ) returning id into v_new_id;

  perform public.activate_skill_version(v_new_id);
  return v_new_id;
end;
$$;
revoke execute on function public.rollback_skill_version(uuid) from public, anon;
grant execute on function public.rollback_skill_version(uuid) to authenticated;

-- ============================================================
-- PROJ-10 audit wiring — patch LIVE definitions via anchor-replace + assert.
-- (Full-recreate transcription avoided: high blast radius on all audited
--  tables. Anchor-replace fails hard if the anchor is missing.)
-- ============================================================

-- (1) entity_type CHECK: append skills + skill_versions
do $wire$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if d is null then
    raise exception 'audit_log_entity_type_check not found';
  end if;
  execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
  execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
    || replace(d, '])))', ', ''skills''::text, ''skill_versions''::text])))');
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if position('''skill_versions''' in d) = 0 then
    raise exception 'entity_type CHECK patch did not apply (anchor missing)';
  end if;
end
$wire$;

-- (2) _tracked_audit_columns: add branches for skills + skill_versions
do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
  patched := replace(
    src,
    'else array[]::text[]',
    'when ''skills'' then array[''name'',''slug'',''description'',''category'',''method_tags'',''project_type_tags'',''is_active'',''current_version_id'']'
    || E'\n    when ''skill_versions'' then array[''status'']'
    || E'\n    else array[]::text[]'
  );
  if patched = src then
    raise exception '_tracked_audit_columns anchor not found';
  end if;
  execute patched;
  if position('skill_versions' in pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)) = 0 then
    raise exception '_tracked_audit_columns patch did not apply';
  end if;
end
$wire$;
grant execute on function public._tracked_audit_columns(text) to authenticated;

-- (3) can_read_audit_entry: add branches (tenant-member gate, like other catalogs)
do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
  patched := replace(
    src,
    'else return false;',
    'when ''skills'' then return public.is_tenant_member(p_tenant_id);'
    || E'\n    when ''skill_versions'' then return public.is_tenant_member(p_tenant_id);'
    || E'\n    else return false;'
  );
  if patched = src then
    raise exception 'can_read_audit_entry anchor not found';
  end if;
  execute patched;
  if position('skill_versions' in pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'can_read_audit_entry patch did not apply';
  end if;
end
$wire$;
grant execute on function public.can_read_audit_entry(text,uuid,uuid) to authenticated;
