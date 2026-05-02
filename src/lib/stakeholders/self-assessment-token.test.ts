import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  signSelfAssessmentToken,
  verifySelfAssessmentToken,
} from "./self-assessment-token"

const SAMPLE_PAYLOAD = {
  stakeholder_id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  exp: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
}

const SECRET = "this-is-a-test-secret-32-chars-long-aaaa"

describe("self-assessment-token (PROJ-33 Phase 33-δ)", () => {
  let originalSecret: string | undefined

  beforeEach(() => {
    originalSecret = process.env.APPROVAL_TOKEN_SECRET
    process.env.APPROVAL_TOKEN_SECRET = SECRET
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.APPROVAL_TOKEN_SECRET
    else process.env.APPROVAL_TOKEN_SECRET = originalSecret
    vi.useRealTimers()
  })

  it("round-trip — sign then verify returns the same payload", () => {
    const token = signSelfAssessmentToken(SAMPLE_PAYLOAD)
    const result = verifySelfAssessmentToken(token)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload).toEqual(SAMPLE_PAYLOAD)
    }
  })

  it("rejects token signed with a different secret", () => {
    const token = signSelfAssessmentToken(SAMPLE_PAYLOAD)
    process.env.APPROVAL_TOKEN_SECRET =
      "totally-different-secret-of-32-plus-chars"
    const result = verifySelfAssessmentToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid_signature")
  })

  it("rejects malformed token (no separator)", () => {
    const result = verifySelfAssessmentToken("nodotinhere")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("malformed")
  })

  it("rejects malformed token (tampered payload)", () => {
    const token = signSelfAssessmentToken(SAMPLE_PAYLOAD)
    const [, sig] = token.split(".")
    const tampered = `dGFtcGVyZWQtcGF5bG9hZA.${sig}`
    const result = verifySelfAssessmentToken(tampered)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid_signature")
  })

  it("rejects expired token (exp in the past)", () => {
    const expired = {
      ...SAMPLE_PAYLOAD,
      exp: Math.floor(Date.now() / 1000) - 60,
    }
    const token = signSelfAssessmentToken(expired)
    const result = verifySelfAssessmentToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("expired")
  })

  it("throws when signing with no secret set", () => {
    delete process.env.APPROVAL_TOKEN_SECRET
    expect(() => signSelfAssessmentToken(SAMPLE_PAYLOAD)).toThrow(
      /APPROVAL_TOKEN_SECRET is not set/,
    )
  })

  it("throws when secret is too short (< 32 chars)", () => {
    process.env.APPROVAL_TOKEN_SECRET = "short"
    expect(() => signSelfAssessmentToken(SAMPLE_PAYLOAD)).toThrow(
      /too short/,
    )
  })

  it("rejects token with payload that lacks required fields", async () => {
    const head = Buffer.from(JSON.stringify({ foo: "bar" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const { createHmac } = await import("node:crypto")
    const sig = createHmac("sha256", SECRET)
      .update(head)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const result = verifySelfAssessmentToken(`${head}.${sig}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("malformed")
  })

  it("token is incompatible with PROJ-31 approval-token (cross-module replay defense)", async () => {
    const { verifyApprovalToken } = await import(
      "@/lib/decisions/approval-token"
    )
    const token = signSelfAssessmentToken(SAMPLE_PAYLOAD)
    // Same secret, but the payload has self-assessment fields → approval-token
    // verifier rejects it as malformed (missing approver_id/decision_id).
    const result = verifyApprovalToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("malformed")
  })
})
