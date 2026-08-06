import { describe, expect, it } from "vitest"

import type { MaTemplateTask } from "@/lib/ma-project/templates-api"

import { countTasks } from "./ma-project-templates-page-client"

// PROJ-Y-96e — pure helper `countTasks` splits a mixed template.tasks[] into
// top-level task count vs subtask count. Used by the admin catalog to render
// "N Aufgaben (M Sub-Aufgaben)" in the header + section title.

const makeTask = (
  id: string,
  target_kind: "task" | "subtask",
  overrides: Partial<MaTemplateTask> = {}
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
  ...overrides,
})

describe("countTasks (PROJ-Y-96e)", () => {
  it("returns zeros for an empty array", () => {
    expect(countTasks([])).toEqual({ tasks: 0, subtasks: 0 })
  })

  it("counts only top-level tasks when there are no subtasks", () => {
    const tasks = [makeTask("a", "task"), makeTask("b", "task")]
    expect(countTasks(tasks)).toEqual({ tasks: 2, subtasks: 0 })
  })

  it("splits mixed arrays into task vs subtask buckets", () => {
    const tasks = [
      makeTask("a", "task"),
      makeTask("b", "subtask"),
      makeTask("c", "subtask"),
      makeTask("d", "task"),
    ]
    expect(countTasks(tasks)).toEqual({ tasks: 2, subtasks: 2 })
  })

  it("mirrors the Buy-Side default seed (24 tasks + 3 subtasks)", () => {
    // Sanity check that the AC1 count contract from the /backend pentest holds
    // at the UI helper level too.
    const seedShape = [
      ...Array.from({ length: 24 }, (_, i) => makeTask(`t${i}`, "task")),
      ...Array.from({ length: 3 }, (_, i) => makeTask(`s${i}`, "subtask")),
    ]
    expect(countTasks(seedShape)).toEqual({ tasks: 24, subtasks: 3 })
  })
})
