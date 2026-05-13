import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

const sprintsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "sprints") return sprintsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const SPRINT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/sprints/${SPRINT_ID}/state`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  )
}

function makeContext() {
  return { params: Promise.resolve({ id: PROJECT_ID, sid: SPRINT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  sprintsChain.select.mockReturnValue(sprintsChain)
  sprintsChain.eq.mockReturnValue(sprintsChain)
})

describe("POST /api/projects/[id]/sprints/[sid]/state", () => {
  it("forwards the authenticated actor to set_sprint_state", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID },
      error: null,
    })
    const rpcResult = {
      id: SPRINT_ID,
      state: "active",
      from_state: "planned",
    }
    rpcMock.mockResolvedValue({ data: rpcResult, error: null })

    const res = await POST(makeRequest({ to_state: "active" }), makeContext())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: rpcResult })
    expect(rpcMock).toHaveBeenCalledWith("set_sprint_state", {
      p_sprint_id: SPRINT_ID,
      p_to_state: "active",
      p_actor_user_id: USER_ID,
    })
  })

  it("returns 404 when the sprint belongs to another project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: OTHER_PROJECT_ID },
      error: null,
    })

    const res = await POST(makeRequest({ to_state: "active" }), makeContext())

    expect(res.status).toBe(404)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("maps invalid state-machine transitions to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID },
      error: null,
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "another sprint in this project is already active",
      },
    })

    const res = await POST(makeRequest({ to_state: "active" }), makeContext())

    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_transition")
  })

  it("maps insufficient role to 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID },
      error: null,
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "insufficient role for sprint state transition",
      },
    })

    const res = await POST(makeRequest({ to_state: "active" }), makeContext())

    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("forbidden")
  })
})
