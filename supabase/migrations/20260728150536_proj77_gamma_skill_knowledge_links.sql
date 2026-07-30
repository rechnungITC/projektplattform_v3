-- PROJ-77-γ: skill_knowledge_links — link a skill to PROJ-79 DMS document nodes.
-- Admin-only. Consumed later by PROJ-80/82 retrieval. Tenant-scoped, PROJ-10 audit.
-- Same-tenant consistency (skill + node + tenant must all match) enforced by a
-- SECURITY DEFINER trigger (defense-in-depth beyond RLS).

create table if not exists public.skill_knowledge_links (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  document_node_id uuid not null references public.document_tree_nodes(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  include_subtree boolean not null default false,
  link_mode text not null check (link_mode in ('reference','required')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_knowledge_links_unique unique (skill_id, document_node_id)
);
create index if not exists skill_knowledge_links_skill_idx
  on public.skill_knowledge_links (skill_id);
create index if not exists skill_knowledge_links_node_idx
  on public.skill_knowledge_links (document_node_id);

alter table public.skill_knowledge_links enable row level security;

-- Admin-only (skill authoring surface; not PM-facing in V1).
create policy skill_knowledge_links_select_admin on public.skill_knowledge_links
  for select using (public.is_tenant_admin(tenant_id));
create policy skill_knowledge_links_insert_admin on public.skill_knowledge_links
  for insert with check (public.is_tenant_admin(tenant_id));
create policy skill_knowledge_links_update_admin on public.skill_knowledge_links
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy skill_knowledge_links_delete_admin on public.skill_knowledge_links
  for delete using (public.is_tenant_admin(tenant_id));

-- Same-tenant consistency: skill, node and tenant_id must all belong together.
-- A cross-tenant document node (or skill) is rejected regardless of RLS visibility.
create or replace function public.enforce_skill_knowledge_link_tenant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_node_tenant uuid;
  v_skill_tenant uuid;
begin
  select tenant_id into v_node_tenant from public.document_tree_nodes where id = NEW.document_node_id;
  select tenant_id into v_skill_tenant from public.skills where id = NEW.skill_id;
  if v_node_tenant is null
     or v_node_tenant is distinct from NEW.tenant_id
     or v_skill_tenant is distinct from NEW.tenant_id then
    raise exception 'skill_knowledge_links: skill, document node and tenant_id must all match'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
revoke execute on function public.enforce_skill_knowledge_link_tenant() from public, anon, authenticated;
create trigger skill_knowledge_links_enforce_tenant
  before insert or update on public.skill_knowledge_links
  for each row execute function public.enforce_skill_knowledge_link_tenant();

create trigger skill_knowledge_links_set_updated_at
  before update on public.skill_knowledge_links
  for each row execute function extensions.moddatetime('updated_at');
create trigger audit_changes_skill_knowledge_links
  after update on public.skill_knowledge_links
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
    || replace(d, '])))', ', ''skill_knowledge_links''::text])))');
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if position('''skill_knowledge_links''' in d) = 0 then
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
    'when ''skill_knowledge_links'' then array[''include_subtree'',''link_mode'',''document_node_id'']'
    || E'\n    else array[]::text[]'
  );
  if patched = src then raise exception '_tracked_audit_columns anchor not found'; end if;
  execute patched;
  if position('skill_knowledge_links' in pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)) = 0 then
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
    'when ''skill_knowledge_links'' then return public.is_tenant_admin(p_tenant_id);'
    || E'\n    else return false;'
  );
  if patched = src then raise exception 'can_read_audit_entry anchor not found'; end if;
  execute patched;
  if position('skill_knowledge_links' in pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'can_read_audit_entry patch did not apply';
  end if;
end
$wire$;
grant execute on function public.can_read_audit_entry(text,uuid,uuid) to authenticated;
