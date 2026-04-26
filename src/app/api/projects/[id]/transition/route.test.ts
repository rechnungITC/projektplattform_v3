import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

const getUserMock = vi.fn()
const rpcMock = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

// -----------------------------------------------------------------------------

const PROJECT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/projects/x/transition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeContext() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// -----------------------------------------------------------------------------

describe("POST /api/projects/[id]/transition", () => {
  it("happy path: forwards to RPC and returns 200 with the JSONB body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const rpcResult = {
      id: PROJECT_ID,
      lifecycle_status: "active",
      from_status: "draft",
    }
    rpcMock.mockResolvedValue({ data: rpcResult, error: null })

    const res = await POST(
      makeRequest({ to_status: "active", comment: "kickoff" }),
      makeContext()
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rpcResult)
    expect(rpcMock).toHaveBeenCalledWith("transition_project_status", {
      p_project_id: PROJECT_ID,
      p_to_status: "active",
      p_comment: "kickoff",
    })
  })

  it("forwards null comment when omitted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: { id: PROJECT_ID, lifecycle_status: "canceled", from_status: "draft" },
      error: null,
    })

    await POST(makeRequest({ to_status: "canceled" }), makeContext())
    expect(rpcMock).toHaveBeenCalledWith(
      "transition_project_status",
      expect.objectContaining({ p_comment: null })
    )
  })

  it("returns 400 on invalid to_status enum", async () => {
    const res = await POST(
      makeRequest({ to_status: "bogus" }),
      makeContext()
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 when comment exceeds 2000 chars", async () => {
    const longComment = "x".repeat(2001)
    const res = await POST(
      makeRequest({ to_status: "active", comment: longComment }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      body: "{not json",
    })
    const res = await POST(req, makeContext())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  it("returns 400 when path id is not a UUID", async () => {
    const res = await POST(makeRequest({ to_status: "active" }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(401)
  })

  it("maps state-machine violation (23514) to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "cannot transition from completed to active",
      },
    })

    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_transition")
    expect(body.error.message).toContain("cannot transition")
  })

  it("maps insufficient_privilege (42501) to 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient role" },
    })

    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(403)
  })

  it("maps no_data (02000) to 404", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "02000", message: "project not found" },
    })

    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(404)
  })

  it("maps invalid_parameter (22023) to 422 (e.g. transition on deleted project)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "cannot transition a deleted project; restore first",
      },
    })

    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_parameter")
  })

  it("maps unknown errors to 500", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    })

    const res = await POST(
      makeRequest({ to_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(500)
  })
})
