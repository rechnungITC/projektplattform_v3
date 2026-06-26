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
const STREAM = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const LEAD = "dddddddd-4444-4444-8444-dddddddddddd"

function supaRpc(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, streamId: STREAM }) }
}
function req(body: unknown) {
  return new Request("http://t/status", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST /api/projects/[id]/dd-streams/[streamId]/status", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supaRpc({ data: null, error: null }) })
    expect((await POST(req({ to_status: "started" }), ctx())).status).toBe(401)
  })

  it("400 on invalid to_status", async () => {
    getAuthMock.mockResolvedValue({ userId: LEAD, supabase: supaRpc({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "bogus" }), ctx())).status).toBe(400)
  })

  it("forwards access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: LEAD, supabase: supaRpc({ data: null, error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await POST(req({ to_status: "started" }), ctx())).status).toBe(403)
  })

  it("transitions the stream (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supaRpc({ data: { id: STREAM, status: "started" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ to_status: "started" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).stream.status).toBe("started")
  })

  it("maps RPC 42501 -> 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supaRpc({ data: null, error: { code: "42501", message: "no" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "started" }), ctx())).status).toBe(403)
  })

  it("maps RPC 23514 (illegal transition) -> 400", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supaRpc({ data: null, error: { code: "23514", message: "bad transition" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "completed" }), ctx())).status).toBe(400)
  })

  it("maps RPC P0002 (not found) -> 404", async () => {
    getAuthMock.mockResolvedValue({
      userId: LEAD,
      supabase: supaRpc({ data: null, error: { code: "P0002", message: "missing" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ to_status: "started" }), ctx())).status).toBe(404)
  })
})
