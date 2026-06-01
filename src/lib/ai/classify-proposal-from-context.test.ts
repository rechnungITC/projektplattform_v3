/**
 * PROJ-70-α — classifier tests for `proposal_from_context`.
 *
 * Three concerns:
 *   1. The privacy_class stamp from the upload time acts as a floor.
 *   2. The heuristic regex sweep on `content_excerpt` upgrades to
 *      Class-3 when email / DACH-name / DACH-phone patterns are present.
 *   3. The whitelist of known non-name capitalised tokens prevents
 *      common false positives ("Status Report", "Use Case", etc.).
 */

import { describe, expect, it } from "vitest"

import {
  classifyProposalFromContextAutoContext,
  detectClass3Markers,
} from "./classify"
import type { ProposalFromContextAutoContext } from "./types"

function baseContext(
  overrides: Partial<
    Pick<
      ProposalFromContextAutoContext["context_source"],
      "privacy_class" | "content_excerpt"
    >
  > = {},
): ProposalFromContextAutoContext {
  return {
    source_project: {
      project_id: "00000000-0000-0000-0000-000000000001",
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "scrum",
      lifecycle_status: "active",
    },
    context_source: {
      context_source_id: "00000000-0000-0000-0000-000000000002",
      kind: "document",
      title: "Kickoff-Protokoll",
      privacy_class: overrides.privacy_class ?? 2,
      content_excerpt:
        overrides.content_excerpt ??
        "Wir wollen das neue ERP migrieren. Phase 1 ist die Datenmigration aus dem Altsystem.",
      language: "de",
    },
    method_hint: "scrum",
  }
}

describe("detectClass3Markers", () => {
  it("returns false for plain project content without personal markers", () => {
    expect(
      detectClass3Markers(
        "Wir migrieren das ERP. Phase 1 ist die Datenextraktion aus dem Altsystem.",
      ),
    ).toBe(false)
  })

  it("detects an email address as Class-3 marker", () => {
    expect(
      detectClass3Markers(
        "Schickt die Specs an info@firma.de — Antwort bis Freitag.",
      ),
    ).toBe(true)
  })

  it("detects a DACH-formatted phone number as Class-3 marker", () => {
    expect(detectClass3Markers("Bei Rückfragen: +49 30 1234 5678.")).toBe(true)
    expect(detectClass3Markers("Hotline 0049 (0)30 12345678 zwischen 8 und 18 Uhr.")).toBe(true)
    expect(detectClass3Markers("Direktnummer: 0301234567.")).toBe(true)
  })

  it("detects a capitalised two-word name as Class-3 marker", () => {
    expect(detectClass3Markers("Anne Schmidt übernimmt die Migration.")).toBe(
      true,
    )
  })

  it("does NOT flag whitelisted compound tokens when they appear in isolation", () => {
    // Whitelisted tokens that don't accidentally form additional name pairs
    // with neighbouring words (lowercase contexts on both sides).
    expect(detectClass3Markers("hier ist ein Use Case zu prüfen.")).toBe(false)
    expect(detectClass3Markers("das Steering Committee tagt am Freitag.")).toBe(false)
    expect(
      detectClass3Markers("die Acceptance Criteria sind noch offen."),
    ).toBe(false)
    expect(detectClass3Markers("der Project Manager schreibt das.")).toBe(false)
  })

  it("flags as Class-3 even when a whitelisted token is present BUT another genuine name pair exists", () => {
    // This documents the deliberate over-eager behaviour from the Tech
    // Design: when ANY non-whitelisted name-shaped pair fires, the
    // run upgrades to Class-3. Two-Caps-Worte-pairs at sentence start
    // ("Bitte Status") count as false-positive pairs we deliberately
    // accept — conservatism beats leakage.
    expect(detectClass3Markers("Bitte Status Report erstellen.")).toBe(true)
  })

  it("returns false on empty / null-equivalent text", () => {
    expect(detectClass3Markers("")).toBe(false)
  })
})

describe("classifyProposalFromContextAutoContext", () => {
  it("returns the privacy_class floor when no Class-3 markers are present", () => {
    expect(classifyProposalFromContextAutoContext(baseContext({ privacy_class: 1 }))).toBe(1)
    expect(classifyProposalFromContextAutoContext(baseContext({ privacy_class: 2 }))).toBe(2)
  })

  it("respects an explicit privacy_class=3 stamp even on a clean excerpt", () => {
    expect(classifyProposalFromContextAutoContext(baseContext({ privacy_class: 3 }))).toBe(3)
  })

  it("upgrades Class-1/2 to Class-3 when the excerpt carries an email", () => {
    const ctx = baseContext({
      privacy_class: 2,
      content_excerpt:
        "Kickoff am Montag. Specs an info@firma.de senden.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(3)
  })

  it("upgrades when the excerpt carries a DACH phone number", () => {
    const ctx = baseContext({
      privacy_class: 1,
      content_excerpt: "Bei Fragen die Hotline +49 30 1234567 anrufen.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(3)
  })

  it("upgrades when the excerpt carries a name-shaped token", () => {
    const ctx = baseContext({
      privacy_class: 2,
      content_excerpt: "Lead-User: Anne Schmidt aus dem Einkauf.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(3)
  })

  it("does NOT upgrade on whitelisted compound tokens", () => {
    const ctx = baseContext({
      privacy_class: 2,
      content_excerpt: "Use Case 1: ERP migrieren. Status Report bis Freitag.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(2)
  })

  it("tenantDefault=3 keeps Class-1 at Class-1 when input is genuinely Class-1", () => {
    // Mirrors the Narrative classifier's tenant-default semantics: the
    // tenant floor doesn't push a confirmed Class-1 input to Class-2,
    // it just prevents lowering below the input's class.
    const ctx = baseContext({
      privacy_class: 1,
      content_excerpt: "Phase 1: Datenextraktion. Phase 2: Mapping.",
    })
    expect(classifyProposalFromContextAutoContext(ctx, 3)).toBe(1)
  })
})
