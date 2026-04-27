/**
 * Rule engine (PROJ-6) — pure function `computeRules(type, method)`.
 *
 * No DB access, no I/O. Combines:
 *   - the project type profile (active modules, suggested roles, required info)
 *   - the method's leading objects, intersected with `WORK_ITEM_METHOD_VISIBILITY`
 *
 * Used both server-side (API endpoints) and client-side (wizard preview).
 */

import {
  getProjectTypeProfile,
  type ProjectTypeProfile,
} from "@/lib/project-types/catalog"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"
import {
  WORK_ITEM_METHOD_VISIBILITY,
  WORK_ITEM_KINDS,
  type WorkItemKind,
} from "@/types/work-item"

import type { ProjectRules } from "./types"

/**
 * Mapping from method to the kinds that are "leading" — the structural
 * starter set the system suggests when the user picks this method. The
 * user can still create any kind allowed by `WORK_ITEM_METHOD_VISIBILITY`;
 * starter_kinds is just a starting point.
 *
 * Phases / milestones / work_packages live in their own tables (PROJ-19);
 * `work_package` is included here when applicable; phases/milestones are
 * created via the Project Room planning tab, not via starter_kinds.
 */
const STARTER_KINDS_BY_METHOD: Record<ProjectMethod, WorkItemKind[]> = {
  scrum: ["epic", "story", "task", "subtask", "bug"],
  kanban: ["story", "task", "bug"],
  safe: ["epic", "feature", "story", "task", "subtask", "bug"],
  waterfall: ["work_package", "task", "bug"],
  pmi: ["work_package", "task", "bug"],
  prince2: ["work_package", "task", "bug"],
  vxt2: ["work_package", "story", "task", "bug"],
}

/**
 * Filter starter kinds against the visibility registry — guarantees
 * consistency between the rule engine output and the work-item creation
 * gate (PROJ-9). If a method's starter set ever drifts from
 * `WORK_ITEM_METHOD_VISIBILITY`, the visible-only kinds win.
 */
function visibleStarterKinds(method: ProjectMethod): WorkItemKind[] {
  const visible = WORK_ITEM_KINDS.filter((kind) =>
    WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
  )
  const intended = STARTER_KINDS_BY_METHOD[method]
  return intended.filter((kind) => visible.includes(kind))
}

export function computeRules(
  type: ProjectType,
  method: ProjectMethod | null
): ProjectRules {
  const profile: ProjectTypeProfile = getProjectTypeProfile(type)
  return {
    active_modules: profile.standard_modules,
    suggested_roles: profile.standard_roles,
    required_info: profile.required_info,
    starter_kinds: method === null ? [] : visibleStarterKinds(method),
  }
}
