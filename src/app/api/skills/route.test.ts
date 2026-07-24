import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-76 — skills catalog route tests (GET list + POST create-with-v1).

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn()
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn()
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function get(url = "http://t/api/skills") {
  return GET(new Request(url))
}
function post(body: unknown) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) })
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("GET /api/skills", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await get()).status).toBe(401)
  })

  it("403 when no active tenant", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(null)
    expect((await get()).status).toBe(403)
  })

  it("lists active skills by default (adds is_active filter)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    chain.limit.mockResolvedValue({
      data: [{ id: "s1", name: "A", slug: "a", is_active: true }],
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { skills: unknown[] }
    expect(json.skills).toHaveLength(1)
    expect(chain.eq).toHaveBeenCalledWith("is_active", true)
  })

  it("omits is_active filter with include_inactive=true", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    chain.limit.mockResolvedValue({ data: [], error: null })
    await get("http://t/api/skills?include_inactive=true")
    expect(chain.eq).not.toHaveBeenCalledWith("is_active", true)
  })
})

describe("POST /api/skills", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ name: "A", slug: "a", category: "method" })).status).toBe(401)
  })

  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await post({ name: "A", slug: "a", category: "method" })).status).toBe(403)
  })

  it("400 on invalid slug (uppercase/space)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ name: "A", slug: "Bad Slug", category: "method" })).status).toBe(400)
  })

  it("400 on unknown method tag", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    const res = await post({
      name: "A",
      slug: "a",
      category: "method",
      method_tags: ["itil"],
    })
    expect(res.status).toBe(400)
  })

  it("400 on invalid category", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ name: "A", slug: "a", category: "bogus" })).status).toBe(400)
  })

  it("201 creates a skill + initial v1 draft", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single
      .mockResolvedValueOnce({ data: { id: "s1", slug: "a" }, error: null })
      .mockResolvedValueOnce({ data: { id: "v1", version_number: 1 }, error: null })
    const res = await post({
      name: "Risk Coach",
      slug: "risk-coach",
      category: "cross_cutting",
      method_tags: ["scrum"],
      project_type_tags: ["erp"],
      markdown_body: "# Hi",
    })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenant_id: "t1", slug: "risk-coach", created_by: ME })
    )
    expect(chain.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        skill_id: "s1",
        tenant_id: "t1",
        version_number: 1,
        status: "draft",
      })
    )
  })

  it("409 on duplicate slug (23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "dup" },
    })
    const res = await post({ name: "A", slug: "a", category: "method" })
    expect(res.status).toBe(409)
  })

  it("rolls back the skill if the v1 insert fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single
      .mockResolvedValueOnce({ data: { id: "s1", slug: "a" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "500", message: "boom" } })
    chain.eq.mockReturnValue(chain)
    const res = await post({ name: "A", slug: "a", category: "method" })
    expect(res.status).toBe(500)
    expect(chain.delete).toHaveBeenCalled()
  })
})
