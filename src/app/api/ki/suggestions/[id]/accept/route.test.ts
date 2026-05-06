import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  })),
}))

// PROJ-Security — RPC routed through admin-client.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(): Request {
  return new Request(
    `http://localhost/api/ki/suggestions/${ID}/accept`,
    { method: "POST" }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/ki/suggestions/[id]/accept", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid uuid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 + risk_id on RPC success", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { success: true, message: "ok", risk_id: "risk-new" },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { risk_id: string }
    expect(body.risk_id).toBe("risk-new")
  })

  it("returns 409 when suggestion is no longer draft", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: false,
          message: "suggestion_not_draft",
          risk_id: null,
        },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: ID }),
    })
    expect(res.status).toBe(409)
  })

  it("returns 403 when caller lacks editor+ role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { success: false, message: "forbidden", risk_id: null },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 422 on invalid suggestion payload", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: false,
          message: "invalid_payload_probability",
          risk_id: null,
        },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: ID }),
    })
    expect(res.status).toBe(422)
  })
})
