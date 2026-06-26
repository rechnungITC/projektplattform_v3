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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const Q = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supaRpc(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, questionId: Q }) }
}
function req(body: unknown) {
  return new Request("http://t/status", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST /api/projects/[id]/dd-questions/[questionId]/status", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supaRpc({ data: null, error: null }) })
    expect((await POST(req({ to_status: "in_answering" }), ctx())).status).toBe(401)
  })

  it("400 on invalid to_status", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supaRpc({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "bogus" }), ctx())).status).toBe(400)
  })

  it("transitions (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaRpc({ data: { id: Q, status: "in_answering" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ to_status: "in_answering" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).question.status).toBe("in_answering")
  })

  it("maps RPC 42501 (no role / no clearance) -> 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaRpc({ data: null, error: { code: "42501", message: "no" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "in_answering" }), ctx())).status).toBe(403)
  })

  it("maps RPC 23514 (illegal transition) -> 400", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaRpc({ data: null, error: { code: "23514", message: "bad" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "closed" }), ctx())).status).toBe(400)
  })

  it("maps RPC P0002 (not found) -> 404", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supaRpc({ data: null, error: { code: "P0002", message: "missing" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "in_answering" }), ctx())).status).toBe(404)
  })
})
