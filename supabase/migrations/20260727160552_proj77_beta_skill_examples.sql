-- PROJ-77-β: skill_examples — reusable input/output example pairs per skill.
-- Admin-only authoring aid (not PM-facing in V1). Tenant-scoped, PROJ-10 audit.
-- Follows the PROJ-107 catalog recipe; audit trio patched from live defs via
-- anchor-replace + hard-fail assertions, authenticated EXECUTE re-granted.

create table if not exists public.skill_examples (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  input text not null,
  expected_output text not null,
  tags text[] not null default '{}',
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_examples_title_len check (char_length(title) between 1 and 200),
  constraint skill_examples_input_len check (char_length(input) between 1 and 20000),
  constraint skill_examples_output_len check (char_length(expected_output) between 1 and 20000)
);
create index if not exists skill_examples_skill_idx
  on public.skill_examples (skill_id, display_order, created_at);

alter table public.skill_examples enable row level security;

-- Admin-only (authoring aids; not PM-facing in V1).
create policy skill_examples_select_admin on public.skill_examples
  for select using (public.is_tenant_admin(tenant_id));
create policy skill_examples_insert_admin on public.skill_examples
  for insert with check (public.is_tenant_admin(tenant_id));
create policy skill_examples_update_admin on public.skill_examples
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy skill_examples_delete_admin on public.skill_examples
  for delete using (public.is_tenant_admin(tenant_id));

create trigger skill_examples_set_updated_at
  before update on public.skill_examples
  for each row execute function extensions.moddatetime('updated_at');
create trigger audit_changes_skill_examples
  after update on public.skill_examples
  for each row execute function record_audit_changes();

-- ============================================================
-- PROJ-10 audit wiring — patch live defs via anchor-replace + assert.
-- ============================================================
do $wire$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if d is null then raise exception 'audit_log_entity_type_check not found'; end if;
  execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
  execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
    || replace(d, '])))', ', ''skill_examples''::text])))');
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if position('''skill_examples''' in d) = 0 then
    raise exception 'entity_type CHECK patch did not apply';
  end if;
end
$wire$;

do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
  patched := replace(
    src,
    'else array[]::text[]',
    'when ''skill_examples'' then array[''title'',''input'',''expected_output'',''tags'',''display_order'']'
    || E'\n    else array[]::text[]'
  );
  if patched = src then raise exception '_tracked_audit_columns anchor not found'; end if;
  execute patched;
  if position('skill_examples' in pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)) = 0 then
    raise exception '_tracked_audit_columns patch did not apply';
  end if;
end
$wire$;
grant execute on function public._tracked_audit_columns(text) to authenticated;

do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
  patched := replace(
    src,
    'else return false;',
    'when ''skill_examples'' then return public.is_tenant_admin(p_tenant_id);'
    || E'\n    else return false;'
  );
  if patched = src then raise exception 'can_read_audit_entry anchor not found'; end if;
  execute patched;
  if position('skill_examples' in pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'can_read_audit_entry patch did not apply';
  end if;
end
$wire$;
grant execute on function public.can_read_audit_entry(text,uuid,uuid) to authenticated;
