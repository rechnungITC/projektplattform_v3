import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/storage-quota", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("400 invalid project id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    const res = await GET(new Request("http://t"), { params: Promise.resolve({ id: "bad" }) })
    expect(res.status).toBe(400)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })

  it("200 computes pct_used + over_soft_warning", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: [{ max_bytes: 1000, current_usage_bytes: 850, soft_warning_pct: 80 }],
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pct_used).toBe(85)
    expect(body.over_soft_warning).toBe(true)
    expect(body.max_bytes).toBe(1000)
  })

  it("200 under the warning threshold", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: [{ max_bytes: 1000, current_usage_bytes: 100, soft_warning_pct: 80 }],
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const body = await (await GET(new Request("http://t"), ctx())).json()
    expect(body.pct_used).toBe(10)
    expect(body.over_soft_warning).toBe(false)
  })

  it("403 when the RPC denies (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "42501", message: "not a member" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })
})
