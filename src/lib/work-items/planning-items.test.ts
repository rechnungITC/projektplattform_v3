import { describe, expect, it } from "vitest"

import type { WorkItemWithProfile } from "@/types/work-item"

import { ganttRowItems, phaseListItems } from "./planning-items"

const PHASE = "00000000-0000-0000-0000-0000000000f1"

function item(
  overrides: Partial<WorkItemWithProfile> & { id: string },
): WorkItemWithProfile {
  return {
    tenant_id: "00000000-0000-0000-0000-00000000aaaa",
    project_id: "00000000-0000-0000-0000-00000000bbbb",
    kind: "task",
    parent_id: null,
    phase_id: null,
    milestone_id: null,
    sprint_id: null,
    title: "Test",
    description: null,
    status: "todo",
    priority: "medium",
    responsible_user_id: null,
    attributes: {},
    position: null,
    created_from_proposal_id: null,
    created_by: "00000000-0000-0000-0000-00000000cccc",
    created_at: "2026-08-28T12:00:00Z",
    updated_at: "2026-08-28T12:00:00Z",
    is_deleted: false,
    responsible: null,
    ...overrides,
  } as WorkItemWithProfile
}

// Die Prod-Lage, die den Defekt gezeigt hat: 18 Arbeitspakete ohne Phase,
// 22 Tasks, davon genau einer einer Phase zugeordnet.
const wpOhnePhase = item({ id: "wp-1", kind: "work_package" })
const wpMitPhase = item({ id: "wp-2", kind: "work_package", phase_id: PHASE })
const taskMitPhase = item({ id: "t-1", kind: "task", phase_id: PHASE })
const taskOhnePhase = item({ id: "t-2", kind: "task" })
const storyMitPhase = item({ id: "s-1", kind: "story", phase_id: PHASE })
const gelöschtMitPhase = item({
  id: "d-1",
  kind: "task",
  phase_id: PHASE,
  is_deleted: true,
})

const ALLE = [
  wpOhnePhase,
  wpMitPhase,
  taskMitPhase,
  taskOhnePhase,
  storyMitPhase,
  gelöschtMitPhase,
]

describe("phaseListItems", () => {
  it("nimmt einen zugeordneten Task auf — der Defekt, um den es geht", () => {
    expect(phaseListItems(ALLE).map((i) => i.id)).toContain("t-1")
  })

  it("nimmt jede Art auf, nicht nur Arbeitspakete", () => {
    expect(phaseListItems(ALLE).map((i) => i.id).sort()).toEqual([
      "s-1",
      "t-1",
      "wp-2",
    ])
  })

  it("lässt phasenlose Items weg — auch Arbeitspakete", () => {
    const ids = phaseListItems(ALLE).map((i) => i.id)
    expect(ids).not.toContain("wp-1")
    expect(ids).not.toContain("t-2")
  })

  it("lässt gelöschte Items weg", () => {
    expect(phaseListItems(ALLE).map((i) => i.id)).not.toContain("d-1")
  })
})

describe("ganttRowItems", () => {
  it("behält Arbeitspakete ohne Phase (Eimer 'ohne Phase')", () => {
    expect(ganttRowItems(ALLE).map((i) => i.id)).toContain("wp-1")
  })

  it("nimmt einen zugeordneten Task auf", () => {
    expect(ganttRowItems(ALLE).map((i) => i.id)).toContain("t-1")
  })

  it("lässt phasenlose Nicht-Arbeitspakete weg — sonst läuft der Eimer voll", () => {
    expect(ganttRowItems(ALLE).map((i) => i.id)).not.toContain("t-2")
  })

  it("lässt gelöschte Items weg", () => {
    expect(ganttRowItems(ALLE).map((i) => i.id)).not.toContain("d-1")
  })

  it("ist gegenüber der alten Regel echt weiter — Gegenkontrolle", () => {
    // Die alte Regel war `kind === "work_package"`. Wäre die neue Menge
    // damit identisch, würde dieser Test die Erweiterung nicht belegen.
    const alt = ALLE.filter((i) => !i.is_deleted && i.kind === "work_package")
    const neu = ganttRowItems(ALLE)
    expect(neu.length).toBeGreaterThan(alt.length)
  })
})
