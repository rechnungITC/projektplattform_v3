/**
 * PROJ-70-δ — pure validation + mutation rules for DnD-reparenting in
 * the Backlog-Proposal review tree.
 *
 * Two gates, evaluated in order (δ-architecture § C):
 *   1. `isAllowedProposalParent` — structural parent matrix. Mirrors
 *      PROJ-9 `ALLOWED_PARENT_KINDS` for the work-item kinds and extends
 *      it with the waterfall-WBS kinds (`phase`, `work_package`, `todo`
 *      per ADR-004 hierarchy) that exist only in the proposal payload
 *      union (`ProposalFromContextKind`), not in `WorkItemKind`.
 *   2. `isProposalKindCompatibleWithMethod` — PROJ-6 method-visibility.
 *      Same matrix the β-Accept-RPC enforces server-side (strict mode);
 *      checking client-side prevents drops that would make the whole
 *      batch unacceptable.
 *
 * `applyReparent` is the single state-mutation helper used by both the
 * drag-handler AND the Tab/Shift+Tab keyboard path — kept pure so
 * AC-δ8's "parent-resolution-after-DnD" is unit-testable without DOM.
 *
 * No persistence here: drops only mutate local suggestion state
 * (δ-architecture: "pure UI-mutation slice"); the β-PATCH route +
 * bulk-accept RPC handle persistence.
 */

import type {
  ProposalFromContextKind,
  ProposalFromContextSuggestionRow,
} from "./proposal-from-context-api"

/**
 * Allowed parent kinds per child kind for proposal trees.
 * `null` = may be top-level.
 *
 * Waterfall branch (ADR-004 WBS): phase → work_package → todo;
 * work_packages nest (PROJ-36 multi-level WBS).
 * Scrum branch (PROJ-9): epic → story → task → subtask; bug attaches
 * almost anywhere (PROJ-9 rule, minus `feature` which is not a proposal
 * kind).
 */
export const PROPOSAL_ALLOWED_PARENT_KINDS: Record<
  ProposalFromContextKind,
  ReadonlyArray<ProposalFromContextKind | null>
> = {
  phase: [null],
  work_package: ["phase", "work_package", null],
  todo: ["work_package", null],
  epic: [null],
  story: ["epic", null],
  task: ["story", "work_package", null],
  subtask: ["task"],
  bug: ["epic", "story", "task", "subtask", "work_package", null],
}

/** AC-δ5 — structural gate. Pass `null` parentKind for "top-level". */
export function isAllowedProposalParent(
  childKind: ProposalFromContextKind,
  parentKind: ProposalFromContextKind | null,
): boolean {
  return PROPOSAL_ALLOWED_PARENT_KINDS[childKind].includes(parentKind)
}

/**
 * Method → allowed kinds (mirror of the β-Accept-RPC's strict
 * validation, `accept_proposal_from_context_bulk`). Hybrid + unknown
 * methods accept all kinds.
 */
export const PROPOSAL_ALLOWED_KINDS_BY_METHOD: Record<
  string,
  ReadonlySet<ProposalFromContextKind>
> = {
  waterfall: new Set(["phase", "work_package", "todo"]),
  Wasserfall: new Set(["phase", "work_package", "todo"]),
  scrum: new Set(["epic", "story", "task", "subtask", "bug"]),
  Scrum: new Set(["epic", "story", "task", "subtask", "bug"]),
  agile: new Set(["epic", "story", "task", "subtask", "bug"]),
  Agile: new Set(["epic", "story", "task", "subtask", "bug"]),
  kanban: new Set(["epic", "story", "task", "subtask", "bug"]),
}

/** AC-δ6 — method gate (AC-β7 mirror). `null` method allows all. */
export function isProposalKindCompatibleWithMethod(
  kind: ProposalFromContextKind,
  projectMethod: string | null,
): boolean {
  if (!projectMethod) return true
  const allowed = PROPOSAL_ALLOWED_KINDS_BY_METHOD[projectMethod]
  if (!allowed) return true
  return allowed.has(kind)
}

export type ReparentRejection =
  | "self_drop"
  | "descendant_cycle"
  | "kind_not_allowed"
  | "method_incompatible"
  | "unknown_node"

export interface ReparentCheck {
  allowed: boolean
  reason: ReparentRejection | null
}

/** Find a draft row by its payload temp_id. */
function findByTempId(
  rows: ProposalFromContextSuggestionRow[],
  tempId: string,
): ProposalFromContextSuggestionRow | undefined {
  return rows.find((r) => r.payload.temp_id === tempId)
}

/** Walk the parent chain of `startTempId` upwards; true when
 *  `needleTempId` appears (i.e. needle is an ancestor of start). */
function isAncestor(
  rows: ProposalFromContextSuggestionRow[],
  needleTempId: string,
  startTempId: string,
): boolean {
  let cursor: string | null = startTempId
  const seen = new Set<string>()
  while (cursor) {
    if (seen.has(cursor)) return false // defensive: corrupt cycle in data
    seen.add(cursor)
    if (cursor === needleTempId) return true
    cursor = findByTempId(rows, cursor)?.payload.parent_temp_id ?? null
  }
  return false
}

/**
 * Validate a reparent request (both gates + cycle/self guards).
 * `newParentTempId === null` = move to top-level.
 */
export function checkReparent(
  rows: ProposalFromContextSuggestionRow[],
  dragTempId: string,
  newParentTempId: string | null,
  projectMethod: string | null,
): ReparentCheck {
  const dragged = findByTempId(rows, dragTempId)
  if (!dragged) return { allowed: false, reason: "unknown_node" }

  if (newParentTempId === dragTempId) {
    return { allowed: false, reason: "self_drop" }
  }

  let parentKind: ProposalFromContextKind | null = null
  if (newParentTempId !== null) {
    const parent = findByTempId(rows, newParentTempId)
    if (!parent) return { allowed: false, reason: "unknown_node" }
    // Dropping onto one's own descendant would detach the subtree into
    // a cycle — react-arborist blocks this for drags, but the keyboard
    // path needs the guard too.
    if (isAncestor(rows, dragTempId, newParentTempId)) {
      return { allowed: false, reason: "descendant_cycle" }
    }
    parentKind = parent.payload.kind
  }

  // Gate 1 — structural (AC-δ5).
  if (!isAllowedProposalParent(dragged.payload.kind, parentKind)) {
    return { allowed: false, reason: "kind_not_allowed" }
  }

  // Gate 2 — method (AC-δ6). The dragged node's kind must stay
  // method-visible; a structurally-legal drop must not create a
  // method-illegal pairing (e.g. scrum-kind under waterfall parent).
  if (
    !isProposalKindCompatibleWithMethod(dragged.payload.kind, projectMethod) ||
    (parentKind !== null &&
      !isProposalKindCompatibleWithMethod(parentKind, projectMethod))
  ) {
    return { allowed: false, reason: "method_incompatible" }
  }

  return { allowed: true, reason: null }
}

export interface ApplyReparentResult {
  rows: ProposalFromContextSuggestionRow[]
  changed: boolean
  check: ReparentCheck
}

/**
 * AC-δ4 — pure parent-resolution. Returns a NEW rows array with the
 * dragged row's `payload.parent_temp_id` flipped when the move is
 * valid; the original array is never mutated. Invalid moves return the
 * input array unchanged plus the rejection reason (callers render the
 * drop-disabled cue from `disableDrop`; this is the final guard).
 */
export function applyReparent(
  rows: ProposalFromContextSuggestionRow[],
  dragTempId: string,
  newParentTempId: string | null,
  projectMethod: string | null,
): ApplyReparentResult {
  const check = checkReparent(rows, dragTempId, newParentTempId, projectMethod)
  if (!check.allowed) return { rows, changed: false, check }

  const dragged = findByTempId(rows, dragTempId)
  if (!dragged) {
    return { rows, changed: false, check: { allowed: false, reason: "unknown_node" } }
  }
  if (dragged.payload.parent_temp_id === newParentTempId) {
    // No-op move (dropped on current parent) — nothing to flush later.
    return { rows, changed: false, check }
  }

  const next = rows.map((r) =>
    r.payload.temp_id === dragTempId
      ? {
          ...r,
          payload: { ...r.payload, parent_temp_id: newParentTempId },
        }
      : r,
  )
  return { rows: next, changed: true, check }
}
