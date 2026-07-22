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
const GID = "99999999-4444-4444-8444-999999999999"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, gid: GID }) }
}
function req(body: unknown) {
  return new Request("http://t", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST .../stage-gates/[gid]/decide", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect((await POST(req({ decision: "freigabe" }), ctx())).status).toBe(401)
  })

  it("400 on invalid decision", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ decision: "maybe" }), ctx())).status).toBe(400)
  })

  it("400 when abbruch has no reason", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ decision: "abbruch" }), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error.field).toBe("reason")
  })

  it("200 on freigabe", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: { gate_id: GID, status: "passed", decision: "freigabe" },
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ decision: "freigabe" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).result.status).toBe("passed")
  })

  it("409 when gate already decided (RPC 23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: null,
        error: { code: "23514", message: "gate already decided" },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ decision: "freigabe" }), ctx())).status).toBe(409)
  })

  it("403 when RPC denies clearance/authority (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "42501", message: "denied" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ decision: "freigabe" }), ctx())).status).toBe(403)
  })

  it("forwards access error (e.g. non-lead 403)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }),
    })
    const forbidden = new Response("no", { status: 403 })
    accessMock.mockResolvedValue({ error: forbidden })
    expect((await POST(req({ decision: "freigabe" }), ctx())).status).toBe(403)
  })
})
