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

import { DELETE } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const NDA = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ASSIGN = "ffffffff-6666-4666-8666-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "delete"]) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, ndaId: NDA, assignmentId: ASSIGN }) }
}
function req() {
  return new Request("http://t", { method: "DELETE" })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("DELETE assignment", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await DELETE(req(), ctx())).status).toBe(401)
  })

  it("400 on invalid id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    const badCtx = { params: Promise.resolve({ id: PROJECT, ndaId: NDA, assignmentId: "not-a-uuid" }) }
    expect((await DELETE(req(), badCtx)).status).toBe(400)
  })

  it("removes the assignment (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: ASSIGN }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(req(), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(true)
  })

  it("404 when missing", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await DELETE(req(), ctx())).status).toBe(404)
  })
})
