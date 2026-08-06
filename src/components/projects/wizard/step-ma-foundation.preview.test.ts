import { describe, expect, it } from "vitest"

import type {
  MaProjectTemplate,
  MaTemplateTask,
} from "@/lib/ma-project/templates-api"

import { buildTemplatePreview } from "./step-ma-foundation"

// PROJ-Y-96e — the wizard picker preview must surface the new task counts
// alongside workstreams + deliverables. Pinned so a future refactor cannot
// silently regress the AC "Vorschau zeigt N Aufgaben (M Sub-Aufgaben)".

const makeTask = (
  id: string,
  target_kind: "task" | "subtask"
): MaTemplateTask => ({
  id,
  template_id: "tpl",
  task_key: id,
  title: `Task ${id}`,
  description: null,
  target_kind,
  workstream_key: "commercial",
  phase_key: null,
  parent_task_key: target_kind === "subtask" ? "parent" : null,
  priority: null,
  estimated_days: null,
  due_date_offset_days: null,
  sort_order: 0,
})

const makeTemplate = (tasks: MaTemplateTask[]): MaProjectTemplate => ({
  id: "tpl",
  tenant_id: "tenant",
  template_key: "buy_side_standard",
  name: "Buy-Side M&A (Standard)",
  deal_side: "buy",
  description: null,
  version: 1,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  workstreams: [
    // 3 workstreams for the preview text — count is what matters.
    { id: "w1" } as unknown as MaProjectTemplate["workstreams"][number],
    { id: "w2" } as unknown as MaProjectTemplate["workstreams"][number],
    { id: "w3" } as unknown as MaProjectTemplate["workstreams"][number],
  ],
  deliverables: [
    { id: "d1" } as unknown as MaProjectTemplate["deliverables"][number],
    { id: "d2" } as unknown as MaProjectTemplate["deliverables"][number],
  ],
  tasks,
})

describe("buildTemplatePreview (PROJ-Y-96e wizard picker)", () => {
  it("shows only workstream + deliverable + task count when there are no subtasks", () => {
    const preview = buildTemplatePreview(
      makeTemplate([makeTask("a", "task"), makeTask("b", "task")])
    )
    expect(preview).toContain("3 Workstreams")
    expect(preview).toContain("2 Deliverables")
    expect(preview).toContain("2 Aufgaben")
    expect(preview).not.toContain("Sub-Aufgaben")
  })

  it("adds the subtask suffix in parentheses when subtasks exist", () => {
    const preview = buildTemplatePreview(
      makeTemplate([
        makeTask("a", "task"),
        makeTask("b", "task"),
        makeTask("s1", "subtask"),
        makeTask("s2", "subtask"),
      ])
    )
    expect(preview).toContain("2 Aufgaben")
    expect(preview).toContain("(2 Sub-Aufgaben)")
  })

  it("handles the empty-tasks case (α-only templates before backfill)", () => {
    const preview = buildTemplatePreview(makeTemplate([]))
    expect(preview).toContain("0 Aufgaben")
    expect(preview).not.toContain("Sub-Aufgaben")
  })

  it("prints the Buy-Side default shape (24 + 3) verbatim", () => {
    const seed = [
      ...Array.from({ length: 24 }, (_, i) => makeTask(`t${i}`, "task")),
      ...Array.from({ length: 3 }, (_, i) => makeTask(`s${i}`, "subtask")),
    ]
    const preview = buildTemplatePreview(makeTemplate(seed))
    expect(preview).toContain("24 Aufgaben")
    expect(preview).toContain("(3 Sub-Aufgaben)")
  })
})
