import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-65 ε.3b — Plan-Mutate route smoke tests.
// Covers Zod validation, auth gate, requireProjectAccess delegation,
// and the RPC envelope-to-HTTP status mapping (200 / 403 / 409 / 422).

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

vi.mock("../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../_lib/route-helpers")
  >("../../../_lib/route-helpers")
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
const SOURCE_NODE_ID = "44444444-4444-4444-8444-444444444444"

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/plan-mutate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: PROJECT_ID }) }

const validBody = {
  source_node_id: SOURCE_NODE_ID,
  source_node_kind: "phase" as const,
  intent: { kind: "shift_dates" as const, days: 3 },
  if_updated_at: [
    {
      node_id: SOURCE_NODE_ID,
      node_kind: "phase",
      updated_at: "2026-05-22T10:00:00.000Z",
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.requireProjectAccessMock.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
})

describe("POST /api/projects/[id]/plan-mutate", () => {
  it("returns 401 when not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request(
      `http://localhost/api/projects/${PROJECT_ID}/plan-mutate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      },
    )
    const res = await POST(req, ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  it("returns 400 when path id is not a UUID", async () => {
    const res = await POST(makeRequest(validBody), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 on Zod validation failure (bad source_node_kind)", async () => {
    const res = await POST(
      makeRequest({ ...validBody, source_node_kind: "milestone" }),
      ctx,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 when intent.kind is not 'shift_dates'", async () => {
    const res = await POST(
      makeRequest({ ...validBody, intent: { kind: "rename", days: 1 } }),
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when intent.days is not an integer", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        intent: { kind: "shift_dates", days: 1.5 },
      }),
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it("delegates 403 from requireProjectAccess (RBAC pre-check)", async () => {
    mocks.requireProjectAccessMock.mockResolvedValue({
      error: new Response(
        JSON.stringify({
          error: { code: "forbidden", message: "Editor required." },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(403)
  })

  it("happy path: forwards args to plan_mutate_atomic RPC and returns 200", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        causation_id: "55555555-5555-4555-8555-555555555555",
        diff: { affected: [] },
      },
      error: null,
    })

    const res = await POST(makeRequest(validBody), ctx)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.causation_id).toBe("55555555-5555-4555-8555-555555555555")
    expect(mocks.rpcMock).toHaveBeenCalledWith("plan_mutate_atomic", {
      p_project_id: PROJECT_ID,
      p_source_node_id: SOURCE_NODE_ID,
      p_source_node_kind: "phase",
      p_intent: { kind: "shift_dates", days: 3 },
      p_if_updated_at: validBody.if_updated_at,
    })
  })

  it("maps RPC envelope status:409 (conflict) to HTTP 409", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 409,
        conflict: {
          conflicted_node_ids: [SOURCE_NODE_ID],
          current_snapshot_hint: { updated_at: "2026-05-22T11:00:00Z" },
        },
      },
      error: null,
    })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.conflict.conflicted_node_ids).toContain(SOURCE_NODE_ID)
  })

  it("maps RPC envelope status:422 (cycle) to HTTP 422", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 422,
        cycle: { detected_at_node_id: SOURCE_NODE_ID, path: [SOURCE_NODE_ID] },
      },
      error: null,
    })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.cycle.detected_at_node_id).toBe(SOURCE_NODE_ID)
  })

  it("maps RPC envelope status:403 (feature-flag off) to HTTP 403", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: { ok: false, status: 403, error: "feature_disabled" },
      error: null,
    })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("feature_disabled")
  })

  it("returns 500 when the RPC itself errors", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    })
    const res = await POST(makeRequest(validBody), ctx)
    expect(res.status).toBe(500)
  })

  // ε.3c.α — F-PROJ-65-50 hardened: RPC rejects empty / missing-source `if_updated_at`.
  it("maps RPC envelope status:422 (if_updated_at_required) to HTTP 422", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 422,
        error: "if_updated_at_required",
        hint: "Array must contain at minimum the source_node entry with current updated_at.",
      },
      error: null,
    })
    const res = await POST(
      makeRequest({ ...validBody, if_updated_at: [] }),
      ctx,
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("if_updated_at_required")
  })

  it("maps RPC envelope status:422 (source_node_lock_missing) to HTTP 422", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 422,
        error: "source_node_lock_missing",
        hint: "if_updated_at must include an entry for the source_node.",
      },
      error: null,
    })
    // Body has a lock entry but not for the source_node:
    const res = await POST(
      makeRequest({
        ...validBody,
        if_updated_at: [
          {
            node_id: "99999999-9999-4999-8999-999999999999",
            node_kind: "phase",
            updated_at: "2026-05-22T10:00:00Z",
          },
        ],
      }),
      ctx,
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("source_node_lock_missing")
  })

  // ===========================================================================
  // ε.3c.β — Multi-Source Bulk-Mutate
  // ===========================================================================

  const SOURCE_NODE_ID_2 = "66666666-6666-4666-8666-666666666666"

  const validBulkBody = {
    sources: [
      { node_id: SOURCE_NODE_ID, node_kind: "phase" as const },
      { node_id: SOURCE_NODE_ID_2, node_kind: "sprint" as const },
    ],
    intent: { kind: "shift_dates" as const, days: 5 },
    if_updated_at: [
      {
        node_id: SOURCE_NODE_ID,
        node_kind: "phase",
        updated_at: "2026-05-25T10:00:00.000Z",
      },
      {
        node_id: SOURCE_NODE_ID_2,
        node_kind: "sprint",
        updated_at: "2026-05-25T10:00:00.000Z",
      },
    ],
  }

  it("multi-source happy path: forwards args to plan_mutate_atomic_bulk RPC and returns 200", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        causation_id: "77777777-7777-4777-8777-777777777777",
        diff: { affected: [] },
      },
      error: null,
    })

    const res = await POST(makeRequest(validBulkBody), ctx)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.causation_id).toBe("77777777-7777-4777-8777-777777777777")
    expect(mocks.rpcMock).toHaveBeenCalledWith("plan_mutate_atomic_bulk", {
      p_project_id: PROJECT_ID,
      p_sources: validBulkBody.sources,
      p_intent: { kind: "shift_dates", days: 5 },
      p_if_updated_at: validBulkBody.if_updated_at,
    })
  })

  it("multi-source 422 cycle: forwards source_node_id in response body", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 422,
        cycle: {
          detected_at_node_id: SOURCE_NODE_ID,
          path: [SOURCE_NODE_ID, SOURCE_NODE_ID_2],
          source_node_id: SOURCE_NODE_ID_2,
        },
      },
      error: null,
    })
    const res = await POST(makeRequest(validBulkBody), ctx)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.cycle.source_node_id).toBe(SOURCE_NODE_ID_2)
    expect(body.cycle.detected_at_node_id).toBe(SOURCE_NODE_ID)
  })

  it("multi-source 422 source_node_lock_missing: bulk RPC reports a source missing from if_updated_at", async () => {
    mocks.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        status: 422,
        error: "source_node_lock_missing",
        hint: "if_updated_at must include an entry for every source_node.",
        missing_sources: [
          { node_id: SOURCE_NODE_ID_2, node_kind: "sprint" },
        ],
      },
      error: null,
    })
    // Body has sources [phase, sprint] but if_updated_at only includes phase.
    const bodyMissingLock = {
      ...validBulkBody,
      if_updated_at: [
        {
          node_id: SOURCE_NODE_ID,
          node_kind: "phase",
          updated_at: "2026-05-25T10:00:00.000Z",
        },
      ],
    }
    const res = await POST(makeRequest(bodyMissingLock), ctx)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("source_node_lock_missing")
    expect(body.missing_sources).toEqual([
      { node_id: SOURCE_NODE_ID_2, node_kind: "sprint" },
    ])
    // Confirm dispatch went to the bulk RPC, not the legacy single-source one.
    expect(mocks.rpcMock).toHaveBeenCalledWith(
      "plan_mutate_atomic_bulk",
      expect.objectContaining({
        p_project_id: PROJECT_ID,
        p_sources: validBulkBody.sources,
      }),
    )
  })
})
