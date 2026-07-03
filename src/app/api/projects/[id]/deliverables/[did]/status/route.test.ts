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

import { PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DID = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, did: DID }) }
}
function req(body: unknown) {
  return new Request("http://t", { method: "PATCH", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PATCH .../deliverables/[did]/status", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await PATCH(req({ to_status: "in_progress" }), ctx())).status).toBe(401)
  })

  it("400 rejects to_status=approved (owned by PROJ-105)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(req({ to_status: "approved" }), ctx())).status).toBe(400)
  })

  it("400 rejects unknown status", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(req({ to_status: "done" }), ctx())).status).toBe(400)
  })

  it("200 transitions", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: DID, status: "in_progress" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(req({ to_status: "in_progress" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).deliverable.status).toBe("in_progress")
  })

  it("422 on invalid transition (RPC 23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "cannot transition" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(req({ to_status: "in_review" }), ctx())).status).toBe(422)
  })

  it("403 when RPC denies (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "42501", message: "denied" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(req({ to_status: "in_progress" }), ctx())).status).toBe(403)
  })
})
