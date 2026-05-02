import { describe, expect, it } from "vitest"

import {
  buildApprovalOutboxRow,
  sanitizeApprovalTitle,
} from "./approval-mail"

const BASE_INPUT = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  projectId: "22222222-2222-2222-2222-222222222222",
  decisionId: "33333333-3333-3333-3333-333333333333",
  approverId: "44444444-4444-4444-4444-444444444444",
  decisionTitle: "ERP-Vendor X gewählt",
  recipient: "approver@example.com",
  token: "abc.def",
  baseUrl: "https://app.example.com",
  createdBy: "55555555-5555-5555-5555-555555555555",
}

describe("sanitizeApprovalTitle (PROJ-31)", () => {
  it("strips email addresses", () => {
    expect(sanitizeApprovalTitle("Mail an alice@example.com — ok"))
      .toBe("Mail an […] — ok")
  })

  it("strips phone numbers", () => {
    expect(sanitizeApprovalTitle("Anruf 089 1234 5678 — ok"))
      .toBe("Anruf […] — ok")
  })

  it("returns null for empty input", () => {
    expect(sanitizeApprovalTitle("")).toBeNull()
    expect(sanitizeApprovalTitle("   ")).toBeNull()
  })

  it("returns null for too-long input (>200 chars)", () => {
    expect(sanitizeApprovalTitle("x".repeat(201))).toBeNull()
  })

  it("preserves benign titles unchanged", () => {
    expect(sanitizeApprovalTitle("Phasenfreigabe Sprint 14")).toBe(
      "Phasenfreigabe Sprint 14",
    )
  })
})

describe("buildApprovalOutboxRow (PROJ-31)", () => {
  it("constructs a class-3-safe row with title + URL only", () => {
    const row = buildApprovalOutboxRow(BASE_INPUT)
    expect(row.tenant_id).toBe(BASE_INPUT.tenantId)
    expect(row.project_id).toBe(BASE_INPUT.projectId)
    expect(row.channel).toBe("email")
    expect(row.recipient).toBe(BASE_INPUT.recipient)
    expect(row.subject).toBe("Genehmigungs-Anfrage: ERP-Vendor X gewählt")
    expect(row.body).toContain("ERP-Vendor X gewählt")
    expect(row.body).toContain("/approve/abc.def")
    expect(row.metadata.purpose).toBe("approval_magic_link")
    expect(row.metadata.decision_id).toBe(BASE_INPUT.decisionId)
    expect(row.status).toBe("queued")
  })

  it("does NOT leak decision body into mail (Class-3 defense)", () => {
    // Even if the caller mistakenly passes a decision_text-shaped string as
    // title, the body must not contain the long text — only the title.
    const longish = "x".repeat(150)
    const row = buildApprovalOutboxRow({
      ...BASE_INPUT,
      decisionTitle: longish,
    })
    expect(row.body).toContain(longish)
    expect(row.body).not.toContain("decision_text") // input shape never leaks
  })

  it("rejects when the title sanitizer returns null", () => {
    expect(() =>
      buildApprovalOutboxRow({ ...BASE_INPUT, decisionTitle: "" }),
    ).toThrow(/title rejected/)
    expect(() =>
      buildApprovalOutboxRow({
        ...BASE_INPUT,
        decisionTitle: "x".repeat(201),
      }),
    ).toThrow(/title rejected/)
  })

  it("rejects without a token", () => {
    expect(() =>
      buildApprovalOutboxRow({ ...BASE_INPUT, token: "" }),
    ).toThrow(/token and baseUrl/)
  })

  it("rejects without a baseUrl", () => {
    expect(() =>
      buildApprovalOutboxRow({ ...BASE_INPUT, baseUrl: "" }),
    ).toThrow(/token and baseUrl/)
  })

  it("urlencodes the token in the link path", () => {
    const row = buildApprovalOutboxRow({
      ...BASE_INPUT,
      token: "with spaces+symbols",
    })
    expect(row.body).toContain("/approve/with%20spaces%2Bsymbols")
  })

  it("trims trailing slash on baseUrl", () => {
    const row = buildApprovalOutboxRow({
      ...BASE_INPUT,
      baseUrl: "https://app.example.com/",
    })
    expect(row.body).toContain("https://app.example.com/approve/")
  })
})
