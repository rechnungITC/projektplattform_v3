/**
 * PROJ-50 — vitest for the PUBLIC Jira inbound webhook receiver.
 *
 *   - token too short → 401
 *   - unknown / revoked token → 401 (generic, no tenant leak)
 *   - valid token + issue key → 200 + idempotent upsert into jira_inbound_events
 *   - valid token + no issue key → 200 ignored (not queued)
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const tokenChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const upsertMock = vi.fn().mockResolvedValue({ error: null })
const tokenUpdateEq = vi.fn().mockResolvedValue({ error: null })

const fromMock = vi.fn((table: string) => {
  if (table === "jira_webhook_tokens") {
    return {
      ...tokenChain,
      update: vi.fn(() => ({ eq: tokenUpdateEq })),
    }
  }
  if (table === "jira_inbound_events") {
    return { upsert: upsertMock }
  }
  return tokenChain
})

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
}))

import { POST } from "./route"

const VALID_TOKEN = "a".repeat(64)
const TENANT_ID = "33333333-3333-4333-8333-333333333333"

function makePost(token: string, body: unknown): Request {
  return new Request(`http://localhost/api/connectors/jira/webhook/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-atlassian-webhook-identifier": "deliv-1" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertMock.mockResolvedValue({ error: null })
})

describe("POST /api/connectors/jira/webhook/[token]", () => {
  it("401 on too-short token (no DB lookup)", async () => {
    const res = await POST(makePost("short", {}), { params: Promise.resolve({ token: "short" }) })
    expect(res.status).toBe(401)
  })

  it("401 on unknown token", async () => {
    tokenChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makePost(VALID_TOKEN, { issue: { key: "P-1" } }), {
      params: Promise.resolve({ token: VALID_TOKEN }),
    })
    expect(res.status).toBe(401)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("401 on revoked token", async () => {
    tokenChain.maybeSingle.mockResolvedValue({
      data: { id: "tok-1", tenant_id: TENANT_ID, revoked_at: "2026-06-01T00:00:00Z" },
      error: null,
    })
    const res = await POST(makePost(VALID_TOKEN, { issue: { key: "P-1" } }), {
      params: Promise.resolve({ token: VALID_TOKEN }),
    })
    expect(res.status).toBe(401)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("200 + idempotent upsert on valid token with issue key", async () => {
    tokenChain.maybeSingle.mockResolvedValue({
      data: { id: "tok-1", tenant_id: TENANT_ID, revoked_at: null },
      error: null,
    })
    const res = await POST(
      makePost(VALID_TOKEN, { webhookEvent: "jira:issue_updated", issue: { key: "P-1", fields: { summary: "S" } } }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    )
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [payload, options] = upsertMock.mock.calls[0]
    expect(payload).toMatchObject({ tenant_id: TENANT_ID, jira_issue_key: "P-1", delivery_id: "deliv-1", status: "received" })
    expect(options).toMatchObject({ onConflict: "tenant_id,delivery_id", ignoreDuplicates: true })
  })

  it("200 ignored (not queued) when no issue key", async () => {
    tokenChain.maybeSingle.mockResolvedValue({
      data: { id: "tok-1", tenant_id: TENANT_ID, revoked_at: null },
      error: null,
    })
    const res = await POST(makePost(VALID_TOKEN, { webhookEvent: "ping" }), {
      params: Promise.resolve({ token: VALID_TOKEN }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ignored?: string }
    expect(body.ignored).toBe("no_issue_key")
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
