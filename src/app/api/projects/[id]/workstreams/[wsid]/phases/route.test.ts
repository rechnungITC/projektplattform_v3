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

import { PUT } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const WSID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const PH = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"

// wsResult resolves .maybeSingle (workstream lookup); listResult resolves the
// awaited builder (existing phase rows + insert/delete).
function supa(
  wsResult: { data: unknown; error: unknown },
  listResult: { data: unknown; error: unknown }
) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => resolve(listResult),
  }
  for (const m of ["select", "eq", "insert", "delete", "in"]) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => wsResult)
  return { from: vi.fn(() => chain) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, wsid: WSID }) }
}
function putReq(body: unknown) {
  return new Request("http://t", { method: "PUT", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PUT /api/projects/[id]/workstreams/[wsid]/phases", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }, { data: [], error: null }),
    })
    expect((await PUT(putReq({ phase_ids: [] }), ctx())).status).toBe(401)
  })

  it("400 when phase_ids is not an array of uuids", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }, { data: [], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PUT(putReq({ phase_ids: ["nope"] }), ctx())).status).toBe(400)
  })

  it("404 when the workstream is not found", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }, { data: [], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PUT(putReq({ phase_ids: [PH] }), ctx())).status).toBe(404)
  })

  it("sets phases (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: { id: WSID, tenant_id: "t1" }, error: null },
        { data: [], error: null }
      ),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PUT(putReq({ phase_ids: [PH] }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).phase_ids).toEqual([PH])
  })
})
