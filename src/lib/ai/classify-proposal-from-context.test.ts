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

  it("detects a name that follows a salutation/title trigger", () => {
    expect(detectClass3Markers("Ansprechen: Herr Müller koordiniert das.")).toBe(
      true,
    )
    expect(detectClass3Markers("Das Review macht Frau Schmidt.")).toBe(true)
    expect(detectClass3Markers("Rückfragen an Dr. Weber.")).toBe(true)
  })

  it("detects a name that follows a role/contact label with a colon", () => {
    expect(detectClass3Markers("Ansprechpartner: Anne Schmidt")).toBe(true)
    expect(detectClass3Markers("Kontakt: Jörg Müller (Einkauf)")).toBe(true)
    expect(detectClass3Markers("Name: Maria Becker, Verantwortlich: Tom Klein")).toBe(
      true,
    )
  })

  it("PROJ-86: does NOT flag a bare, unlabelled name (accepted trade-off)", () => {
    // Context-bound detection: a name with no salutation/label trigger and
    // no email/phone is treated as Class-2. This residual false-negative is
    // bounded by the privacy_class floor + manual stamp + PROJ-75.
    expect(detectClass3Markers("Anne Schmidt übernimmt die Migration.")).toBe(
      false,
    )
  })

  it("PROJ-86: does NOT flag ordinary capitalised German noun phrases", () => {
    // The original NAME_PATTERN matched any two capitalised words, so every
    // German document was upgraded to Class-3. These are the real phrases
    // from the production "Generisches Kickoff.docx" excerpt — all must be
    // false now.
    const corpus = [
      "Generisches Kickoff-Protokoll",
      "Google Analytics und Meta Pixel werden geprüft.",
      "Das System erfasst Webseiten-Verstöße.",
      "Best Practices für Consent-Banner.",
      "Compliance-Verstöße werden dokumentiert.",
      "Die Plattform nutzt ein Lead-Modul mit Lead-Scoring.",
      "Use Case 1: Vollständiger Deep Crawl. Scoring Engine prüft Tracking-Skripte.",
      "Technisches Zielbild und Grobe Architektur.",
    ]
    for (const phrase of corpus) {
      expect(detectClass3Markers(phrase), phrase).toBe(false)
    }
  })

  it("still does NOT flag whitelisted / unlabelled compound tokens", () => {
    expect(detectClass3Markers("hier ist ein Use Case zu prüfen.")).toBe(false)
    expect(detectClass3Markers("das Steering Committee tagt am Freitag.")).toBe(false)
    expect(
      detectClass3Markers("die Acceptance Criteria sind noch offen."),
    ).toBe(false)
    expect(detectClass3Markers("der Project Manager schreibt das.")).toBe(false)
    // "Lead Scoring" / "Name Service" must NOT trigger — label triggers
    // require a colon, which is why these stay Class-2.
    expect(detectClass3Markers("Lead Scoring und Name Service.")).toBe(false)
  })

  it("PROJ-86: applies the residual whitelist to a trigger-captured span", () => {
    // "Owner: Project Manager" — the captured span is a whitelisted role
    // phrase, not a name, so it does not upgrade.
    expect(detectClass3Markers("Owner: Project Manager bis KW20.")).toBe(false)
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

  it("upgrades when the excerpt carries a labelled personal name", () => {
    const ctx = baseContext({
      privacy_class: 2,
      content_excerpt: "Ansprechpartner: Anne Schmidt aus dem Einkauf.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(3)
  })

  it("PROJ-86: does NOT upgrade a Class-2 excerpt of plain German noun phrases", () => {
    // The real production kickoff excerpt shape — no labelled names, no
    // email/phone — must stay Class-2 so it routes to the cloud provider.
    const ctx = baseContext({
      privacy_class: 2,
      content_excerpt:
        "Generisches Kickoff-Protokoll. Das System erfasst Webseiten-Verstöße. " +
        "Best Practices für Consent-Banner. Die Plattform nutzt ein Lead-Modul.",
    })
    expect(classifyProposalFromContextAutoContext(ctx)).toBe(2)
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
