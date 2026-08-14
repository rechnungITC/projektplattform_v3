/**
 * PROJ-80-α.2c — Tests für die Kette Auszug → Quintessenz.
 *
 * Geprüft wird die eine Eigenschaft, die sicherheitsrelevant ist: die
 * Quintessenz darf NUR laufen, wenn der Auszug wirklich `extracted` ist. Jeder
 * andere Zustand bedeutet, dass kein geprüfter Volltext vorliegt — und dann
 * darf kein Text an ein Modell gehen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const runExtraction = vi.fn()
const runSummary = vi.fn()

vi.mock("./extraction-runner", () => ({
  runDocumentExtraction: (...a: unknown[]) => runExtraction(...a),
}))
vi.mock("./summary-runner", () => ({
  runDocumentSummary: (...a: unknown[]) => runSummary(...a),
}))

const { runDocumentPipeline } = await import("./pipeline")

const ARGS = {
  tenantId: "t1",
  documentId: "d1",
  buffer: Buffer.from("x"),
  filename: "a.pdf",
  mimeHint: "application/pdf",
  actorUserId: "u1",
}

describe("PROJ-80 runDocumentPipeline", () => {
  beforeEach(() => {
    runExtraction.mockReset()
    runSummary.mockReset()
  })

  it("erzeugt die Quintessenz nach erfolgreichem Auszug", async () => {
    runExtraction.mockResolvedValue({ status: "extracted", privacy_class: 2 })
    runSummary.mockResolvedValue({ status: "auto", reason_code: null })

    const res = await runDocumentPipeline(ARGS)

    expect(runSummary).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ extraction_status: "extracted", summary_status: "auto" })
  })

  // Die vier folgenden Fälle sind der eigentliche Zweck dieser Suite.
  for (const status of ["failed", "too_large", "unsupported_type", "pending"]) {
    it(`ruft die Quintessenz NICHT, wenn der Auszug '${status}' ist`, async () => {
      runExtraction.mockResolvedValue({ status, privacy_class: 3 })

      const res = await runDocumentPipeline(ARGS)

      // Ohne geprüften Volltext darf kein Text an ein Modell gehen.
      expect(runSummary).not.toHaveBeenCalled()
      expect(res.summary_status).toBeNull()
      expect(res.extraction_status).toBe(status)
    })
  }

  it("ruft die Quintessenz NICHT, wenn der Auszug gar nicht geschrieben wurde", async () => {
    runExtraction.mockResolvedValue(null)

    const res = await runDocumentPipeline(ARGS)

    expect(runSummary).not.toHaveBeenCalled()
    expect(res).toEqual({ extraction_status: null, summary_status: null })
  })

  it("meldet 'stale' durch, statt es als Erfolg auszugeben", async () => {
    // Kein zulässiger Anbieter (Class-3 ohne Ollama) ist kein Fehler der
    // Kette — aber auch kein Erfolg. Der Zustand muss durchgereicht werden,
    // damit die Oberfläche den Grund zeigen kann (PROJ-137).
    runExtraction.mockResolvedValue({ status: "extracted", privacy_class: 3 })
    runSummary.mockResolvedValue({ status: "stale", reason_code: "class3_blocked" })

    const res = await runDocumentPipeline(ARGS)

    expect(res.summary_status).toBe("stale")
  })
})
