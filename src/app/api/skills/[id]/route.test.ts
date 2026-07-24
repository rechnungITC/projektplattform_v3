import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-76 — single-skill route tests (GET skill+version, PATCH metadata).

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
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

import { GET, PATCH } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"

function ctx(id = SID) {
  return { params: Promise.resolve({ id }) }
}
function patch(body: unknown, id = SID) {
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

describe("GET /api/skills/[id]", () => {
  it("400 on non-uuid id", async () => {
    const res = await GET(new Request("http://t/"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("404 when RLS hides the skill", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })

  it("200 returns skill + current active version", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: SID, name: "A", current_version_id: "v9" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "v9", version_number: 3, status: "active" },
        error: null,
      })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { version: { id: string } | null }
    expect(json.version?.id).toBe("v9")
  })
})

describe("PATCH /api/skills/[id]", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await patch({ name: "B" })).status).toBe(403)
  })

  it("400 when body is empty (no fields)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({})).status).toBe(400)
  })

  it("400 on unknown project-type tag", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({ project_type_tags: ["sap"] })).status).toBe(400)
  })

  it("200 updates metadata for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: SID, name: "B" },
      error: null,
    })
    const res = await patch({ name: "B", method_tags: ["scrum"] })
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "B", method_tags: ["scrum"] })
    )
  })
})
