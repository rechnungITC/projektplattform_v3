# PROJ-78: Skill-Projektzuordnung

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
Wizard-Erweiterung und Project-Room-Sidebar-Entry: When a project is created (or its method/project_type is changed), the system auto-assigns matching Skills based on `method_tags`, `project_type_tags`, and the `cross_cutting` category. The PM sees a confirmation step in the wizard and can remove auto-assigned skills or add others from the catalog. Inside the project room, a new "Skills" section in the method-aware sidebar shows the active set.

## Dependencies
- Requires: PROJ-76 (Skill-Framework — catalog source)
- Requires: PROJ-2 (Project CRUD) — wizard hook + `projects.project_method` column from PROJ-7
- Requires: PROJ-7 (Project Room) — sidebar entry slot
- Requires: PROJ-10 (Audit)
- Influences: PROJ-82 (Skill-driven AI Proposals) — looks up assigned skills at proposal time

## V2 Reference Material
- Conceptually adjacent to V2 method selection but skill auto-assign did not exist in V2.
- Method-template registry already in `src/lib/method-templates/` (PROJ-7 Tech Design).

## User Stories
- **[V3 SK-11]** As a PM, I want auto-assigned skills suggested in the project wizard based on the method and project type I selected, so that I do not have to pick each skill manually.
- **[V3 SK-12]** As a PM, I want to remove suggested skills or add others from the catalog before finishing the wizard, so that the final skill set matches my project reality.
- **[V3 SK-13]** As a PM, I want to see the active skills for my project on a dedicated sidebar entry inside the project room, so that I know which agent personas are in scope.
- **[V3 SK-14]** As a PM, I want to add or remove skills from my project after creation, so that the skill set can evolve with the project.

## Acceptance Criteria

### Data model
- [ ] Junction table `project_skills`: `id UUID PK, tenant_id UUID NOT NULL, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT, assignment_source TEXT NOT NULL CHECK (assignment_source IN ('auto_method','auto_project_type','auto_cross_cutting','manual_pm','manual_admin')), assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(), assigned_by UUID REFERENCES auth.users(id)`.
- [ ] Unique `(project_id, skill_id)`.
- [ ] Skill cannot be hard-deleted while referenced (FK ON DELETE RESTRICT); deactivate handled in PROJ-76.

### Auto-assignment logic at project creation
- [ ] Server function `resolveSkillsForProject(method, project_type, tenant_id)` returns the matching skill set:
  - All active skills where `category='method'` AND `method_tags` contains `method`.
  - All active skills where `category='project_type'` AND `project_type_tags` contains `project_type`.
  - All active skills where `category='cross_cutting'`.
- [ ] Results de-duplicated by `skill_id`.
- [ ] Empty matches return empty array (UI shows informational hint, not error).

### Wizard step "Skills"
- [ ] New wizard step "Skills" appears AFTER the method+project-type step.
- [ ] Shows the auto-resolved skill set as cards with: name, category badge, description, tags, source label (e.g. "method: scrum"), checkbox to deselect.
- [ ] Toolbar action "Aus Katalog hinzufügen" opens a multi-select dialog with all active skills the project does not yet have, with tag filter.
- [ ] PM may finish the wizard with zero skills assigned (with a soft warning).
- [ ] On wizard completion, `project_skills` rows are written with the chosen `assignment_source`.

### Project-room sidebar entry "Skills"
- [ ] Sidebar shows "Skills" entry under the method-driven sections (PROJ-7 sidebar pattern).
- [ ] Entry route `/projects/[id]/skills` lists active skills with category badges, description, and the assignment source.
- [ ] PM can:
  - Add another skill from the catalog (writes `assignment_source='manual_pm'`).
  - Remove a skill (deletes the junction row).
- [ ] Removal of an auto-assigned skill is allowed but flagged in audit as a manual override.

### Re-resolution on method or project_type change
- [ ] If `projects.project_method` or `projects.project_type` changes after creation, the system re-runs `resolveSkillsForProject` and presents a dialog to the PM: "These skills no longer match the new method; these are new candidates."
- [ ] PM accepts/rejects individually. System never silently removes a skill carrying `manual_pm` or `manual_admin` source.

### Audit
- [ ] Events: `project_skill.assigned`, `project_skill.removed`, `project_skill.re_resolved_offered`, `project_skill.re_resolved_applied`.

## Edge Cases
- **No matching skills in tenant catalog** → wizard step shows "Noch keine Skills für diese Kombination konfiguriert" with a deep-link for admins to create one.
- **Skill becomes inactive (PROJ-76) after assignment** → junction row stays; project_room "Skills" tab shows the skill greyed out with status badge "inaktiv"; PROJ-82 skips it at proposal time.
- **Skill is deleted (not supported V1, but if a future delete path lands)** → FK RESTRICT prevents it; admin must remove all assignments first.
- **Same skill auto-assigned via two routes** (e.g. method + cross_cutting) → de-dup at resolve time; `assignment_source` defaults to the first match in priority order: method → project_type → cross_cutting.
- **PM removes a skill, then changes method back** → re-resolution dialog re-offers it.
- **Wizard exited mid-flow** → no `project_skills` rows written; no orphan state.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Card`, `Checkbox`, `Dialog`, `Badge`).
- **Multi-tenant:** `tenant_id` enforced on `project_skills`; RLS via `is_tenant_member(tenant_id) AND is_project_member(project_id)`.
- **Validation:** Zod for wizard payload; enum check for `assignment_source`.
- **Auth:** Supabase Auth; PM project role required for project-room changes; admin role for backend admin overrides.
- **Performance:** Skill list for wizard is cached per tenant (reuse PROJ-76 cache). Project skill list cached per project for 60 s.
- **Audit hook:** PROJ-10.

## Out of Scope
- Conflict resolution between overlapping skills at runtime (PROJ-82).
- Per-project skill customizing (V1 keeps tenant-global content; PROJ-77 is admin-only).
- Bulk reassignment across multiple projects (admin admin tool, deferred).
- Skill recommendation engine ("you might also want X") — V2.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
