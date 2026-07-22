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
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST .../stage-gates/seed", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect(
      (await POST(new Request("http://t", { method: "POST" }), ctx())).status
    ).toBe(401)
  })

  it("200 seeds gates", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: { seeded: 9, target_phase_backfilled: 0 },
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).result.seeded).toBe(9)
  })

  it("422 on non-M&A project (RPC 22023)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: null,
        error: { code: "22023", message: "M&A only" },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect(
      (await POST(new Request("http://t", { method: "POST" }), ctx())).status
    ).toBe(422)
  })
})
