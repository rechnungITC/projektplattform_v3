/**
 * PROJ-Y-130m — die Auswertung des Kettenstatus.
 *
 * Der erste Test ist der wichtigste: die API antwortet auf eine noch leere Kette
 * mit `intact: true` (es gibt nichts, was nicht stimmt). Wer das als „alles in
 * Ordnung" anzeigt, behauptet einen Manipulationsnachweis, den es noch nicht gibt.
 * Genau diese Verwechslung soll hier für immer ausgeschlossen sein.
 */

import { describe, expect, it } from "vitest"

import {
  type AuditChainFinding,
  describeChainStatus,
  findingKind,
  sourceLabel,
} from "./audit-chain-api"

const ok = (over: Partial<AuditChainFinding> = {}): AuditChainFinding => ({
  source: "audit_log",
  window_start: "2026-08-10T00:00:00Z",
  entry_count_sealed: 5,
  entry_count_now: 5,
  digest_ok: true,
  link_ok: true,
  ...over,
})

describe("describeChainStatus", () => {
  it("meldet eine leere Kette als „noch kein Nachweis“, NICHT als Entwarnung", () => {
    const v = describeChainStatus({
      windows_checked: 0,
      intact: true,
      findings: [],
      last_window_start: null,
      sources: [],
    })
    expect(v.tone).toBe("pending")
    expect(v.headline).toMatch(/Noch keine/)
    expect(v.detail).toMatch(/keine Entwarnung/)
  })

  it("entwarnt nur, wenn wirklich Fenster nachgerechnet wurden", () => {
    const v = describeChainStatus({
      windows_checked: 106,
      intact: true,
      findings: [],
      last_window_start: "2026-08-11T00:00:00Z",
      sources: [],
    })
    expect(v.tone).toBe("ok")
    expect(v.headline).toContain("106")
  })

  it("benennt eine inhaltliche Fälschung als solche", () => {
    const v = describeChainStatus({
      windows_checked: 10,
      intact: false,
      findings: [ok({ digest_ok: false })],
      last_window_start: "2026-08-11T00:00:00Z",
      sources: [],
    })
    expect(v.tone).toBe("alarm")
    expect(v.detail).toMatch(/verändertem Inhalt/)
    expect(v.detail).not.toMatch(/gebrochener Verkettung/)
  })

  it("benennt einen nachgezogenen Anker getrennt — das bedeutet etwas anderes", () => {
    const v = describeChainStatus({
      windows_checked: 10,
      intact: false,
      findings: [ok({ link_ok: false })],
      last_window_start: "2026-08-11T00:00:00Z",
      sources: [],
    })
    expect(v.tone).toBe("alarm")
    expect(v.detail).toMatch(/gebrochener Verkettung/)
    expect(v.detail).toMatch(/verdecken/)
    expect(v.detail).not.toMatch(/verändertem Inhalt/)
  })

  it("nennt beide Arten, wenn beide vorkommen, und zählt die Fenster richtig", () => {
    const v = describeChainStatus({
      windows_checked: 10,
      intact: false,
      findings: [ok({ digest_ok: false }), ok({ link_ok: false }), ok({ digest_ok: false })],
      last_window_start: "2026-08-11T00:00:00Z",
      sources: [],
    })
    expect(v.headline).toBe("3 von 10 Fenstern weichen ab")
    expect(v.detail).toMatch(/2 Fenster mit verändertem Inhalt/)
    expect(v.detail).toMatch(/1 Fenster mit gebrochener Verkettung/)
  })
})

describe("findingKind", () => {
  it("unterscheidet die drei Bruch-Arten", () => {
    expect(findingKind(ok({ digest_ok: false }))).toBe("Inhalt verändert")
    expect(findingKind(ok({ link_ok: false }))).toBe("Anker verändert")
    expect(findingKind(ok({ digest_ok: false, link_ok: false }))).toBe("Inhalt + Anker")
    expect(findingKind(ok())).toBe("—")
  })
})

describe("sourceLabel", () => {
  it("benennt die beiden Ketten in Klartext", () => {
    expect(sourceLabel("audit_log")).toBe("Änderungs-Trail")
    expect(sourceLabel("confidential_read")).toBe("Zugriffsprotokoll")
  })

  it("gibt eine unbekannte Quelle unverändert zurück statt sie zu verschweigen", () => {
    expect(sourceLabel("etwas_neues")).toBe("etwas_neues")
  })
})
