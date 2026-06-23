import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
let chain: Chain
let deleteResult: { error: unknown }
function resetChain() {
  deleteResult = { error: null }
  chain = {} as Chain
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  // eq is chainable, and for DELETE the terminal eq resolves to {error}
  chain.eq = vi.fn(() => {
    const thenable = Object.assign(chain, {
      then: (res: (v: { error: unknown }) => void) => res(deleteResult),
    })
    return thenable
  })
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { PATCH, DELETE } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const PID = "dddddddd-4444-4444-8444-dddddddddddd"

function ctx(id = PID) {
  return { params: Promise.resolve({ id }) }
}
function patch(body: unknown, id = PID) {
  return PATCH(
    new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(id)
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("PATCH /api/clearance-profiles/[id]", () => {
  it("400 on invalid id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    expect((await patch({ is_active: false }, "not-a-uuid")).status).toBe(400)
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await patch({ is_active: false })).status).toBe(403)
  })

  it("400 on empty patch body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({})).status).toBe(400)
  })

  it("200 deactivates a profile (is_active=false)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValue({
      data: { id: PID, is_active: false },
      error: null,
    })
    const res = await patch({ is_active: false })
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    )
  })

  it("404 when the profile is not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await patch({ name: "New" })).status).toBe(404)
  })
})

describe("DELETE /api/clearance-profiles/[id]", () => {
  it("200 hard-deletes for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect(chain.delete).toHaveBeenCalled()
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(403)
  })
})
