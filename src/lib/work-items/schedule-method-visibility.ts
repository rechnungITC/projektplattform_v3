/**
 * PROJ-26: Method-gating registry for schedule constructs (sprints, phases,
 * milestones). Mirrors the work-item visibility pattern from PROJ-9
 * (`WORK_ITEM_METHOD_VISIBILITY` in `src/types/work-item.ts`) but applies
 * to the three schedule tables that did not previously have a method check.
 *
 * Defense in depth: the API layer reads this registry to return a clean 422,
 * while the DB trigger `enforce_<construct>_method_visibility` enforces the
 * same rule independent of the call path. Both must be updated together when
 * the visibility map changes.
 *
 * Method = NULL ("not yet chosen") accepts every construct — consistent with
 * PROJ-9's null-method behaviour during the project setup phase.
 */

import type { ProjectMethod } from "@/types/project-method"

export type ScheduleConstructKind = "sprints" | "phases" | "milestones"

export const SCHEDULE_CONSTRUCT_KINDS: readonly ScheduleConstructKind[] = [
  "sprints",
  "phases",
  "milestones",
] as const

export const SCHEDULE_CONSTRUCT_LABELS: Record<ScheduleConstructKind, string> =
  {
    sprints: "Sprint",
    phases: "Phase",
    milestones: "Meilenstein",
  }

/**
 * Methods in which each schedule construct may be created.
 *
 * - `sprints` belong to agile/iteration methods (Scrum, SAFe).
 * - `phases` and `milestones` belong to plan-driven methods
 *   (Waterfall, PMI, PRINCE2, VXT 2.0). VXT 2.0 is hybrid — its
 *   waterfall-side gets phases here; its agile-side runs in a Scrum
 *   sub-project (PROJ-27 bridge), so VXT 2.0 itself does not get sprints.
 * - SAFe deliberately does NOT get classical phases/milestones — Program
 *   Increment artefacts will be modelled separately when SAFe deepens.
 */
export const SCHEDULE_CONSTRUCT_METHOD_VISIBILITY: Record<
  ScheduleConstructKind,
  ProjectMethod[]
> = {
  sprints: ["scrum", "safe"],
  phases: ["waterfall", "pmi", "prince2", "vxt2"],
  milestones: ["waterfall", "pmi", "prince2", "vxt2"],
}

/**
 * True when the schedule construct may be created in the given project
 * method. When the method is `null` (project still in setup) every
 * construct is allowed, matching PROJ-9's null-method behaviour.
 */
export function isScheduleConstructAllowedInMethod(
  kind: ScheduleConstructKind,
  method: ProjectMethod | null
): boolean {
  if (method === null) return true
  return SCHEDULE_CONSTRUCT_METHOD_VISIBILITY[kind].includes(method)
}

/**
 * German user-facing message used when an INSERT is rejected. The message
 * names the construct and the offending method, and points the user toward
 * the sub-project bridge (PROJ-27) as the documented escape hatch.
 */
export function scheduleConstructRejectionMessage(
  kind: ScheduleConstructKind,
  method: ProjectMethod
): string {
  const label = SCHEDULE_CONSTRUCT_LABELS[kind]
  if (kind === "sprints") {
    return `${label}s sind in einem ${method.toUpperCase()}-Projekt nicht erlaubt. Lege ein Sub-Projekt mit Methode Scrum oder SAFe an, um die agile Umsetzung dort zu führen.`
  }
  return `${label}n sind in einem ${method.toUpperCase()}-Projekt nicht erlaubt. ${label}n leben in Wasserfall-, PMI-, PRINCE2- oder VXT 2.0-Projekten.`
}
