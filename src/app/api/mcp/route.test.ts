/**
 * PROJ-48 — vitest for the public-ish MCP bridge endpoint.
 *
 *   - missing bearer token → 401 (no DB call)
 *   - malformed JSON body → 400
 *   - invalid token → 401 (rpc allowed=false)
 *   - rate-limited token → 429 + audit row with status rate_limited
 *   - valid token + tools/list → 200 JSON-RPC result + audit row
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const rpcMock = vi.fn()
const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn(() => ({ insert: insertMock }))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: rpcMock, from: fromMock })),
}))

import { POST } from "./route"

function makePost(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const TENANT = "33333333-3333-4333-8333-333333333333"
const TOKEN_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  insertMock.mockResolvedValue({ error: null })
})

describe("POST /api/mcp", () => {
  it("401 when the bearer token is missing (no DB call)", async () => {
    const res = await POST(makePost({ jsonrpc: "2.0", id: 1, method: "tools/list" }))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("400 on malformed JSON", async () => {
    const res = await POST(makePost("{not json", "mcp_tok"))
    expect(res.status).toBe(400)
  })

  it("400 on a non-JSON-RPC body (no method)", async () => {
    const res = await POST(makePost({ foo: "bar" }, "mcp_tok"))
    expect(res.status).toBe(400)
  })

  it("401 on an invalid token", async () => {
    rpcMock.mockResolvedValue({
      data: [{ tenant_id: null, token_id: null, allowed: false, reason: "invalid_token" }],
      error: null,
    })
    const res = await POST(makePost({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "mcp_bad"))
    expect(res.status).toBe(401)
    expect(insertMock).not.toHaveBeenCalled() // no tenant → no audit row
  })

  it("429 + audit row when rate-limited", async () => {
    rpcMock.mockResolvedValue({
      data: [{ tenant_id: TENANT, token_id: TOKEN_ID, allowed: false, reason: "rate_limited" }],
      error: null,
    })
    const res = await POST(makePost({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "mcp_tok"))
    expect(res.status).toBe(429)
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      tenant_id: TENANT,
      status: "rate_limited",
    })
  })

  it("200 + JSON-RPC result + audit row for a valid tools/list", async () => {
    rpcMock.mockResolvedValue({
      data: [{ tenant_id: TENANT, token_id: TOKEN_ID, allowed: true, reason: "ok" }],
      error: null,
    })
    const res = await POST(makePost({ jsonrpc: "2.0", id: 7, method: "tools/list" }, "mcp_tok"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(7)
    expect(json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "project.lookup",
      "project.status",
      "report.snapshot",
      "work_item.lookup",
    ])
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      tenant_id: TENANT,
      tool_name: "tools/list",
      status: "ok",
    })
  })
})
