-- PROJ-141-α1 · H-1 Hotfix — verenge RLS SELECT auf skill_versions
-- ============================================================
-- Befund (Cross-Session-Audit 2026-07-28): die Policy `skill_versions_select_member`
-- (Migration 20260723120849_proj76_skill_framework.sql:84–95) prüfte nur
-- `is_tenant_member` + `skills.is_active = true` — ohne `status`-Filter. Damit
-- konnten normale Tenant-Mitglieder alle `draft`- und `archived`-Zeilen aktiver
-- Skills direkt via Supabase-Client lesen (inkl. `frontmatter.allowed_actions`
-- und unveröffentlichtem `markdown_content`). Die admin-only API in
-- src/app/api/skills/[id]/versions/route.ts:21 schützte das nicht, weil RLS
-- die eigentliche Sicherheitsgrenze sein muss.
--
-- Widerspricht direkt PROJ-77-α-AC „Drafts sind unsichtbar für PMs".
-- α-QA prüfte Schreibschutz, nicht Lesbarkeit — deshalb 0-Critical-Ergebnis
-- trotz offener Lücke.
--
-- Fix: gleiche Policy-Struktur, aber der Member-Zweig verlangt zusätzlich
-- `skill_versions.status = 'active'`. Admins behalten volle Sicht
-- (draft/active/archived) für Katalog-Pflege + Rollback-Diff.
--
-- Insert/Update/Delete-Policies bleiben unverändert (admin-only, per
-- Sicherheits-Trigger + `activate_skill_version` DEFINER-RPC gesteuert).
--
-- Kein Datenverlust, kein Schema-Change — reine Policy-Verengung.

drop policy if exists skill_versions_select_member on public.skill_versions;

create policy skill_versions_select_member on public.skill_versions
  for select using (
    public.is_tenant_admin(tenant_id)
    or (
      public.is_tenant_member(tenant_id)
      and skill_versions.status = 'active'
      and exists (
        select 1 from public.skills s
        where s.id = skill_versions.skill_id and s.is_active = true
      )
    )
  );
