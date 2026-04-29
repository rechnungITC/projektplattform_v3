import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-13 — send endpoint test for /api/projects/[id]/communication/outbox/[oid]/send.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const outboxReadChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }))

vi.mock("@/lib/communication/outbox-service", () => ({
  dispatchOutboxRow: dispatchMock,
}))

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "communication_outbox") return outboxReadChain
  if (table === "tenant_settings") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444"

function makeReq(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/communication/outbox/${OUTBOX_ID}/send`,
    { method: "POST" }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  outboxReadChain.select.mockReturnValue(outboxReadChain)
  outboxReadChain.eq.mockReturnValue(outboxReadChain)

  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe("POST /api/projects/[id]/communication/outbox/[oid]/send", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 404 when outbox row is not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    outboxReadChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 409 when outbox row is not in draft", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    outboxReadChain.maybeSingle.mockResolvedValue({
      data: {
        id: OUTBOX_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        channel: "email",
        recipient: "x@y.de",
        subject: null,
        body: "Body",
        metadata: {},
        status: "sent",
        error_detail: null,
        sent_at: "2026-04-29T13:00:00Z",
        created_by: USER_ID,
        created_at: "2026-04-29T12:00:00Z",
        updated_at: "2026-04-29T13:00:00Z",
      },
      error: null,
    })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }),
    })
    expect(res.status).toBe(409)
  })

  it("dispatches and returns 200 on sent", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    outboxReadChain.maybeSingle.mockResolvedValue({
      data: {
        id: OUTBOX_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        channel: "internal",
        recipient: "team",
        subject: null,
        body: "Body",
        metadata: {},
        status: "draft",
        error_detail: null,
        sent_at: null,
        created_by: USER_ID,
        created_at: "2026-04-29T12:00:00Z",
        updated_at: "2026-04-29T12:00:00Z",
      },
      error: null,
    })
    dispatchMock.mockResolvedValue({
      result: {
        status: "sent",
        error_detail: null,
        class3_blocked: false,
        stub: false,
      },
      row: { id: OUTBOX_ID, status: "sent" },
    })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      dispatch: { status: string; class3_blocked: boolean }
    }
    expect(json.dispatch.status).toBe("sent")
    expect(json.dispatch.class3_blocked).toBe(false)
  })

  it("returns 202 with class3_blocked=true on suppression", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    outboxReadChain.maybeSingle.mockResolvedValue({
      data: {
        id: OUTBOX_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        channel: "email",
        recipient: "x@y.de",
        subject: null,
        body: "Body",
        metadata: { ki_run_id: "run-1" },
        status: "draft",
        error_detail: null,
        sent_at: null,
        created_by: USER_ID,
        created_at: "2026-04-29T12:00:00Z",
        updated_at: "2026-04-29T12:00:00Z",
      },
      error: null,
    })
    dispatchMock.mockResolvedValue({
      result: {
        status: "suppressed",
        error_detail: "class-3-suppressed: …",
        class3_blocked: true,
        stub: false,
      },
      row: { id: OUTBOX_ID, status: "suppressed" },
    })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }),
    })
    expect(res.status).toBe(202)
    const json = (await res.json()) as {
      dispatch: { status: string; class3_blocked: boolean }
    }
    expect(json.dispatch.status).toBe("suppressed")
    expect(json.dispatch.class3_blocked).toBe(true)
  })
})
