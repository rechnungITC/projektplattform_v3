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
  type RequiredInfo,
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

/**
 * Method-specific follow-up questions. Wizard Step 4 renders these
 * alongside the project type's `required_info`, deduplicated by `key`
 * (type wins on conflict). Empty array = "this method needs no extra
 * info beyond what the type already asks".
 */
const METHOD_REQUIRED_INFO: Record<ProjectMethod, readonly RequiredInfo[]> = {
  scrum: [
    {
      key: "sprint_length_weeks",
      label_de: "Sprint-Länge (Wochen)",
      description_de:
        "Übliche Sprint-Dauer (1–4 Wochen). Lässt sich später pro Sprint variieren.",
    },
    {
      key: "definition_of_done",
      label_de: "Definition of Done",
      description_de:
        "Welche Kriterien müssen Stories erfüllen, damit sie als fertig gelten?",
    },
  ],
  kanban: [
    {
      key: "wip_limits",
      label_de: "WIP-Limits",
      description_de:
        "Maximale parallele Items pro Spalte (z. B. In Progress = 3).",
    },
  ],
  safe: [
    {
      key: "pi_length_weeks",
      label_de: "PI-Länge (Wochen)",
      description_de:
        "Dauer eines Program Increments (typisch 8–12 Wochen).",
    },
    {
      key: "art_name",
      label_de: "ART (Agile Release Train)",
      description_de:
        "Name des ART, dem dieses Projekt zugeordnet ist.",
    },
  ],
  waterfall: [
    {
      key: "signoff_authority",
      label_de: "Phasen-Sign-off",
      description_de:
        "Wer gibt jede Phase final frei (Rolle / Person)?",
    },
  ],
  pmi: [
    {
      key: "phase_gate_authority",
      label_de: "Phase-Gate-Verantwortliche:r",
      description_de:
        "Rolle, die jedes Phase-Gate genehmigt (oft Sponsor oder Lenkungsausschuss).",
    },
  ],
  prince2: [
    {
      key: "project_board_composition",
      label_de: "Lenkungsausschuss",
      description_de:
        "Executive · Senior User · Senior Supplier — wer besetzt diese Rollen?",
    },
  ],
  vxt2: [
    {
      key: "phase_method_split",
      label_de: "Phasen-/Methoden-Aufteilung",
      description_de:
        "Welche Phasen werden klassisch geführt (z. B. Konzept), welche agil (z. B. Realisierung)?",
    },
  ],
}

/**
 * Merge two RequiredInfo lists. The first wins on key conflicts so the
 * project type's questions take precedence over the method's — types are
 * the more specific domain anchor in V2's metamodel.
 */
function mergeRequiredInfo(
  primary: readonly RequiredInfo[],
  secondary: readonly RequiredInfo[]
): readonly RequiredInfo[] {
  const seen = new Set(primary.map((info) => info.key))
  const additions = secondary.filter((info) => !seen.has(info.key))
  return [...primary, ...additions]
}

export function computeRules(
  type: ProjectType,
  method: ProjectMethod | null
): ProjectRules {
  const profile: ProjectTypeProfile = getProjectTypeProfile(type)
  const methodInfo =
    method !== null ? METHOD_REQUIRED_INFO[method] ?? [] : []
  return {
    active_modules: profile.standard_modules,
    suggested_roles: profile.standard_roles,
    required_info: mergeRequiredInfo(profile.required_info, methodInfo),
    starter_kinds: method === null ? [] : visibleStarterKinds(method),
  }
}
