/**
 * PROJ-27 — Work-Item-Link-Type Registry.
 *
 * Mirrors OpenProject's `Relation::TYPES` model (relates, precedes/follows,
 * blocks/blocked, duplicates/duplicated, includes/partof, requires/required)
 * and adds V3's `delivers/delivered_by` for the Waterfall→Scrum bridge.
 *
 * Storage is canonical — reverse tokens (`follows`, `blocked`, …) are
 * normalised to their canonical counterpart with from/to swapped
 * before INSERT. The DB trigger `canonicalize_link_type` is the source
 * of truth; this registry must stay drift-free with it (verified by
 * `link-types.test.ts`).
 */

export type WorkItemLinkType =
  | "relates"
  | "precedes"
  | "follows"
  | "blocks"
  | "blocked"
  | "duplicates"
  | "duplicated"
  | "includes"
  | "partof"
  | "requires"
  | "required"
  | "delivers"
  | "delivered_by"

export interface LinkTypeMeta {
  /** Whether this token is the canonical side (stored in DB). */
  canonical: boolean
  /** Symmetric tokens have no reverse (`relates`). */
  symmetric: boolean
  /** Reverse token if directional; null if symmetric. */
  reverse: WorkItemLinkType | null
  /** Group for the create-dialog Select (Lieferkette / Reihenfolge / Hindernis / Sonstiges). */
  group: WorkItemLinkGroup
  /** Whether `lag_days` is meaningful for this token. */
  supportsLag: boolean
  /** Label rendered when the user *looks at the from-side* of the link. */
  labelFromView: string
  /** Label rendered when the user looks at the to-side. */
  labelToView: string
}

export type WorkItemLinkGroup =
  | "delivery"
  | "sequence"
  | "blocker"
  | "duplicate"
  | "hierarchy"
  | "generic"

export const WORK_ITEM_LINK_GROUP_LABELS: Record<WorkItemLinkGroup, string> = {
  delivery: "Lieferkette",
  sequence: "Reihenfolge",
  blocker: "Hindernis",
  duplicate: "Duplikat",
  hierarchy: "Hierarchie",
  generic: "Sonstiges",
}

export const LINK_TYPES: readonly WorkItemLinkType[] = [
  "relates",
  "precedes",
  "follows",
  "blocks",
  "blocked",
  "duplicates",
  "duplicated",
  "includes",
  "partof",
  "requires",
  "required",
  "delivers",
  "delivered_by",
] as const

/**
 * Canonical-only pairs (used by canonicalize + UI label resolution).
 * Maps reverse → canonical and canonical → reverse for round-trip lookups.
 */
export const LINK_TYPE_PAIRS: Record<WorkItemLinkType, WorkItemLinkType | null> = {
  relates: null,
  precedes: "follows",
  follows: "precedes",
  blocks: "blocked",
  blocked: "blocks",
  duplicates: "duplicated",
  duplicated: "duplicates",
  includes: "partof",
  partof: "includes",
  requires: "required",
  required: "requires",
  delivers: "delivered_by",
  delivered_by: "delivers",
}

const META: Record<WorkItemLinkType, LinkTypeMeta> = {
  relates: {
    canonical: true,
    symmetric: true,
    reverse: null,
    group: "generic",
    supportsLag: false,
    labelFromView: "Bezieht sich auf",
    labelToView: "Bezieht sich auf",
  },
  precedes: {
    canonical: true,
    symmetric: false,
    reverse: "follows",
    group: "sequence",
    supportsLag: true,
    labelFromView: "Geht voran",
    labelToView: "Folgt nach",
  },
  follows: {
    canonical: false,
    symmetric: false,
    reverse: "precedes",
    group: "sequence",
    supportsLag: true,
    labelFromView: "Folgt nach",
    labelToView: "Geht voran",
  },
  blocks: {
    canonical: true,
    symmetric: false,
    reverse: "blocked",
    group: "blocker",
    supportsLag: false,
    labelFromView: "Blockiert",
    labelToView: "Wird blockiert von",
  },
  blocked: {
    canonical: false,
    symmetric: false,
    reverse: "blocks",
    group: "blocker",
    supportsLag: false,
    labelFromView: "Wird blockiert von",
    labelToView: "Blockiert",
  },
  duplicates: {
    canonical: true,
    symmetric: false,
    reverse: "duplicated",
    group: "duplicate",
    supportsLag: false,
    labelFromView: "Dupliziert",
    labelToView: "Wird dupliziert von",
  },
  duplicated: {
    canonical: false,
    symmetric: false,
    reverse: "duplicates",
    group: "duplicate",
    supportsLag: false,
    labelFromView: "Wird dupliziert von",
    labelToView: "Dupliziert",
  },
  includes: {
    canonical: true,
    symmetric: false,
    reverse: "partof",
    group: "hierarchy",
    supportsLag: false,
    labelFromView: "Enthält",
    labelToView: "Ist Teil von",
  },
  partof: {
    canonical: false,
    symmetric: false,
    reverse: "includes",
    group: "hierarchy",
    supportsLag: false,
    labelFromView: "Ist Teil von",
    labelToView: "Enthält",
  },
  requires: {
    canonical: true,
    symmetric: false,
    reverse: "required",
    group: "sequence",
    supportsLag: false,
    labelFromView: "Benötigt",
    labelToView: "Wird benötigt von",
  },
  required: {
    canonical: false,
    symmetric: false,
    reverse: "requires",
    group: "sequence",
    supportsLag: false,
    labelFromView: "Wird benötigt von",
    labelToView: "Benötigt",
  },
  delivers: {
    canonical: true,
    symmetric: false,
    reverse: "delivered_by",
    group: "delivery",
    supportsLag: false,
    labelFromView: "Liefert an",
    labelToView: "Wird geliefert von",
  },
  delivered_by: {
    canonical: false,
    symmetric: false,
    reverse: "delivers",
    group: "delivery",
    supportsLag: false,
    labelFromView: "Wird geliefert von",
    labelToView: "Liefert an",
  },
}

export const LINK_TYPE_META = META

export const CANONICAL_LINK_TYPES: readonly WorkItemLinkType[] = LINK_TYPES.filter(
  (t) => META[t].canonical,
)

/** Labels rendered perspectivisch. Keyed by the canonical token, with
 *  a `from`/`to` split. */
export const LINK_TYPE_LABELS: Record<
  WorkItemLinkType,
  { fromView: string; toView: string }
> = LINK_TYPES.reduce(
  (acc, t) => {
    acc[t] = { fromView: META[t].labelFromView, toView: META[t].labelToView }
    return acc
  },
  {} as Record<WorkItemLinkType, { fromView: string; toView: string }>,
)

export interface CanonicalLinkResolution {
  type: WorkItemLinkType
  /** When true, the from/to ids must be swapped before INSERT. */
  swap: boolean
}

/**
 * Normalises any token to its canonical form, signalling whether
 * from/to ids must be swapped. Mirrors the DB trigger
 * `canonicalize_link_type` — drift between these two is a Critical
 * bug because the UI would store reversed links.
 */
export function canonicalLinkType(token: WorkItemLinkType): CanonicalLinkResolution {
  const meta = META[token]
  if (meta.canonical) return { type: token, swap: false }
  return { type: meta.reverse as WorkItemLinkType, swap: true }
}

/** Returns the perspective-correct label for a token from a given viewpoint. */
export function linkTypeLabel(
  token: WorkItemLinkType,
  perspective: "from" | "to",
): string {
  return perspective === "from"
    ? META[token].labelFromView
    : META[token].labelToView
}

export interface LinkTypeOption {
  value: WorkItemLinkType
  label: string
  group: WorkItemLinkGroup
  supportsLag: boolean
}

/**
 * Options shown in the create-dialog Select. Both canonical *and*
 * reverse tokens are surfaced — the API canonicalises on the way in.
 * This is the UX nicety: "ich will sagen *folgt auf* statt *geht voran*".
 */
export function getLinkTypeOptions(): LinkTypeOption[] {
  return LINK_TYPES.map((value) => ({
    value,
    label: META[value].labelFromView,
    group: META[value].group,
    supportsLag: META[value].supportsLag,
  }))
}

/**
 * Approval-state of a link, mirrored 1:1 against the DB CHECK.
 */
export type WorkItemLinkApprovalState = "approved" | "pending" | "rejected"

export const WORK_ITEM_LINK_APPROVAL_STATE_LABELS: Record<
  WorkItemLinkApprovalState,
  string
> = {
  approved: "Bestätigt",
  pending: "Warten auf Bestätigung",
  rejected: "Abgelehnt",
}

// -----------------------------------------------------------------------------
// Hierarchy resolver (UI helper for the create-dialog banner)
// -----------------------------------------------------------------------------

export type LinkHierarchyKind = "same" | "hierarchy" | "cross"

interface ProjectRef {
  id: string
  parent_project_id?: string | null
}

/**
 * Classifies a from→to project relation for the create-dialog banner:
 * - `same` → same project, no approval needed
 * - `hierarchy` → parent/child via `parent_project_id`, auto-approved
 * - `cross` → unrelated tenant siblings, approval gate
 *
 * Falls back to `cross` whenever either project is unknown.
 */
export function resolveLinkHierarchy(
  fromProjectId: string,
  toProjectId: string,
  projects: Map<string, ProjectRef>,
): LinkHierarchyKind {
  if (fromProjectId === toProjectId) return "same"
  const from = projects.get(fromProjectId)
  const to = projects.get(toProjectId)
  if (!from || !to) return "cross"
  if (from.parent_project_id && from.parent_project_id === to.id) return "hierarchy"
  if (to.parent_project_id && to.parent_project_id === from.id) return "hierarchy"
  return "cross"
}
