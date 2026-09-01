/**
 * PROJ-130-δ1 — Stufen-Auswertung und Ausfallverhalten.
 *
 * Die beiden Fälle, auf die es ankommt: eine Ergebnismenge ohne Vertrauliches
 * darf KEINEN Eintrag erzeugen (sonst trägt jeder Nicht-M&A-Mandant Zusatzlast
 * und der DB-CHECK schlägt zu), und ein fehlgeschlagenes Protokollieren
 * blockiert nur bei `strict`.
 */

import { describe, expect, it, vi } from "vitest"

import {
  CONFIDENTIAL_ENTITY_TYPES,
  logConfidentialExport,
  logConfidentialListRead,
  logConfidentialReportRead,
  mustBlockOnLogFailure,
  READ_SURFACES,
  reportConfidentialitySummary,
  shouldLogRead,
  summarizeConfidentiality,
} from "./confidential-read"

describe("summarizeConfidentiality", () => {
  it("meldet standard und null Treffer für eine unverfängliche Menge", () => {
    expect(
      summarizeConfidentiality([
        { confidentiality_level: "standard" },
        { confidentiality_level: "standard" },
      ])
    ).toEqual({ maxLevel: "standard", confidentialCount: 0 })
  })

  it("zählt nur oberhalb von standard und meldet die höchste Stufe", () => {
    expect(
      summarizeConfidentiality([
        { confidentiality_level: "standard" },
        { confidentiality_level: "confidential" },
        { confidentiality_level: "strict" },
        { confidentiality_level: "confidential" },
      ])
    ).toEqual({ maxLevel: "strict", confidentialCount: 3 })
  })

  it("behandelt fehlende und unbekannte Stufen als standard", () => {
    expect(
      summarizeConfidentiality([
        {},
        { confidentiality_level: null },
        { confidentiality_level: "erfunden" },
      ])
    ).toEqual({ maxLevel: "standard", confidentialCount: 0 })
  })

  it("kommt mit einer leeren Menge zurecht", () => {
    expect(summarizeConfidentiality([])).toEqual({
      maxLevel: "standard",
      confidentialCount: 0,
    })
  })
})

describe("logConfidentialExport", () => {
  const invoker = (error: { message: string } | null = null) =>
    vi.fn().mockResolvedValue({ error })

  it("schreibt nichts, wenn nichts Vertrauliches dabei ist", async () => {
    const c = invoker()
    const res = await logConfidentialExport(c, {
      projectId: "p1",
      entityType: "spa_issues",
      rows: [{ confidentiality_level: "standard" }],
    })
    expect(c).not.toHaveBeenCalled()
    expect(res).toEqual({
      logged: false,
      failed: false,
      summary: { maxLevel: "standard", confidentialCount: 0 },
    })
  })

  it("reicht höchste Stufe, Anzahl und Detail an die RPC durch", async () => {
    const c = invoker()
    await logConfidentialExport(c, {
      projectId: "p1",
      entityType: "dd_questions",
      rows: [
        { confidentiality_level: "confidential" },
        { confidentiality_level: "strict" },
      ],
      detail: { format: "csv" },
    })
    expect(c).toHaveBeenCalledWith("log_confidential_read", {
      p_project_id: "p1",
      p_entity_type: "dd_questions",
      p_max_level: "strict",
      p_object_count: 2,
      p_action: "export",
      p_outcome: "granted",
      p_entity_id: null,
      p_detail: { format: "csv" },
    })
  })

  it("meldet ein fehlgeschlagenes Protokollieren", async () => {
    const res = await logConfidentialExport(invoker({ message: "boom" }), {
      projectId: "p1",
      entityType: "spa_issues",
      rows: [{ confidentiality_level: "strict" }],
    })
    expect(res.logged).toBe(false)
    expect(res.failed).toBe(true)
  })
})

describe("mustBlockOnLogFailure", () => {
  it("blockiert nur bei strict", () => {
    expect(
      mustBlockOnLogFailure({
        logged: false,
        failed: true,
        summary: { maxLevel: "strict", confidentialCount: 1 },
      })
    ).toBe(true)
    expect(
      mustBlockOnLogFailure({
        logged: false,
        failed: true,
        summary: { maxLevel: "confidential", confidentialCount: 1 },
      })
    ).toBe(false)
  })

  it("blockiert nicht, wenn gar nichts fehlgeschlagen ist", () => {
    expect(
      mustBlockOnLogFailure({
        logged: true,
        failed: false,
        summary: { maxLevel: "strict", confidentialCount: 1 },
      })
    ).toBe(false)
  })
})

// --- PROJ-130-δ2 -----------------------------------------------------------

describe("shouldLogRead (die Regel aus δ2)", () => {
  it("protokolliert Austritt ab confidential", () => {
    for (const surface of ["export", "print", "download"] as const) {
      expect(shouldLogRead(surface, "confidential")).toBe(true)
      expect(shouldLogRead(surface, "strict")).toBe(true)
    }
  })

  it("protokolliert In-App-Lesen NUR bei strict", () => {
    for (const surface of ["list", "view"] as const) {
      expect(shouldLogRead(surface, "confidential")).toBe(false)
      expect(shouldLogRead(surface, "strict")).toBe(true)
    }
  })

  it("protokolliert standard nirgends", () => {
    for (const surface of READ_SURFACES) {
      expect(shouldLogRead(surface, "standard")).toBe(false)
    }
  })
})

describe("logConfidentialListRead", () => {
  it("schreibt bei einer confidential-Liste NICHT und ruft die DB gar nicht", async () => {
    const rpc = vi.fn()
    const res = await logConfidentialListRead(rpc, {
      projectId: "p1",
      entityType: "ma_valuations",
      rows: [{ confidentiality_level: "confidential" }],
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(res).toEqual({
      logged: false,
      failed: false,
      summary: { maxLevel: "confidential", confidentialCount: 1 },
    })
  })

  it("schreibt bei strict mit Aktion list_read und der Zahl der vertraulichen Zeilen", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await logConfidentialListRead(rpc, {
      projectId: "p1",
      entityType: "dd_findings",
      rows: [
        { confidentiality_level: "standard" },
        { confidentiality_level: "confidential" },
        { confidentiality_level: "strict" },
      ],
      detail: { stream_id: "s1" },
    })
    expect(rpc).toHaveBeenCalledWith("log_confidential_read", {
      p_project_id: "p1",
      p_entity_type: "dd_findings",
      p_max_level: "strict",
      p_object_count: 2,
      p_action: "list_read",
      p_outcome: "granted",
      p_entity_id: null,
      p_detail: { stream_id: "s1" },
    })
  })
})

describe("reportConfidentialitySummary", () => {
  it("liest die Zusammenfassung, die die Auswertung selbst mitliefert", () => {
    expect(
      reportConfidentialitySummary({
        confidentiality: { max_level: "strict", confidential_count: 7 },
      })
    ).toEqual({ maxLevel: "strict", confidentialCount: 7 })
  })

  it("gilt als standard, wenn der Schlüssel fehlt oder unbekannt ist", () => {
    expect(reportConfidentialitySummary({})).toEqual({
      maxLevel: "standard",
      confidentialCount: 0,
    })
    expect(
      reportConfidentialitySummary({
        confidentiality: { max_level: "geheim", confidential_count: 3 },
      })
    ).toEqual({ maxLevel: "standard", confidentialCount: 3 })
  })
})

describe("logConfidentialReportRead", () => {
  it("Ansicht einer confidential-Auswertung erzeugt keinen Eintrag", async () => {
    const rpc = vi.fn()
    await logConfidentialReportRead(rpc, {
      projectId: "p1",
      report: "steering_report",
      surface: "view",
      payload: { confidentiality: { max_level: "confidential", confidential_count: 4 } },
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("Druckseite derselben Auswertung erzeugt einen Eintrag (Austritt)", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await logConfidentialReportRead(rpc, {
      projectId: "p1",
      report: "steering_report",
      surface: "print",
      payload: { confidentiality: { max_level: "confidential", confidential_count: 4 } },
    })
    expect(rpc).toHaveBeenCalledWith(
      "log_confidential_read",
      expect.objectContaining({
        p_entity_type: "steering_report",
        p_action: "report_read",
        p_max_level: "confidential",
        p_object_count: 4,
        p_detail: { surface: "print" },
      })
    )
  })

  it("blockiert eine strict-Auswertung, wenn das Protokollieren scheitert", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "boom" } })
    const res = await logConfidentialReportRead(rpc, {
      projectId: "p1",
      report: "dd_report",
      surface: "view",
      payload: { confidentiality: { max_level: "strict", confidential_count: 1 } },
    })
    expect(mustBlockOnLogFailure(res)).toBe(true)
  })
})

describe("Objektarten-Vokabular", () => {
  it("deckt die Flächen ab, die δ2 verdrahtet, und ist duplikatfrei", () => {
    // Spiegelt den DB-CHECK aus Migration 20260812093000. Läuft das auseinander,
    // liefert die RPC 23514 statt eines Protokolleintrags.
    expect(new Set(CONFIDENTIAL_ENTITY_TYPES).size).toBe(
      CONFIDENTIAL_ENTITY_TYPES.length
    )
    for (const t of [
      "documents",
      "dd_streams",
      "dd_questions",
      "dd_findings",
      "dd_finding_escalations",
      "spa_issues",
      "ma_valuations",
      "ma_project_profiles",
      "deliverables",
      "risks",
      "workstreams",
      "committees",
      "committee_meetings",
      "steering_report",
      "operative_report",
      "dd_report",
      "project_context_documents",
    ]) {
      expect(CONFIDENTIAL_ENTITY_TYPES).toContain(t)
    }
    expect(CONFIDENTIAL_ENTITY_TYPES).toHaveLength(17)
  })
})
