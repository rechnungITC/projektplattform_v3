/**
 * PROJ-70-δ — AC-δ8: parent-resolution-after-DnD +
 * ALLOWED_PARENT_KINDS-rejection + method-gate + cycle-guards.
 */

import { describe, expect, it } from "vitest"

import type {
  ProposalFromContextKind,
  ProposalFromContextSuggestionRow,
} from "./proposal-from-context-api"
import {
  applyReparent,
  checkReparent,
  isAllowedProposalParent,
  isProposalKindCompatibleWithMethod,
} from "./proposal-tree-rules"

function row(
  tempId: string,
  kind: ProposalFromContextKind,
  parentTempId: string | null,
): ProposalFromContextSuggestionRow {
  return {
    id: `id-${tempId}`,
    purpose: "proposal_from_context",
    status: "draft",
    accepted_entity_type: null,
    accepted_entity_id: null,
    created_at: "2026-06-06T00:00:00Z",
    accepted_at: null,
    payload: {
      temp_id: tempId,
      parent_temp_id: parentTempId,
      kind,
      title: `Row ${tempId}`,
      description: null,
      confidence: "medium",
    },
  } as unknown as ProposalFromContextSuggestionRow
}

/** Scrum tree: epic-1 → story-1 → task-1 → subtask-1; epic-2 sibling;
 *  task-2 top-level (NOT related to story-1 — for kind-rejection cases
 *  that must not trip the descendant-cycle guard first). */
const SCRUM_ROWS = [
  row("epic-1", "epic", null),
  row("story-1", "story", "epic-1"),
  row("task-1", "task", "story-1"),
  row("subtask-1", "subtask", "task-1"),
  row("epic-2", "epic", null),
  row("task-2", "task", null),
]

/** Waterfall tree: phase-1 → wp-1 → todo-1; phase-2 sibling. */
const WF_ROWS = [
  row("phase-1", "phase", null),
  row("wp-1", "work_package", "phase-1"),
  row("todo-1", "todo", "wp-1"),
  row("phase-2", "phase", null),
]

describe("isAllowedProposalParent — AC-δ5 structural matrix", () => {
  it("mirrors PROJ-9 rules for scrum kinds", () => {
    expect(isAllowedProposalParent("story", "epic")).toBe(true)
    expect(isAllowedProposalParent("task", "story")).toBe(true)
    expect(isAllowedProposalParent("subtask", "task")).toBe(true)
    // Spec example: "Story darf nicht Kind von Task werden"
    expect(isAllowedProposalParent("story", "task")).toBe(false)
    expect(isAllowedProposalParent("epic", "story")).toBe(false)
    // Subtask requires a task parent — no top-level subtasks.
    expect(isAllowedProposalParent("subtask", null)).toBe(false)
    expect(isAllowedProposalParent("subtask", "story")).toBe(false)
  })

  it("covers the waterfall WBS kinds (ADR-004)", () => {
    expect(isAllowedProposalParent("work_package", "phase")).toBe(true)
    expect(isAllowedProposalParent("work_package", "work_package")).toBe(true)
    expect(isAllowedProposalParent("todo", "work_package")).toBe(true)
    expect(isAllowedProposalParent("phase", null)).toBe(true)
    // Phases never nest; todos never sit under phases directly.
    expect(isAllowedProposalParent("phase", "phase")).toBe(false)
    expect(isAllowedProposalParent("todo", "phase")).toBe(false)
  })

  it("lets bug attach broadly but not under bug (PROJ-9 mirror)", () => {
    expect(isAllowedProposalParent("bug", "story")).toBe(true)
    expect(isAllowedProposalParent("bug", "work_package")).toBe(true)
    expect(isAllowedProposalParent("bug", null)).toBe(true)
    expect(isAllowedProposalParent("bug", "bug")).toBe(false)
    expect(isAllowedProposalParent("bug", "phase")).toBe(false)
  })

  it("task may sit under story OR work_package (PROJ-36 hybrid rule)", () => {
    expect(isAllowedProposalParent("task", "work_package")).toBe(true)
    expect(isAllowedProposalParent("task", "epic")).toBe(false)
  })
})

describe("isProposalKindCompatibleWithMethod — AC-δ6", () => {
  it("blocks scrum kinds in waterfall and vice versa", () => {
    expect(isProposalKindCompatibleWithMethod("epic", "waterfall")).toBe(false)
    expect(isProposalKindCompatibleWithMethod("phase", "scrum")).toBe(false)
    expect(isProposalKindCompatibleWithMethod("phase", "waterfall")).toBe(true)
    expect(isProposalKindCompatibleWithMethod("story", "scrum")).toBe(true)
  })

  it("passes everything for hybrid/unknown/null methods", () => {
    expect(isProposalKindCompatibleWithMethod("epic", null)).toBe(true)
    expect(isProposalKindCompatibleWithMethod("phase", "hybrid")).toBe(true)
  })
})

describe("checkReparent — combined gates + guards", () => {
  it("allows story → other epic (spec example)", () => {
    expect(checkReparent(SCRUM_ROWS, "story-1", "epic-2", "scrum")).toEqual({
      allowed: true,
      reason: null,
    })
  })

  it("rejects story → task (kind_not_allowed, AC-δ5)", () => {
    expect(checkReparent(SCRUM_ROWS, "story-1", "task-2", "scrum")).toEqual({
      allowed: false,
      reason: "kind_not_allowed",
    })
  })

  it("descendant-cycle guard fires before the kind gate on own-subtree drops", () => {
    expect(checkReparent(SCRUM_ROWS, "story-1", "task-1", "scrum").reason).toBe(
      "descendant_cycle",
    )
  })

  it("rejects self-drop", () => {
    expect(checkReparent(SCRUM_ROWS, "epic-1", "epic-1", null).reason).toBe(
      "self_drop",
    )
  })

  it("rejects drop onto own descendant (descendant_cycle)", () => {
    // epic-1 → subtask-1 is structurally illegal anyway, so use a case
    // where the kind WOULD be legal: drag story-1 onto task-1's child?
    // task-1 is story-1's descendant and task accepts no story — use
    // work_package nesting instead, which IS self-nestable.
    const rows = [
      row("wp-a", "work_package", null),
      row("wp-b", "work_package", "wp-a"),
      row("wp-c", "work_package", "wp-b"),
    ]
    expect(checkReparent(rows, "wp-a", "wp-c", "waterfall").reason).toBe(
      "descendant_cycle",
    )
  })

  it("rejects method-incompatible drops (AC-δ6)", () => {
    // Mixed AI output: an epic in a waterfall project. Moving the todo
    // under the epic is structurally fine for bug-like kinds but todo
    // only allows work_package/null → use task under story in waterfall:
    const mixed = [
      row("story-x", "story", null),
      row("task-x", "task", null),
    ]
    // task → story is structurally allowed, but story+task are not
    // waterfall kinds → method gate fires.
    expect(checkReparent(mixed, "task-x", "story-x", "waterfall").reason).toBe(
      "method_incompatible",
    )
    // Same drop in a scrum project passes.
    expect(checkReparent(mixed, "task-x", "story-x", "scrum").allowed).toBe(
      true,
    )
  })

  it("rejects unknown temp_ids", () => {
    expect(checkReparent(SCRUM_ROWS, "ghost", null, null).reason).toBe(
      "unknown_node",
    )
    expect(checkReparent(SCRUM_ROWS, "story-1", "ghost", null).reason).toBe(
      "unknown_node",
    )
  })

  it("validates outdent to top-level (null parent)", () => {
    expect(checkReparent(SCRUM_ROWS, "story-1", null, "scrum").allowed).toBe(
      true,
    )
    // subtask must keep a task parent — outdent to top-level rejected.
    expect(checkReparent(SCRUM_ROWS, "subtask-1", null, "scrum").reason).toBe(
      "kind_not_allowed",
    )
  })
})

describe("applyReparent — AC-δ4/δ8 parent-resolution-after-DnD", () => {
  it("flips parent_temp_id immutably on a valid move", () => {
    const result = applyReparent(SCRUM_ROWS, "story-1", "epic-2", "scrum")
    expect(result.changed).toBe(true)
    const moved = result.rows.find((r) => r.payload.temp_id === "story-1")
    expect(moved?.payload.parent_temp_id).toBe("epic-2")
    // Original input untouched (pure function).
    expect(
      SCRUM_ROWS.find((r) => r.payload.temp_id === "story-1")?.payload
        .parent_temp_id,
    ).toBe("epic-1")
    // Children of the moved node keep their parent pointers (subtree
    // moves implicitly — task-1 still points at story-1).
    expect(
      result.rows.find((r) => r.payload.temp_id === "task-1")?.payload
        .parent_temp_id,
    ).toBe("story-1")
  })

  it("returns the input unchanged on an invalid move", () => {
    const result = applyReparent(SCRUM_ROWS, "story-1", "task-2", "scrum")
    expect(result.changed).toBe(false)
    expect(result.rows).toBe(SCRUM_ROWS)
    expect(result.check.reason).toBe("kind_not_allowed")
  })

  it("treats drop-on-current-parent as a no-op (nothing to flush)", () => {
    const result = applyReparent(SCRUM_ROWS, "story-1", "epic-1", "scrum")
    expect(result.changed).toBe(false)
    expect(result.check.allowed).toBe(true)
  })

  it("moves a waterfall todo to another work_package", () => {
    const rows = [...WF_ROWS, row("wp-2", "work_package", "phase-2")]
    const result = applyReparent(rows, "todo-1", "wp-2", "waterfall")
    expect(result.changed).toBe(true)
    expect(
      result.rows.find((r) => r.payload.temp_id === "todo-1")?.payload
        .parent_temp_id,
    ).toBe("wp-2")
  })

  it("supports outdent (Tab/Shift+Tab path uses the same helper)", () => {
    const result = applyReparent(SCRUM_ROWS, "story-1", null, "scrum")
    expect(result.changed).toBe(true)
    expect(
      result.rows.find((r) => r.payload.temp_id === "story-1")?.payload
        .parent_temp_id,
    ).toBeNull()
  })
})
