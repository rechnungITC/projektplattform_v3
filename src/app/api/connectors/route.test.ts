import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const secretsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "tenant_secrets") return secretsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.RESEND_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  process.env.SECRETS_ENCRYPTION_KEY = "test-key-32-chars-minimum-1234567"
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
})

afterEach(() => {
  delete process.env.SECRETS_ENCRYPTION_KEY
})

describe("GET /api/connectors", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 when no tenant membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "member" }, error: null }
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns the registry list for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { connectors: unknown[] }
    expect(body.connectors).toHaveLength(6)
  })
})
