import { describe, expect, it } from "vitest"

import {
  buildSelfAssessmentOutboxRow,
  sanitizeFirstName,
} from "./self-assessment-mail"

const BASE_INPUT = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  projectId: "22222222-2222-2222-2222-222222222222",
  stakeholderId: "33333333-3333-3333-3333-333333333333",
  inviteId: "44444444-4444-4444-4444-444444444444",
  firstName: "Anna",
  tenantBrandingName: "ACME Tenant",
  recipient: "anna@example.com",
  token: "abc.def",
  baseUrl: "https://app.example.com",
  createdBy: "55555555-5555-5555-5555-555555555555",
}

describe("sanitizeFirstName (PROJ-33 Phase 33-δ)", () => {
  it("returns the first token only", () => {
    expect(sanitizeFirstName("Anna Müller")).toBe("Anna")
  })

  it("preserves unicode letters (Umlaute / accents)", () => {
    expect(sanitizeFirstName("Jürgen")).toBe("Jürgen")
    expect(sanitizeFirstName("José")).toBe("José")
  })

  it("preserves hyphens and apostrophes in names", () => {
    expect(sanitizeFirstName("Marie-Claire")).toBe("Marie-Claire")
    expect(sanitizeFirstName("D'Angelo")).toBe("D'Angelo")
  })

  it("strips embedded email patterns", () => {
    // "Bob a@b.de" → sanitizeMailTitle redacts mail → "Bob […]" →
    // first-token → "Bob".
    expect(sanitizeFirstName("Bob a@b.de")).toBe("Bob")
  })

  it("falls back to 'Hallo' for null / empty / whitespace", () => {
    expect(sanitizeFirstName(null)).toBe("Hallo")
    expect(sanitizeFirstName("")).toBe("Hallo")
    expect(sanitizeFirstName("   ")).toBe("Hallo")
  })

  it("falls back to 'Hallo' for non-name-shaped input", () => {
    expect(sanitizeFirstName("<script>alert(1)</script>")).toBe("scriptalert1script")
    // Note: html chars get stripped, but resulting token is still letters/digits.
    // For absolutely garbage input:
    expect(sanitizeFirstName("!!!@@@###")).toBe("Hallo")
  })

  it("falls back to 'Hallo' if first token is too long (>80 chars)", () => {
    expect(sanitizeFirstName("x".repeat(120))).toBe("Hallo")
  })
})

describe("buildSelfAssessmentOutboxRow (PROJ-33 Phase 33-δ)", () => {
  it("constructs a privacy-safe row with link + branding only", () => {
    const row = buildSelfAssessmentOutboxRow(BASE_INPUT)
    expect(row.tenant_id).toBe(BASE_INPUT.tenantId)
    expect(row.project_id).toBe(BASE_INPUT.projectId)
    expect(row.channel).toBe("email")
    expect(row.recipient).toBe(BASE_INPUT.recipient)
    expect(row.subject).toBe("Self-Assessment-Anfrage von ACME Tenant")
    expect(row.body).toContain("Hallo Anna")
    expect(row.body).toContain("ACME Tenant")
    expect(row.body).toContain("/self-assessment/abc.def")
    expect(row.body).toContain("14 Tage")
    expect(row.metadata.purpose).toBe("self_assessment_invite")
    expect(row.metadata.stakeholder_id).toBe(BASE_INPUT.stakeholderId)
    expect(row.metadata.invite_id).toBe(BASE_INPUT.inviteId)
    expect(row.status).toBe("queued")
  })

  it("does NOT leak the project_id / stakeholder_id into the body", () => {
    const row = buildSelfAssessmentOutboxRow(BASE_INPUT)
    expect(row.body).not.toContain(BASE_INPUT.projectId)
    expect(row.body).not.toContain(BASE_INPUT.stakeholderId)
    expect(row.body).not.toContain(BASE_INPUT.inviteId)
  })

  it("falls back to 'Projektplattform' branding when tenantBrandingName is null", () => {
    const row = buildSelfAssessmentOutboxRow({
      ...BASE_INPUT,
      tenantBrandingName: null,
    })
    expect(row.subject).toBe("Self-Assessment-Anfrage von Projektplattform")
    expect(row.body).toContain("Projektplattform")
  })

  it("uses bare 'Hallo,' when first name is missing", () => {
    const row = buildSelfAssessmentOutboxRow({
      ...BASE_INPUT,
      firstName: null,
    })
    expect(row.body).toContain("Hallo,")
    expect(row.body).not.toContain("Hallo Hallo")
  })

  it("rejects without a token", () => {
    expect(() =>
      buildSelfAssessmentOutboxRow({ ...BASE_INPUT, token: "" }),
    ).toThrow(/token and baseUrl/)
  })

  it("rejects without a baseUrl", () => {
    expect(() =>
      buildSelfAssessmentOutboxRow({ ...BASE_INPUT, baseUrl: "" }),
    ).toThrow(/token and baseUrl/)
  })

  it("rejects without a recipient", () => {
    expect(() =>
      buildSelfAssessmentOutboxRow({ ...BASE_INPUT, recipient: "" }),
    ).toThrow(/recipient is required/)
  })

  it("urlencodes the token in the link path", () => {
    const row = buildSelfAssessmentOutboxRow({
      ...BASE_INPUT,
      token: "with spaces+symbols",
    })
    expect(row.body).toContain("/self-assessment/with%20spaces%2Bsymbols")
  })

  it("trims trailing slash on baseUrl", () => {
    const row = buildSelfAssessmentOutboxRow({
      ...BASE_INPUT,
      baseUrl: "https://app.example.com/",
    })
    expect(row.body).toContain("https://app.example.com/self-assessment/")
  })
})
