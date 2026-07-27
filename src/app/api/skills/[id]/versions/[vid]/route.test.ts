import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-α — draft-version PATCH (edit-in-place) route tests.

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
vi.mock("../../../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { PATCH } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"
const VID = "22222222-2222-4222-8222-222222222222"

function ctx(id = SID, vid = VID) {
  return { params: Promise.resolve({ id, vid }) }
}
function patch(body: unknown, headers: Record<string, string> = {}, id = SID, vid = VID) {
  return PATCH(
    new Request("http://t/", { method: "PATCH", body: JSON.stringify(body), headers }),
    ctx(id, vid)
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("PATCH /api/skills/[id]/versions/[vid]", () => {
  it("400 on non-uuid version id", async () => {
    expect((await patch({ markdown_body: "x" }, {}, SID, "nope")).status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await patch({ markdown_body: "x" })).status).toBe(401)
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await patch({ markdown_body: "x" })).status).toBe(403)
  })

  it("400 on empty body (no fields)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({})).status).toBe(400)
  })

  it("400 on unknown allowed_action", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    const res = await patch({ frontmatter: { allowed_actions: ["delete_everything"] } })
    expect(res.status).toBe(400)
  })

  it("404 when the version is not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await patch({ markdown_body: "x" })).status).toBe(404)
  })

  it("409 when the version is not a draft", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: VID, status: "active", updated_at: "2026-01-01T00:00:00Z" },
      error: null,
    })
    expect((await patch({ markdown_body: "x" })).status).toBe(409)
  })

  it("409 on stale If-Match", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: VID, status: "draft", updated_at: "2026-01-01T00:00:00Z" },
      error: null,
    })
    const res = await patch({ markdown_body: "x" }, { "If-Match": "STALE" })
    expect(res.status).toBe(409)
  })

  it("200 edits a draft (valid allowed_actions accepted)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: VID, status: "draft", updated_at: "2026-01-01T00:00:00Z" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: VID, status: "draft", markdown_content: "new" },
        error: null,
      })
    const res = await patch(
      { markdown_body: "new", frontmatter: { allowed_actions: ["propose_work_item", "read_only"] } },
      { "If-Match": "2026-01-01T00:00:00Z" }
    )
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ markdown_content: "new" })
    )
  })
})
