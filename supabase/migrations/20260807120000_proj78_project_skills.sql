-- PROJ-78: Skill-Projektzuordnung
-- ============================================================================
-- Junction `project_skills` (Projekt ↔ PROJ-76-Skill) + zwei SECURITY-DEFINER-
-- RPCs für Zuordnen/Entfernen inkl. EXPLIZITEM Audit.
--
-- Warum explizites Audit (und KEIN record_audit_changes-Trigger):
--   `record_audit_changes` ist ein AFTER-**UPDATE**-Diff (liest OLD/NEW).
--   Zuordnungen werden nur angelegt und gelöscht, nie geändert — der
--   Auto-Trigger würde also NIE eine Zeile schreiben. Die von der Spec
--   geforderten Ereignisse entstehen daher explizit in den RPCs
--   (Muster PROJ-141-α4, 20260729103200_…:78-84).
--   Folgerichtig: KEIN `_tracked_audit_columns`-Zweig (es gibt keinen
--   UPDATE-Pfad, der Zweig wäre toter Code).
--
-- Audit-Adressierung (bewusst): `entity_id` = **project_id**, nicht die
--   project_skills-Zeilen-id. Grund: beim `removed`-Event ist die Zeile
--   weg — ein Zeilen-Pointer wäre über `can_read_audit_entry` nicht mehr
--   auflösbar und der Eintrag damit dauerhaft unlesbar. Die Skill-Identität
--   steckt in old_value/new_value.
--
-- Berechtigung: Lesen = Projektmitglied; Schreiben = Projektleitung oder
--   Tenant-Admin (verschärft ggü. Spec-Erstfassung — ab PROJ-82 steuert das
--   Skill-Set das KI-Handlungsmandat; konsistent mit PROJ-102/104).
--
-- Audit-Helfer werden additiv per Anchor-Replace aus der LIVE-Definition
--   gepatcht (niemals Voll-Transkription — geteilter Zustand, 4 parallele
--   Slices) und der authenticated-Grant danach erneut gesetzt.

-- ============================================================
-- project_skills
-- ============================================================
create table if not exists public.project_skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- RESTRICT: ein Skill darf nicht hart gelöscht werden, solange er zugeordnet
  -- ist (Deaktivieren ist der vorgesehene Weg — PROJ-76).
  skill_id uuid not null references public.skills(id) on delete restrict,
  assignment_source text not null check (assignment_source in (
    'auto_method','auto_project_type','auto_cross_cutting','manual_pm','manual_admin'
  )),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  constraint project_skills_project_skill_unique unique (project_id, skill_id)
);

create index if not exists project_skills_project_idx
  on public.project_skills (project_id);
create index if not exists project_skills_skill_idx
  on public.project_skills (skill_id);
create index if not exists project_skills_tenant_idx
  on public.project_skills (tenant_id);

comment on table public.project_skills is
  'PROJ-78 — Zuordnung tenant-weiter Skills (PROJ-76) zu einem Projekt. '
  'Angelegt/entfernt ausschließlich über assign_project_skills / remove_project_skill '
  '(explizites Audit). Kein UPDATE-Pfad.';

-- ============================================================
-- Tenant-Konsistenz: Skill, Projekt und tenant_id müssen zusammengehören.
-- Verhindert, dass ein Admin mit zwei Tenants einen Fremd-Skill anhängt.
-- ============================================================
create or replace function public.enforce_project_skill_tenant_consistency()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_project_tenant uuid;
  v_skill_tenant uuid;
begin
  select tenant_id into v_project_tenant from public.projects where id = NEW.project_id;
  if v_project_tenant is null then
    raise exception 'project not found' using errcode = '23503';
  end if;
  select tenant_id into v_skill_tenant from public.skills where id = NEW.skill_id;
  if v_skill_tenant is null then
    raise exception 'skill not found' using errcode = '23503';
  end if;
  if v_project_tenant <> NEW.tenant_id or v_skill_tenant <> NEW.tenant_id then
    raise exception 'project_skills: tenant mismatch between project, skill and row'
      using errcode = '22023';
  end if;
  return NEW;
end;
$$;
revoke execute on function public.enforce_project_skill_tenant_consistency() from public, anon, authenticated;

drop trigger if exists project_skills_tenant_consistency on public.project_skills;
create trigger project_skills_tenant_consistency
  before insert on public.project_skills
  for each row execute function public.enforce_project_skill_tenant_consistency();

-- ============================================================
-- RLS
-- ============================================================
alter table public.project_skills enable row level security;

drop policy if exists project_skills_select_member on public.project_skills;
create policy project_skills_select_member on public.project_skills
  for select using (
    (select public.is_tenant_member(tenant_id))
    and (select public.is_project_member(project_id))
  );

-- Writes laufen normalerweise über die DEFINER-RPCs; die Policies sind die
-- zweite Verteidigungslinie für direkte Client-Zugriffe.
drop policy if exists project_skills_insert_lead on public.project_skills;
create policy project_skills_insert_lead on public.project_skills
  for insert with check (
    (select public.is_tenant_member(tenant_id))
    and (
      (select public.is_tenant_admin(tenant_id))
      or (select public.has_project_role(project_id, 'lead'))
    )
  );

drop policy if exists project_skills_delete_lead on public.project_skills;
create policy project_skills_delete_lead on public.project_skills
  for delete using (
    (select public.is_tenant_member(tenant_id))
    and (
      (select public.is_tenant_admin(tenant_id))
      or (select public.has_project_role(project_id, 'lead'))
    )
  );

-- Kein UPDATE-Pfad: bewusst keine UPDATE-Policy (default-deny).

-- ============================================================
-- assign_project_skills(project, assignments) -> jsonb
-- ============================================================
-- Idempotent: `on conflict do nothing`. Dadurch überschreibt ein
-- Automatismus NIE eine bestehende (z. B. manuelle) Zuordnung, und
-- `assigned_at` bleibt über Wiederholläufe stabil — PROJ-82 sortiert
-- danach.
--
-- Kein actor-Parameter (Impersonation-sicher, PROJ-94-Lektion): der
-- Handelnde ist immer auth.uid().
create or replace function public.assign_project_skills(
  p_project_id uuid,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_skill uuid;
  v_source text;
  v_skill_tenant uuid;
  v_skill_active boolean;
  v_skill_name text;
  v_skill_slug text;
  v_row_id uuid;
  v_assigned int := 0;
  v_skipped int := 0;
  v_count int;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'p_assignments must be a json array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_assignments);
  if v_count > 100 then
    raise exception 'too many assignments in one call (max 100, got %)', v_count
      using errcode = '22023';
  end if;

  select tenant_id into v_tenant
    from public.projects
   where id = p_project_id and is_deleted = false;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- Autorität: Projektleitung oder Tenant-Admin.
  if not (
    public.is_tenant_admin(v_tenant)
    or public.has_project_role(p_project_id, 'lead')
  ) then
    raise exception 'only project leads or tenant admins can assign skills'
      using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_assignments)
  loop
    v_skill := nullif(v_item->>'skill_id', '')::uuid;
    v_source := v_item->>'assignment_source';
    if v_skill is null then
      raise exception 'assignment entry is missing skill_id' using errcode = '22023';
    end if;
    if v_source is null then
      raise exception 'assignment entry is missing assignment_source' using errcode = '22023';
    end if;

    select tenant_id, is_active, name, slug
      into v_skill_tenant, v_skill_active, v_skill_name, v_skill_slug
      from public.skills where id = v_skill;
    if v_skill_tenant is null then
      raise exception 'skill % not found', v_skill using errcode = 'P0002';
    end if;
    if v_skill_tenant <> v_tenant then
      raise exception 'skill % belongs to a different tenant', v_skill using errcode = '42501';
    end if;
    -- Nur aktive Skills sind neu zuordenbar. (Eine bestehende Zuordnung
    -- überlebt eine spätere Deaktivierung — Spec-Edge-Case.)
    if not v_skill_active then
      raise exception 'skill % is not active and cannot be assigned', v_skill
        using errcode = '22023';
    end if;

    insert into public.project_skills
      (tenant_id, project_id, skill_id, assignment_source, assigned_by)
    values
      (v_tenant, p_project_id, v_skill, v_source, v_actor)
    on conflict (project_id, skill_id) do nothing
    returning id into v_row_id;

    if v_row_id is null then
      v_skipped := v_skipped + 1;
    else
      v_assigned := v_assigned + 1;
      -- Explizites Audit-Ereignis (der UPDATE-Trigger sieht INSERTs nicht).
      insert into public.audit_log_entries
        (tenant_id, entity_type, entity_id, field_name, old_value, new_value,
         actor_user_id, change_reason)
      values
        (v_tenant, 'project_skills', p_project_id, 'assigned', null::jsonb,
         jsonb_build_object(
           'project_skill_id', v_row_id,
           'skill_id', v_skill,
           'skill_slug', v_skill_slug,
           'skill_name', v_skill_name,
           'assignment_source', v_source
         ),
         v_actor, nullif(current_setting('audit.change_reason', true), ''));
    end if;
    v_row_id := null;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.assign_project_skills(uuid, jsonb) from public, anon;
grant execute on function public.assign_project_skills(uuid, jsonb) to authenticated;

-- ============================================================
-- remove_project_skill(project, skill) -> void
-- ============================================================
-- Das Entfernen einer auto_*-Zuordnung ist erlaubt, wird aber als manuelle
-- Übersteuerung gekennzeichnet (Spec-AC).
create or replace function public.remove_project_skill(
  p_project_id uuid,
  p_skill_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_row public.project_skills%rowtype;
  v_skill_name text;
  v_skill_slug text;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id into v_tenant
    from public.projects
   where id = p_project_id and is_deleted = false;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (
    public.is_tenant_admin(v_tenant)
    or public.has_project_role(p_project_id, 'lead')
  ) then
    raise exception 'only project leads or tenant admins can remove skills'
      using errcode = '42501';
  end if;

  select * into v_row from public.project_skills
   where project_id = p_project_id and skill_id = p_skill_id;
  if v_row.id is null then
    raise exception 'skill assignment not found' using errcode = 'P0002';
  end if;

  select name, slug into v_skill_name, v_skill_slug
    from public.skills where id = p_skill_id;

  -- Audit VOR dem DELETE (gleiche TX), analog PROJ-141-α4b.
  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value,
     actor_user_id, change_reason)
  values
    (v_tenant, 'project_skills', p_project_id, 'removed',
     jsonb_build_object(
       'project_skill_id', v_row.id,
       'skill_id', p_skill_id,
       'skill_slug', v_skill_slug,
       'skill_name', v_skill_name,
       'assignment_source', v_row.assignment_source,
       -- Spec-AC: Entfernen einer automatischen Zuordnung ist eine
       -- bewusste Übersteuerung und wird als solche markiert.
       'manual_override', (v_row.assignment_source like 'auto\_%')
     ),
     null::jsonb,
     v_actor, nullif(current_setting('audit.change_reason', true), ''));

  delete from public.project_skills where id = v_row.id;
end;
$$;

revoke execute on function public.remove_project_skill(uuid, uuid) from public, anon;
grant execute on function public.remove_project_skill(uuid, uuid) to authenticated;

-- ============================================================
-- PROJ-10 Audit-Verdrahtung — additiv per Anchor-Replace aus der LIVE-Def.
-- KEIN _tracked_audit_columns-Zweig (kein UPDATE-Pfad), KEIN Trigger.
-- ============================================================

-- (1) entity_type CHECK: 'project_skills' anhängen (idempotent)
do $wire$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if d is null then
    raise exception 'audit_log_entity_type_check not found';
  end if;
  if position('''project_skills''' in d) > 0 then
    return; -- schon vorhanden
  end if;
  execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
  execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
    || replace(d, '])))', ', ''project_skills''::text])))');
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if position('''project_skills''' in d) = 0 then
    raise exception 'entity_type CHECK patch did not apply (anchor missing)';
  end if;
  -- Regressionsschutz: die Zweige der Parallel-Slices müssen erhalten sein.
  if position('''skills''' in d) = 0
     or position('''skill_versions''' in d) = 0
     or position('''committees''' in d) = 0
     or position('''workstreams''' in d) = 0
     or position('''deliverables''' in d) = 0 then
    raise exception 'entity_type CHECK lost pre-existing branches — aborting';
  end if;
end
$wire$;

-- (2) can_read_audit_entry: project_skills → Projektmitgliedschaft.
--     entity_id ist die project_id (siehe Kopfkommentar) → direkt auflösbar,
--     auch für `removed`-Events, deren Junction-Zeile nicht mehr existiert.
do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
  if position('''project_skills''' in src) > 0 then
    return; -- schon vorhanden
  end if;
  patched := replace(
    src,
    'else return false;',
    'when ''project_skills'' then v_project := p_entity_id;'
    || E'\n    else return false;'
  );
  if patched = src then
    raise exception 'can_read_audit_entry anchor not found';
  end if;
  execute patched;
  src := pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure);
  if position('''project_skills''' in src) = 0 then
    raise exception 'can_read_audit_entry patch did not apply';
  end if;
  -- Regressionsschutz gegen versehentliches Droppen fremder Zweige.
  if position('''skill_knowledge_links''' in src) = 0
     or position('''committee_meetings''' in src) = 0
     or position('''deliverable_documents''' in src) = 0 then
    raise exception 'can_read_audit_entry lost pre-existing branches — aborting';
  end if;
end
$wire$;
-- Ein Recreate droppt den Grant → zwingend erneut setzen (PROJ-77-γ-Vorfall).
grant execute on function public.can_read_audit_entry(text,uuid,uuid) to authenticated;
