import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ADVISOR_USER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert", "update", "delete"]) {
    c[m] = vi.fn(() => c)
  }
  for (const t of ["limit", "single", "maybeSingle"]) {
    c[t] = vi.fn(async () => result)
  }
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function postReq(body: unknown) {
  return new Request("http://t/advisors", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/advisors", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/advisors"), ctx())).status).toBe(401)
  })

  it("returns advisor list", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "x" }], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/advisors"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).advisors).toHaveLength(1)
  })

  it("forwards the access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t/advisors"), ctx())).status).toBe(403)
  })
})

describe("POST /api/projects/[id]/advisors", () => {
  it("400 on invalid body (missing advisor_type)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(postReq({ user_id: ADVISOR_USER, organization: "X" }), ctx())
    expect(res.status).toBe(400)
  })

  it("creates an advisor profile (201)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "new", user_id: ADVISOR_USER }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      postReq({ user_id: ADVISOR_USER, organization: "Kanzlei XYZ", advisor_type: "legal" }),
      ctx()
    )
    expect(res.status).toBe(201)
    expect((await res.json()).advisor.id).toBe("new")
  })

  it("409 on duplicate advisor (unique violation)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23505", message: "dup" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      postReq({ user_id: ADVISOR_USER, organization: "X", advisor_type: "tax" }),
      ctx()
    )
    expect(res.status).toBe(409)
  })
})
