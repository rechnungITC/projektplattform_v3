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
const NDA = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const USER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert"]) c[m] = vi.fn(() => c)
  for (const t of ["limit", "single", "maybeSingle"]) c[t] = vi.fn(async () => result)
  return c
}
// returns a fresh chain per from() call, resolving to the next queued result
function supaSeq(results: { data: unknown; error: unknown }[]) {
  let i = 0
  return { from: vi.fn(() => chain(results[i++] ?? { data: null, error: null })) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, ndaId: NDA }) }
}
function postReq(body: unknown) {
  return new Request("http://t", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET assignments", () => {
  it("lists assignments", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaSeq([{ data: [{ id: "as1" }], error: null }]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).assignments).toHaveLength(1)
  })
})

describe("POST assignments", () => {
  it("400 when neither user_id nor contact_name provided", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaSeq([{ data: { id: NDA }, error: null }]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ contact_org: "X" }), ctx())).status).toBe(400)
  })

  it("404 when the NDA does not exist in this project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaSeq([{ data: null, error: null }]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ user_id: USER }), ctx())).status).toBe(404)
  })

  it("assigns a user (201)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaSeq([
        { data: { id: NDA }, error: null }, // NDA lookup
        { data: { id: "as1", user_id: USER }, error: null }, // insert
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(postReq({ user_id: USER }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).assignment.id).toBe("as1")
  })

  it("409 on duplicate assignment", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaSeq([
        { data: { id: NDA }, error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ user_id: USER }), ctx())).status).toBe(409)
  })
})
