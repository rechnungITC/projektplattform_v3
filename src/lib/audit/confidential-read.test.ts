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
  logConfidentialExport,
  mustBlockOnLogFailure,
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
