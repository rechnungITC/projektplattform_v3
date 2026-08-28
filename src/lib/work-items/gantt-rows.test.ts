import { describe, expect, it } from "vitest"

import type { Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

import {
  buildGanttRows,
  effectiveDates,
  itemRowKey,
  phaseRowKey,
  UNPHASED_BUCKET_KEY,
} from "./gantt-rows"

const PHASE_ID = "00000000-0000-0000-0000-0000000000f1"
const PHASE_2_ID = "00000000-0000-0000-0000-0000000000f2"

function phase(overrides: Partial<Phase> & { id: string }): Phase {
  return {
    tenant_id: "00000000-0000-0000-0000-00000000aaaa",
    project_id: "00000000-0000-0000-0000-00000000bbbb",
    name: "Phase",
    sequence_number: 1,
    status: "planned",
    planned_start: null,
    planned_end: null,
    is_deleted: false,
    created_at: "2026-08-28T12:00:00Z",
    updated_at: "2026-08-28T12:00:00Z",
    ...overrides,
  } as Phase
}

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

describe("effectiveDates", () => {
  it("nimmt die eigenen Termine, wenn gesetzt", () => {
    const result = effectiveDates(
      item({ id: "a", planned_start: "2026-09-01", planned_end: "2026-09-05" }),
    )
    expect(result).toEqual({
      start: "2026-09-01",
      end: "2026-09-05",
      source: "own",
    })
  })

  it("faellt auf die abgeleiteten Termine zurueck — der Sammelvorgang", () => {
    const result = effectiveDates(
      item({
        id: "a",
        derived_planned_start: "2026-09-02",
        derived_planned_end: "2026-09-09",
      }),
    )
    expect(result).toEqual({
      start: "2026-09-02",
      end: "2026-09-09",
      source: "derived",
    })
  })

  it("bevorzugt eigene Termine vor abgeleiteten — MS-Project-Semantik", () => {
    const result = effectiveDates(
      item({
        id: "a",
        planned_start: "2026-09-01",
        planned_end: "2026-09-03",
        derived_planned_start: "2026-08-01",
        derived_planned_end: "2026-12-31",
      }),
    )
    expect(result.source).toBe("own")
    expect(result.start).toBe("2026-09-01")
  })

  it("meldet 'none', wenn es nichts abzuleiten gibt", () => {
    expect(effectiveDates(item({ id: "a" })).source).toBe("none")
  })
})

describe("buildGanttRows — Hierarchie", () => {
  // Die Prod-Lage aus AUE_0001: das Arbeitspaket haengt an der Phase, die
  // Tasks haengen per parent_id am Arbeitspaket und tragen KEINE phase_id.
  const p = phase({
    id: PHASE_ID,
    planned_start: "2026-08-28",
    planned_end: "2026-09-26",
  })
  const wp = item({ id: "wp-1", kind: "work_package", phase_id: PHASE_ID })
  const taskA = item({ id: "t-a", parent_id: "wp-1", title: "A" })
  const taskB = item({ id: "t-b", parent_id: "wp-1", title: "B" })
  const subtask = item({ id: "s-1", kind: "subtask", parent_id: "t-a" })

  it("zeigt Tasks unter ihrem Arbeitspaket — der Kernbefund", () => {
    const rows = buildGanttRows({
      phases: [p],
      items: [wp, taskA, taskB, subtask],
    })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      itemRowKey("wp-1"),
      itemRowKey("t-a"),
      itemRowKey("s-1"),
      itemRowKey("t-b"),
    ])
  })

  it("rueckt nach WBS-Tiefe ein, nicht flach", () => {
    const rows = buildGanttRows({
      phases: [p],
      items: [wp, taskA, subtask],
    })
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3])
  })

  it("ist gegenueber der PROJ-154-Regel echt weiter — Gegenkontrolle", () => {
    // Die alte Regel: sichtbar nur mit eigener phase_id oder als
    // work_package. Waere die neue Menge identisch, belegte dieser Test die
    // Erweiterung nicht.
    const alle = [wp, taskA, taskB, subtask]
    const alt = alle.filter((i) => i.kind === "work_package" || i.phase_id)
    const neu = buildGanttRows({ phases: [p], items: alle }).filter(
      (r) => r.kind === "work_item",
    )
    expect(alt).toHaveLength(1)
    expect(neu).toHaveLength(4)
  })

  it("markiert Eltern mit Kindern als aufklappbar", () => {
    const rows = buildGanttRows({ phases: [p], items: [wp, taskA] })
    const wpRow = rows.find((r) => r.key === itemRowKey("wp-1"))
    const taskRow = rows.find((r) => r.key === itemRowKey("t-a"))
    expect(wpRow?.hasChildren).toBe(true)
    expect(taskRow?.hasChildren).toBe(false)
  })

  it("laesst zugeklappte Teilbaeume weg, behaelt aber die Elternzeile", () => {
    const rows = buildGanttRows({
      phases: [p],
      items: [wp, taskA, subtask],
      collapsedKeys: new Set([itemRowKey("wp-1")]),
    })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      itemRowKey("wp-1"),
    ])
    expect(rows[1]?.collapsed).toBe(true)
  })

  it("klappt die Phase mitsamt ihres ganzen Teilbaums zu", () => {
    const rows = buildGanttRows({
      phases: [p],
      items: [wp, taskA, subtask],
      collapsedKeys: new Set([phaseRowKey(PHASE_ID)]),
    })
    expect(rows.map((r) => r.key)).toEqual([phaseRowKey(PHASE_ID)])
  })
})

describe("buildGanttRows — Verankerung und Eimer", () => {
  const p = phase({ id: PHASE_ID })

  it("sammelt phasenlose Wurzeln im Eimer 'Ohne Phase'", () => {
    const wp = item({ id: "wp-1", kind: "work_package" })
    const rows = buildGanttRows({ phases: [p], items: [wp] })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      UNPHASED_BUCKET_KEY,
      itemRowKey("wp-1"),
    ])
  })

  it("laesst den Eimer weg, wenn alles zugeordnet ist", () => {
    const wp = item({ id: "wp-1", kind: "work_package", phase_id: PHASE_ID })
    const rows = buildGanttRows({ phases: [p], items: [wp] })
    expect(rows.some((r) => r.kind === "bucket")).toBe(false)
  })

  it("zeigt einen Task mit eigener Phase dort, nicht beim Elternteil", () => {
    // Ein Kind mit abweichender Zuordnung beginnt einen eigenen Teilbaum.
    const p2 = phase({ id: PHASE_2_ID, sequence_number: 2 })
    const wp = item({ id: "wp-1", kind: "work_package", phase_id: PHASE_ID })
    const abweichend = item({
      id: "t-x",
      parent_id: "wp-1",
      phase_id: PHASE_2_ID,
    })
    const rows = buildGanttRows({ phases: [p, p2], items: [wp, abweichend] })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      itemRowKey("wp-1"),
      phaseRowKey(PHASE_2_ID),
      itemRowKey("t-x"),
    ])
  })

  it("verliert einen Zweig nicht, wenn das Elternteil geloescht ist", () => {
    // Das Kind ist bewusst ein Arbeitspaket: sonst pruefte dieser Fall die
    // Eimer-Regel (phasenloser Task gehoert nicht herein) statt des
    // gemeinten Waisen-Riegels.
    const gelöscht = item({ id: "wp-1", kind: "work_package", is_deleted: true })
    const kind = item({ id: "wp-2", kind: "work_package", parent_id: "wp-1" })
    const rows = buildGanttRows({ phases: [p], items: [gelöscht, kind] })
    // Das Kind rutscht in den Eimer statt zu verschwinden.
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      UNPHASED_BUCKET_KEY,
      itemRowKey("wp-2"),
    ])
  })

  it("laesst einen phasenlosen Task ohne sichtbaren Vorfahren weg", () => {
    // Die Gegenrichtung des Falls darueber, ausdruecklich festgehalten:
    // ohne sichtbaren Anker hat ein Task am Zeitstrahl keinen Ort.
    const gelöscht = item({ id: "wp-1", kind: "work_package", is_deleted: true })
    const waise = item({ id: "t-a", parent_id: "wp-1" })
    const rows = buildGanttRows({ phases: [p], items: [gelöscht, waise] })
    expect(rows.map((r) => r.key)).toEqual([phaseRowKey(PHASE_ID)])
  })

  it("laesst gelöschte Items weg", () => {
    const gelöscht = item({ id: "d-1", phase_id: PHASE_ID, is_deleted: true })
    const rows = buildGanttRows({ phases: [p], items: [gelöscht] })
    expect(rows.map((r) => r.key)).toEqual([phaseRowKey(PHASE_ID)])
  })

  it("terminiert bei einem Zyklus und zeigt beide Zeilen flach", () => {
    // Arbeitspakete, damit der Fall wirklich den Zyklus-Riegel prueft und
    // nicht an der Eimer-Regel haengenbleibt. Ohne den Riegel laeuft
    // pushSubtree endlos.
    const a = item({ id: "a", kind: "work_package", parent_id: "b" })
    const b = item({ id: "b", kind: "work_package", parent_id: "a" })
    const rows = buildGanttRows({ phases: [], items: [a, b] })
    expect(rows.map((r) => r.key).sort()).toEqual([
      UNPHASED_BUCKET_KEY,
      itemRowKey("a"),
      itemRowKey("b"),
    ])
  })
})

describe("buildGanttRows — Ordnung am Zeitstrahl", () => {
  const p = phase({ id: PHASE_ID })

  it("sortiert Geschwister nach Startdatum, nicht nach Ladereihenfolge", () => {
    const spät = item({
      id: "spaet",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-10-01",
    })
    const früh = item({
      id: "frueh",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-09-01",
    })
    const rows = buildGanttRows({ phases: [p], items: [spät, früh] })
    expect(rows.slice(1).map((r) => r.key)).toEqual([
      itemRowKey("frueh"),
      itemRowKey("spaet"),
    ])
  })

  it("stellt terminlose Zeilen hinter terminierte", () => {
    const ohne = item({ id: "ohne", kind: "work_package", phase_id: PHASE_ID })
    const mit = item({
      id: "mit",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-09-01",
    })
    const rows = buildGanttRows({ phases: [p], items: [ohne, mit] })
    expect(rows.slice(1).map((r) => r.key)).toEqual([
      itemRowKey("mit"),
      itemRowKey("ohne"),
    ])
  })

  it("ordnet auch nach abgeleitetem Termin — sonst waere der Sammelvorgang blind", () => {
    const abgeleitetSpät = item({
      id: "spaet",
      kind: "work_package",
      phase_id: PHASE_ID,
      derived_planned_start: "2026-11-01",
    })
    const eigenFrüh = item({
      id: "frueh",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-09-01",
    })
    const rows = buildGanttRows({
      phases: [p],
      items: [abgeleitetSpät, eigenFrüh],
    })
    expect(rows.slice(1).map((r) => r.key)).toEqual([
      itemRowKey("frueh"),
      itemRowKey("spaet"),
    ])
  })

  it("faellt bei gleichen Terminen auf position zurueck", () => {
    const zweiter = item({
      id: "b",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-09-01",
      position: 2,
    })
    const erster = item({
      id: "a",
      kind: "work_package",
      phase_id: PHASE_ID,
      planned_start: "2026-09-01",
      position: 1,
    })
    const rows = buildGanttRows({ phases: [p], items: [zweiter, erster] })
    expect(rows.slice(1).map((r) => r.key)).toEqual([
      itemRowKey("a"),
      itemRowKey("b"),
    ])
  })
})

describe("buildGanttRows — welche Items ueberhaupt hereinkommen", () => {
  const p = phase({ id: PHASE_ID })

  it("laesst eine phasenlose Story samt Teilbaum weg — der Eimer laeuft nicht voll", () => {
    // PROJ-154s Anliegen: ohne diese Grenze landet das ganze Scrum-Backlog
    // im Eimer (im Messprojekt 22 zusaetzliche Zeilen).
    const story = item({ id: "s-1", kind: "story" })
    const task = item({ id: "t-1", parent_id: "s-1" })
    const rows = buildGanttRows({ phases: [p], items: [story, task] })
    expect(rows.map((r) => r.key)).toEqual([phaseRowKey(PHASE_ID)])
  })

  it("zeigt ein Arbeitspaket auch unter einer phasenlosen Story", () => {
    // Sonst faellt ein Arbeitspaket wegen seines Elternteils heraus, obwohl
    // die alte Regel es immer gezeigt hat.
    const story = item({ id: "s-1", kind: "story" })
    const wp = item({ id: "wp-1", kind: "work_package", parent_id: "s-1" })
    const rows = buildGanttRows({ phases: [p], items: [story, wp] })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      UNPHASED_BUCKET_KEY,
      itemRowKey("wp-1"),
    ])
  })

  it("zeigt eine phasenlose Story, wenn sie unter einem Arbeitspaket haengt", () => {
    const wp = item({ id: "wp-1", kind: "work_package", phase_id: PHASE_ID })
    const story = item({ id: "s-1", kind: "story", parent_id: "wp-1" })
    const rows = buildGanttRows({ phases: [p], items: [wp, story] })
    expect(rows.map((r) => r.key)).toEqual([
      phaseRowKey(PHASE_ID),
      itemRowKey("wp-1"),
      itemRowKey("s-1"),
    ])
  })
})
