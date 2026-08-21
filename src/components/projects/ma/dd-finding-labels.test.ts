import { describe, expect, it } from "vitest"

import {
  FINDING_SOURCE_KIND_LABEL,
  FINDING_SOURCE_KINDS,
  formatFindingSource,
} from "./dd-finding-labels"

// PROJ-Y-114a — der Herkunftsnachweis wird an mehreren Stellen angezeigt
// (Finding-Tabelle, Dialog). Eine Quelle für die Formatierung, damit die
// Darstellungen nicht auseinanderlaufen.
describe("formatFindingSource", () => {
  it("joins kind and locator", () => {
    expect(formatFindingSource("document", "VDR 3.4.1")).toBe(
      "Datenraum-Dokument — VDR 3.4.1"
    )
  })
  it("returns the kind alone when no locator is given", () => {
    expect(formatFindingSource("interview", null)).toBe("Management-Interview")
  })
  it("returns the locator alone when no kind is given", () => {
    expect(formatFindingSource(null, "Anlage 7")).toBe("Anlage 7")
  })
  it("treats a whitespace-only locator as absent", () => {
    expect(formatFindingSource("analysis", "   ")).toBe("Eigene Analyse")
    expect(formatFindingSource(null, "   ")).toBeNull()
  })
  it("returns null when there is no source at all — callers must not render a label", () => {
    expect(formatFindingSource(null, null)).toBeNull()
    expect(formatFindingSource(undefined, undefined)).toBeNull()
  })
})

describe("FINDING_SOURCE_KINDS", () => {
  it("carries a German label for every kind (no raw key can reach the UI)", () => {
    for (const k of FINDING_SOURCE_KINDS) {
      expect(FINDING_SOURCE_KIND_LABEL[k]).toBeTruthy()
    }
  })
  it("matches the vocabulary the database CHECK accepts", () => {
    // Mirrors dd_findings_source_kind_check — drift here means a 400/23514 in prod.
    expect([...FINDING_SOURCE_KINDS].sort()).toEqual(
      ["analysis", "document", "interview", "other", "qa_answer", "site_visit"]
    )
  })
})
