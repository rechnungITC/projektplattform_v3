import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-α — draft-version PATCH (edit-in-place) route tests.
// PROJ-141-α2 (M-9): If-Match REQUIRED → 428 if missing.
// PROJ-141-α5 (L-3): unknown allowed_actions → 422 (not 400).
// PROJ-141-α4 (M-11): DELETE discards a draft; non-admin/non-draft rejected.

const { getUserMock, resolveTenantMock, requireAdminMock, rpcMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    resolveTenantMock: vi.fn(),
    requireAdminMock: vi.fn(),
    rpcMock: vi.fn(),
  })
)

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
    rpc: rpcMock,
  })),
}))
vi.mock("../../../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { DELETE, PATCH } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"
const VID = "22222222-2222-4222-8222-222222222222"
const IF_MATCH_VALID = "2026-01-01T00:00:00Z"

function ctx(id = SID, vid = VID) {
  return { params: Promise.resolve({ id, vid }) }
}
function patch(
  body: unknown,
  headers: Record<string, string> = {},
  id = SID,
  vid = VID
) {
  return PATCH(
    new Request("http://t/", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers,
    }),
    ctx(id, vid)
  )
}
function del(id = SID, vid = VID) {
  return DELETE(
    new Request("http://t/", { method: "DELETE" }),
    ctx(id, vid)
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
  rpcMock.mockReset()
})

describe("PATCH /api/skills/[id]/versions/[vid]", () => {
  it("400 on non-uuid version id", async () => {
    expect((await patch({ markdown_body: "x" }, {}, SID, "nope")).status).toBe(
      400
    )
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect(
      (await patch({ markdown_body: "x" }, { "If-Match": IF_MATCH_VALID })).status
    ).toBe(401)
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect(
      (await patch({ markdown_body: "x" }, { "If-Match": IF_MATCH_VALID })).status
    ).toBe(403)
  })

  it("400 on empty body (no fields)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({}, { "If-Match": IF_MATCH_VALID })).status).toBe(400)
  })

  // PROJ-141-α5 (L-3): now 422 (unknown allowed_action is a semantic error).
  it("422 on unknown allowed_action", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    const res = await patch(
      { frontmatter: { allowed_actions: ["delete_everything"] } },
      { "If-Match": IF_MATCH_VALID }
    )
    expect(res.status).toBe(422)
  })

  // PROJ-141-α2 (M-9): If-Match is required.
  it("428 when If-Match header is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: VID, status: "draft", updated_at: IF_MATCH_VALID },
      error: null,
    })
    const res = await patch({ markdown_body: "x" })
    expect(res.status).toBe(428)
  })

  it("404 when the version is not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(
      (await patch({ markdown_body: "x" }, { "If-Match": IF_MATCH_VALID })).status
    ).toBe(404)
  })

  it("409 when the version is not a draft", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: VID, status: "active", updated_at: IF_MATCH_VALID },
      error: null,
    })
    expect(
      (await patch({ markdown_body: "x" }, { "If-Match": IF_MATCH_VALID })).status
    ).toBe(409)
  })

  it("409 on stale If-Match", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({
      data: { id: VID, status: "draft", updated_at: IF_MATCH_VALID },
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
        data: { id: VID, status: "draft", updated_at: IF_MATCH_VALID },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: VID, status: "draft", markdown_content: "new" },
        error: null,
      })
    const res = await patch(
      {
        markdown_body: "new",
        frontmatter: { allowed_actions: ["propose_work_item", "read_only"] },
      },
      { "If-Match": IF_MATCH_VALID }
    )
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ markdown_content: "new" })
    )
  })
})

describe("DELETE /api/skills/[id]/versions/[vid] — discard draft (PROJ-141-α4)", () => {
  it("400 on non-uuid version id", async () => {
    expect((await del(SID, "nope")).status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await del()).status).toBe(401)
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await del()).status).toBe(403)
  })

  it("404 when the version is not found (pre-RPC scope check)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await del()).status).toBe(404)
  })

  it("204 on successful discard", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: VID }, error: null })
    rpcMock.mockResolvedValueOnce({ error: null })
    const res = await del()
    expect(res.status).toBe(204)
    expect(rpcMock).toHaveBeenCalledWith("discard_skill_draft", {
      p_version_id: VID,
    })
  })

  it("409 when the version is not a draft (RPC P0001)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: VID }, error: null })
    rpcMock.mockResolvedValueOnce({
      error: { code: "P0001", message: "not a draft" },
    })
    expect((await del()).status).toBe(409)
  })

  it("403 when RPC admin-gate rejects (defence-in-depth)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: VID }, error: null })
    rpcMock.mockResolvedValueOnce({
      error: { code: "42501", message: "admin required" },
    })
    expect((await del()).status).toBe(403)
  })

  it("404 when RPC reports version-not-found (P0002)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: VID }, error: null })
    rpcMock.mockResolvedValueOnce({
      error: { code: "P0002", message: "not found" },
    })
    expect((await del()).status).toBe(404)
  })
})
