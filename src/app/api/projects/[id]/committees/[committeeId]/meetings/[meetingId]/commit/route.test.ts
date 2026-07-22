import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))
vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { POST } from "./route"

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const C = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const M = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

const supa = (rpc: { data: unknown; error: unknown }) => ({ rpc: vi.fn(async () => rpc) })
const ctx = () => ({ params: Promise.resolve({ id: P, committeeId: C, meetingId: M }) })
const post = (b: unknown) => new Request("http://t", { method: "POST", body: JSON.stringify(b) })

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  accessMock.mockResolvedValue({ project: { id: P, tenant_id: "t1" } })
})

describe("POST .../commit", () => {
  it("401 unauth", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await POST(post({}), ctx())).status).toBe(401)
  })
  it("200 commits decisions + actions", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { decisions_created: 2, actions_created: 1 }, error: null }),
    })
    const res = await POST(post({ decisions: [{ title: "A" }, { title: "B" }], actions: [{ title: "T" }] }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).decisions_created).toBe(2)
  })
  it("400 on empty decision title", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    expect((await POST(post({ decisions: [{ title: "" }] }), ctx())).status).toBe(400)
  })
  it("403 when RPC denies", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: { code: "42501", message: "no" } }) })
    expect((await POST(post({ decisions: [{ title: "A" }] }), ctx())).status).toBe(403)
  })
})
