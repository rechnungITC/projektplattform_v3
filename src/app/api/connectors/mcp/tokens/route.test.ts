/**
 * PROJ-48 — vitest for MCP token management (tenant-admin only).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const membershipMaybeSingle = vi.fn()
const insertSingle = vi.fn()
const listResolve = vi.fn()
const updateChain = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ error: null }) }

function makeSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "tenant_memberships") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: membershipMaybeSingle,
        }
      }
      if (table === "mcp_access_tokens") {
        return {
          insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) })),
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: listResolve })) })) })),
          update: vi.fn(() => updateChain),
        }
      }
      return {}
    }),
  }
}

let mockSupabase = makeSupabase()
const getAuth = vi.fn()
const requireAdmin = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => mockSupabase) }))
vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: (...a: unknown[]) => getAuth(...a),
    requireTenantAdmin: (...a: unknown[]) => requireAdmin(...a),
  }
})

import { DELETE, GET, POST } from "./route"

const USER = "11111111-1111-4111-8111-111111111111"
const TENANT = "22222222-2222-4222-8222-222222222222"

function post(body: unknown): Request {
  return new Request("http://localhost/api/connectors/mcp/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase = makeSupabase()
  getAuth.mockResolvedValue({ userId: USER, supabase: mockSupabase })
  requireAdmin.mockResolvedValue(null) // admin
  membershipMaybeSingle.mockResolvedValue({ data: { tenant_id: TENANT }, error: null })
})

describe("POST /api/connectors/mcp/tokens", () => {
  it("401 when not signed in", async () => {
    getAuth.mockResolvedValue({ userId: null, supabase: mockSupabase })
    const res = await POST(post({}))
    expect(res.status).toBe(401)
  })

  it("403 when caller is not a tenant admin", async () => {
    const { apiError } = (await vi.importActual("@/app/api/_lib/route-helpers")) as {
      apiError: (c: string, m: string, s: number) => Response
    }
    requireAdmin.mockResolvedValue(apiError("forbidden", "Admins only.", 403))
    const res = await POST(post({}))
    expect(res.status).toBe(403)
  })

  it("400 on out-of-range expires_in_days", async () => {
    const res = await POST(post({ expires_in_days: 9999 }))
    expect(res.status).toBe(400)
  })

  it("201 issues a token, returns raw token + mcp_url once", async () => {
    insertSingle.mockResolvedValue({
      data: { id: "tok-1", label: "ci", created_at: "2026-01-01", expires_at: null },
      error: null,
    })
    const res = await POST(post({ label: "ci" }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.token).toMatch(/^mcp_[0-9a-f]{64}$/)
    expect(json.mcp_url).toContain("/api/mcp")
    expect(json.id).toBe("tok-1")
  })
})

describe("GET /api/connectors/mcp/tokens", () => {
  it("401 when not signed in", async () => {
    getAuth.mockResolvedValue({ userId: null, supabase: mockSupabase })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns token metadata for the tenant", async () => {
    listResolve.mockResolvedValue({ data: [{ id: "tok-1", label: "ci" }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tokens).toHaveLength(1)
  })
})

describe("DELETE /api/connectors/mcp/tokens", () => {
  it("400 on a non-UUID id", async () => {
    const res = await DELETE(new Request("http://localhost/api/connectors/mcp/tokens?id=nope", { method: "DELETE" }))
    expect(res.status).toBe(400)
  })

  it("200 revokes a token", async () => {
    const res = await DELETE(
      new Request(`http://localhost/api/connectors/mcp/tokens?id=${TENANT}`, { method: "DELETE" }),
    )
    expect(res.status).toBe(200)
  })
})
