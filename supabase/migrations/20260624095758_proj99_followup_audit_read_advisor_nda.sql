-- PROJ-99/128/129 D-FE-1 (QA followup): unblock the PROJ-10 HistoryTab for
-- ma_advisor_profiles and ma_ndas. Both tables' SELECT policy is exactly
-- is_project_member(project_id), so mapping their audit-read to the same
-- predicate introduces NO new visibility — it only lifts these entity types out
-- of the prior `else return false` default-deny. Mirrors the ma_project_profiles
-- case. Additive; no other case changes.
--
-- Repo filename version = prod-registered migration version (PROJ-134 convention).
-- Live-RPC smoke (rolled back, 0 residue): member.advisor=true member.nda=true |
-- nonmember.advisor=false nonmember.nda=false | admin.advisor=true.
create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then
    return true;
  end if;

  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then
      select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then
      select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then
      select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then
      select project_id into v_project from public.milestones where id = p_entity_id;
    when 'releases' then
      select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then
      select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project
      from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id
      where wid.id = p_entity_id;
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      select project_id into v_project from public.vendor_invoices where id = p_entity_id;
      if v_project is null then return false; end if;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    when 'sprints' then
      select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then
      select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then
      select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then
      select project_id into v_project from public.ma_ndas where id = p_entity_id;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;
