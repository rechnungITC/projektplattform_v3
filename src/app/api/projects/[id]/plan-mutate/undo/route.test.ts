import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-65 ε.3b — Plan-Mutate Undo route smoke tests.
// Mirrors plan-mutate/route.test.ts: validates body, gates auth + RBAC,
// and maps the RPC envelope status to HTTP.

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  requireProjectAccessMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    rpc: mocks.rpcMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mocks.rpcMock,
  })),
}))

vi.mock("../../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../_lib/route-helpers")
  >("../../../../_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: vi.fn(async () => {
      const { data } = await mocks.getUserMock()
      const userId = data?.user?.id ?? null
      return {
        userId,
        supabase: {
          auth: { getUser: mocks.getUserMock },
          rpc: mocks.rpcMock,
        },
      }
    }),
    requireProjectAccess: mocks.requireProjectAccessMock,
  }
})

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const CAUSATION_ID = "66666666-6666-4666-8666-666666666666"

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/plan-mutate/undo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  )
}

const ctx = { params: Promise.resolve({ id: PROJECT_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.requireProjectAccessMock.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
})

describe("POST /api/projects/[id]/plan-mutate/undo", () => {
  it("returns 401 when not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(401)
  })

  it("returns 400 when causation_id is missing", async () => {
    const res = await POST(makeRequest({}), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 when causation_id is not a UUID", async () => {
    const res = await POST(makeRequest({ causation_id: "abc" }), ctx)
    expect(res.status).toBe(400)
  })

  it("delegates 403 from requireProjectAccess", async () => {
    mocks.requireProjectAccessMock.mockResolvedValue({
      error: new Response(
        JSON.stringify({
          error: { code: "forbidden", message: "Editor required." },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(403)
  })

  it("happy path: forwards causation_id and returns 200", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        causation_id: "77777777-7777-4777-8777-777777777777",
        diff: { affected: [] },
      },
      error: null,
    })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith("plan_mutate_undo_atomic", {
      p_project_id: PROJECT_ID,
      p_causation_id: CAUSATION_ID,
    })
  })

  it("maps RPC envelope status:409 to HTTP 409", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 409,
        conflict: {
          conflicted_node_ids: ["88888888-8888-4888-8888-888888888888"],
          current_snapshot_hint: {},
        },
      },
      error: null,
    })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(409)
  })

  it("maps RPC envelope status:403 (feature_disabled) to HTTP 403", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: { ok: false, status: 403, error: "feature_disabled" },
      error: null,
    })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(403)
  })

  it("returns 500 when the RPC itself errors", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    })
    const res = await POST(makeRequest({ causation_id: CAUSATION_ID }), ctx)
    expect(res.status).toBe(500)
  })
})
