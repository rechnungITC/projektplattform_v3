/**
 * PROJ-50 — vitest for the inbound drain cron auth + empty-batch path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const selectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn(() => selectChain) })),
}))

import { GET } from "./route"

const ORIGINAL = process.env.CRON_SECRET

function makeGet(auth?: string): Request {
  return new Request("http://localhost/api/cron/jira-inbound-process", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  selectChain.limit.mockResolvedValue({ data: [], error: null })
  process.env.CRON_SECRET = "secret-xyz"
})
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL
})

describe("GET /api/cron/jira-inbound-process", () => {
  it("500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeGet("Bearer secret-xyz"))
    expect(res.status).toBe(500)
  })

  it("401 on missing auth header", async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it("401 on wrong secret", async () => {
    const res = await GET(makeGet("Bearer nope"))
    expect(res.status).toBe(401)
  })

  it("200 + zeroed summary on empty batch", async () => {
    const res = await GET(makeGet("Bearer secret-xyz"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { inspected: number; processed: number }
    expect(body.inspected).toBe(0)
    expect(body.processed).toBe(0)
  })
})
