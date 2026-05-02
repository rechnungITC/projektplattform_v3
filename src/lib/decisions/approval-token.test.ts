import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  signApprovalToken,
  verifyApprovalToken,
} from "./approval-token"

const SAMPLE_PAYLOAD = {
  approver_id: "11111111-1111-1111-1111-111111111111",
  decision_id: "22222222-2222-2222-2222-222222222222",
  tenant_id: "33333333-3333-3333-3333-333333333333",
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
}

const SECRET = "this-is-a-test-secret-32-chars-long-aaaa"

describe("approval-token (PROJ-31)", () => {
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
    const token = signApprovalToken(SAMPLE_PAYLOAD)
    const result = verifyApprovalToken(token)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload).toEqual(SAMPLE_PAYLOAD)
    }
  })

  it("rejects token signed with a different secret", () => {
    const token = signApprovalToken(SAMPLE_PAYLOAD)
    process.env.APPROVAL_TOKEN_SECRET =
      "totally-different-secret-of-32-plus-chars"
    const result = verifyApprovalToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid_signature")
  })

  it("rejects malformed token (no separator)", () => {
    const result = verifyApprovalToken("nodotinhere")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("malformed")
  })

  it("rejects malformed token (tampered payload)", () => {
    const token = signApprovalToken(SAMPLE_PAYLOAD)
    const [, sig] = token.split(".")
    const tampered = `dGFtcGVyZWQtcGF5bG9hZA.${sig}`
    const result = verifyApprovalToken(tampered)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid_signature")
  })

  it("rejects expired token (exp in the past)", () => {
    const expired = {
      ...SAMPLE_PAYLOAD,
      exp: Math.floor(Date.now() / 1000) - 60,
    }
    const token = signApprovalToken(expired)
    const result = verifyApprovalToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("expired")
  })

  it("throws when signing with no secret set", () => {
    delete process.env.APPROVAL_TOKEN_SECRET
    expect(() => signApprovalToken(SAMPLE_PAYLOAD)).toThrow(
      /APPROVAL_TOKEN_SECRET is not set/,
    )
  })

  it("throws when secret is too short (< 32 chars)", () => {
    process.env.APPROVAL_TOKEN_SECRET = "short"
    expect(() => signApprovalToken(SAMPLE_PAYLOAD)).toThrow(
      /too short/,
    )
  })

  it("rejects token with payload that lacks required fields", async () => {
    // Construct a token whose head decodes to JSON but is missing fields.
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
    const result = verifyApprovalToken(`${head}.${sig}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("malformed")
  })
})
