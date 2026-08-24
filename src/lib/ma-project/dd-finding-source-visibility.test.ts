import { describe, expect, it, vi } from "vitest"

import {
  maskInvisibleSourceQuestion,
  maskInvisibleSourceQuestions,
} from "./dd-finding-source-visibility"

const A = "aaaaaaaa-0000-4000-8000-000000000001"
const B = "bbbbbbbb-0000-4000-8000-000000000002"

describe("maskInvisibleSourceQuestions", () => {
  it("nullt die Kennung, wenn die verknüpfte Frage nicht sichtbar ist", async () => {
    const rows = [{ id: "f1", source_dd_question_id: A }]
    const out = await maskInvisibleSourceQuestions(rows, async () => [])
    expect(out[0].source_dd_question_id).toBeNull()
    // Der übrige Inhalt bleibt unangetastet — maskiert wird die Herkunft, nicht die Zeile.
    expect(out[0].id).toBe("f1")
  })

  it("lässt sie stehen, wenn die Frage sichtbar ist (kein Blanket-Deny)", async () => {
    const out = await maskInvisibleSourceQuestions(
      [{ source_dd_question_id: A }],
      async () => [A]
    )
    expect(out[0].source_dd_question_id).toBe(A)
  })

  it("entscheidet pro Zeile, nicht pauschal", async () => {
    const out = await maskInvisibleSourceQuestions(
      [{ source_dd_question_id: A }, { source_dd_question_id: B }],
      async () => [A]
    )
    expect(out.map((r) => r.source_dd_question_id)).toEqual([A, null])
  })

  it("fragt gar nicht, wenn keine Zeile eine Verknüpfung trägt", async () => {
    const lookup = vi.fn(async () => [])
    const out = await maskInvisibleSourceQuestions(
      [{ source_dd_question_id: null }, {}],
      lookup
    )
    expect(lookup).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
  })

  it("fragt jede Kennung nur einmal, auch bei mehreren Zeilen darauf", async () => {
    // Signatur explizit: ohne sie leitet TS die Argumentliste als `[]` ab und
    // `mock.calls[0][0]` ist ein Tupel-Zugriff ins Leere (TS2493).
    const lookup = vi.fn(async (_ids: readonly string[]) => [A])
    await maskInvisibleSourceQuestions(
      [{ source_dd_question_id: A }, { source_dd_question_id: A }],
      lookup
    )
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0]).toEqual([A])
  })

  it("ist fail-closed: liefert die Abfrage nichts, wird genullt", async () => {
    // Der Aufrufer gibt bei einem Fehler eine leere Liste zurück; hier wird
    // festgehalten, dass „nichts sichtbar" zum Nullen führt und nicht zum Durchlassen.
    const out = await maskInvisibleSourceQuestions(
      [{ source_dd_question_id: A }],
      async () => []
    )
    expect(out[0].source_dd_question_id).toBeNull()
  })

  it("verändert die Eingabe nicht (die Antwort ist eine Kopie)", async () => {
    const rows = [{ source_dd_question_id: A }]
    await maskInvisibleSourceQuestions(rows, async () => [])
    expect(rows[0].source_dd_question_id).toBe(A)
  })
})

describe("maskInvisibleSourceQuestion (Einzelzeile)", () => {
  it("maskiert die Einzelzeile", async () => {
    const out = await maskInvisibleSourceQuestion(
      { source_dd_question_id: A },
      async () => []
    )
    expect(out?.source_dd_question_id).toBeNull()
  })

  it("verträgt null", async () => {
    expect(await maskInvisibleSourceQuestion(null, async () => [])).toBeNull()
  })
})
