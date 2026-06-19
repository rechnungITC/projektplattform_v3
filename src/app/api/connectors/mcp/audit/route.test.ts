/**
 * PROJ-48 β — vitest for the MCP tool-call audit endpoint (tenant-admin only).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const membershipMaybeSingle = vi.fn()
const listResolve = vi.fn()

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
      if (table === "mcp_tool_calls") {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: listResolve })) })) })),
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

import { GET } from "./route"

const USER = "11111111-1111-4111-8111-111111111111"
const TENANT = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase = makeSupabase()
  getAuth.mockResolvedValue({ userId: USER, supabase: mockSupabase })
  requireAdmin.mockResolvedValue(null)
  membershipMaybeSingle.mockResolvedValue({ data: { tenant_id: TENANT }, error: null })
})

describe("GET /api/connectors/mcp/audit", () => {
  it("401 when not signed in", async () => {
    getAuth.mockResolvedValue({ userId: null, supabase: mockSupabase })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 when not a tenant admin", async () => {
    const { apiError } = (await vi.importActual("@/app/api/_lib/route-helpers")) as {
      apiError: (c: string, m: string, s: number) => Response
    }
    requireAdmin.mockResolvedValue(apiError("forbidden", "Admins only.", 403))
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns recent tool-call audit rows for the tenant", async () => {
    listResolve.mockResolvedValue({
      data: [{ id: "c1", tool_name: "tools/call:project.lookup", status: "ok" }],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.calls).toHaveLength(1)
    expect(json.calls[0].tool_name).toBe("tools/call:project.lookup")
  })
})
