-- PROJ-141-α3 + α4 — activate-guard against archived + skill_version audit events + discard-RPC
-- ============================================================
-- Cross-Session-Audit 2026-07-28 fand zwei Vertragslücken in PROJ-77-α:
--
--   M-10: `activate_skill_version(uuid)` akzeptierte jede nicht-aktive
--   Version — auch `archived`. Widerspricht dem Immutable-Supersede-
--   Vertrag: Publish soll draft→active bedeuten, Rollback soll eine neue
--   Version erzeugen, historische Zeilen nie wiederverwendet werden. Die
--   UI bietet die Aktion nicht mehr an, aber der RPC-Vertrag erlaubte sie.
--
--   M-11: Vorgeschriebene Audit-Events `skill_version.published` und
--   `skill_version.draft_discarded` sowie ein Draft-Verwerfen-Endpunkt
--   fehlten komplett. Der bestehende UPDATE-Trigger schrieb bereits eine
--   Zeile mit field_name='status', aber ohne greppbaren Event-Namen, und
--   Draft-Verwerfen war noch nicht implementiert.
--
-- Fix (α3 + α4a + α4b) — kein Schema-Change, nur RPC-Änderungen + eine
-- neue RPC. Kein Touch am audit_log_entity_type_check (entity_type
-- 'skill_versions' ist seit PROJ-76 whitelisted), kein Touch an
-- can_read_audit_entry (Zweig für 'skill_versions' existiert), kein Touch
-- am _tracked_audit_columns (unser manueller Insert läuft nicht durch
-- den UPDATE-Trigger).

-- =====================================================================
-- α3 + α4a — activate_skill_version: archived-reject + published-event
-- =====================================================================
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
  v_version_number int;
  v_actor uuid := auth.uid();
begin
  select skill_id, tenant_id, status, version_number
    into v_skill, v_tenant, v_status, v_version_number
    from public.skill_versions where id = p_version_id;
  if v_skill is null then
    raise exception 'skill version not found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_admin(v_tenant) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  -- α3 (M-10): historische Versionen dürfen nicht direkt reaktiviert werden;
  --           dafür ist rollback_skill_version zuständig (kopiert Content in
  --           eine neue Draft-Zeile → aktiviert diese).
  if v_status = 'archived' then
    raise exception 'archived versions cannot be re-activated — create a new draft via rollback'
      using errcode = 'P0001';
  end if;
  -- Idempotent: bereits aktiv ist ein No-Op (kein published-Event).
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

  -- α4a (M-11): expliziter, greppbarer Publish-Event. Der Auto-UPDATE-
  -- Trigger schrieb ohnehin eine Zeile mit field_name='status'; dieser
  -- zusätzliche Eintrag mit field_name='published' macht den Übergang
  -- filterbar (audit_log_entries where field_name='published').
  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (v_tenant, 'skill_versions', p_version_id, 'published',
     to_jsonb('draft'::text), to_jsonb(v_version_number::text), v_actor,
     nullif(current_setting('audit.change_reason', true), ''));
end;
$$;

revoke execute on function public.activate_skill_version(uuid) from public, anon;
grant execute on function public.activate_skill_version(uuid) to authenticated;


-- =====================================================================
-- α4b — discard_skill_draft(uuid): admin-only Draft-Verwerfen + Audit
-- =====================================================================
-- Verwirft einen offenen Draft (Hard-Delete, weil Drafts ephemer sind
-- und nicht in der Version-Chain als "Zwischenstand" geführt werden).
-- Nur der Status `draft` ist gültig; `active` und `archived` bleiben
-- unberührt (Content-Immutabilität, PROJ-77-α-AC).
--
-- Der immutability-Trigger auf skill_versions ist BEFORE UPDATE — DELETE
-- benötigt keinen GUC-Bypass. Die DB-Delete-Policy ist admin-only, wir
-- prüfen die Rolle aber zusätzlich explizit für saubere Fehlermeldung.
--
-- Der Audit-Eintrag wird VOR dem DELETE geschrieben, damit die FK auf
-- entity_id (falls in Zukunft eine harte FK gesetzt wird) stabil bleibt
-- — audit_log_entries.entity_id ist heute untyped uuid, aber diese
-- Reihenfolge ist forward-safe.

create or replace function public.discard_skill_draft(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_skill uuid;
  v_tenant uuid;
  v_status text;
  v_version_number int;
  v_actor uuid := auth.uid();
begin
  select skill_id, tenant_id, status, version_number
    into v_skill, v_tenant, v_status, v_version_number
    from public.skill_versions where id = p_version_id;
  if v_skill is null then
    raise exception 'skill version not found' using errcode = 'P0002';
  end if;
  if not public.is_tenant_admin(v_tenant) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'only draft versions can be discarded (status=%)', v_status
      using errcode = 'P0001';
  end if;

  -- α4b (M-11) — expliziter Discard-Event. Vor dem DELETE, damit die
  -- Trigger-Chain sauber ist (audit-insert steht in derselben TX).
  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (v_tenant, 'skill_versions', p_version_id, 'discarded',
     to_jsonb('draft'::text), null::jsonb, v_actor,
     nullif(current_setting('audit.change_reason', true), ''));

  -- Hard-delete; die DB-Delete-Policy erlaubt admin only, unser DEFINER
  -- läuft mit Owner-Privilegien, die Admin-Prüfung oben ist der Gate.
  delete from public.skill_versions where id = p_version_id;
end;
$$;

revoke execute on function public.discard_skill_draft(uuid) from public, anon;
grant execute on function public.discard_skill_draft(uuid) to authenticated;

comment on function public.discard_skill_draft(uuid) is
  'PROJ-141-α4 · Verwirft einen offenen Draft (admin-only). '
  'Schreibt einen Audit-Eintrag mit field_name=discarded und löscht die '
  'Draft-Zeile. Andere Status (active/archived) werden mit P0001 abgelehnt.';
