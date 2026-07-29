import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-α — one-open-draft guard on POST /api/skills/[id]/versions.

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  chain.single = vi.fn()
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"

function ctx(id = SID) {
  return { params: Promise.resolve({ id }) }
}
function post(body: unknown, id = SID) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) }),
    ctx(id)
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("POST /api/skills/[id]/versions (one-open-draft guard)", () => {
  it("409 when an open draft already exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: SID }, error: null }) // skill exists
      .mockResolvedValueOnce({ data: { id: "draft-1" }, error: null }) // open draft exists
    const res = await post({ markdown_body: "x" })
    expect(res.status).toBe(409)
    expect(chain.insert).not.toHaveBeenCalled()
  })

  // PROJ-141-α5 (L-3) — unknown allowed_actions → 422 (not 400).
  it("422 on unknown allowed_action", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    const res = await post({
      markdown_body: "x",
      frontmatter: { allowed_actions: ["delete_everything"] },
    })
    expect(res.status).toBe(422)
  })

  it("201 creates a draft when none is open", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: SID }, error: null }) // skill exists
      .mockResolvedValueOnce({ data: null, error: null }) // no open draft
      .mockResolvedValueOnce({ data: { version_number: 2 }, error: null }) // last version
    chain.single.mockResolvedValue({
      data: { id: "v3", version_number: 3, status: "draft" },
      error: null,
    })
    const res = await post({ markdown_body: "x" })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ version_number: 3, status: "draft" })
    )
  })
})
