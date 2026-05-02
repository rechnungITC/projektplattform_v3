import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 ST-07 — GET + POST /api/projects/[id]/work-items/[wid]/cost-lines

const getUserMock = vi.fn()
const auditInsertMock = vi.fn()

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
const workItemChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const costLinesChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  __listResult: { data: unknown[] | null; error: { message: string } | null }
  __insertResult: {
    data: unknown
    error: { code?: string; message: string } | null
  }
  then: (resolve: (v: unknown) => void) => void
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => costLinesChain.__insertResult),
  __listResult: { data: [], error: null },
  __insertResult: { data: null, error: null },
  then: (resolve) => resolve(costLinesChain.__listResult),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "work_items") return workItemChain
  if (table === "work_item_cost_lines") return costLinesChain
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
    from: () => ({ insert: auditInsertMock }),
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"

function makeListReq(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/cost-lines`
  )
}
function makePostReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/cost-lines`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}
function makeCtx() {
  return {
    params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  workItemChain.select.mockReturnValue(workItemChain)
  workItemChain.eq.mockReturnValue(workItemChain)
  costLinesChain.select.mockReturnValue(costLinesChain)
  costLinesChain.eq.mockReturnValue(costLinesChain)
  costLinesChain.order.mockReturnValue(costLinesChain)
  costLinesChain.limit.mockReturnValue(costLinesChain)
  costLinesChain.insert.mockReturnValue(costLinesChain)
  costLinesChain.__listResult = { data: [], error: null }
  costLinesChain.__insertResult = { data: null, error: null }

  // Default project + memberships: signed-in admin / lead.
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
  workItemChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, project_id: PROJECT_ID },
    error: null,
  })

  auditInsertMock.mockResolvedValue({ data: null, error: null })
})

describe("GET /api/projects/[id]/work-items/[wid]/cost-lines", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 404 when project is hidden by RLS (cross-project)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(404)
  })

  it("returns empty list when work item has no cost-lines", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    costLinesChain.__listResult = { data: [], error: null }
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { cost_lines: unknown[] }
    expect(body.cost_lines).toEqual([])
  })

  it("happy path: returns cost-lines list (200)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    costLinesChain.__listResult = {
      data: [
        {
          id: "cl1",
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          work_item_id: WORK_ITEM_ID,
          source_type: "manual",
          amount: 1500,
          currency: "EUR",
          occurred_on: "2026-04-01",
        },
      ],
      error: null,
    }
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      cost_lines: Array<{ id: string }>
    }
    expect(body.cost_lines).toHaveLength(1)
    expect(body.cost_lines[0].id).toBe("cl1")
  })
})

describe("POST /api/projects/[id]/work-items/[wid]/cost-lines", () => {
  const validBody = {
    amount: 1500,
    currency: "EUR",
    occurred_on: "2026-04-01",
    source_metadata: { note: "Lizenz-Posten" },
  }

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 403 for read-only member (not editor / lead / admin)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Tenant member (not admin) + no project membership ⇒ no edit rights.
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    projectMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(403)
  })

  it("returns 400 on negative amount", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePostReq({ ...validBody, amount: -1 }),
      makeCtx()
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 on invalid currency", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePostReq({ ...validBody, currency: "XYZ" }),
      makeCtx()
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when source_metadata exceeds 4 KB", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // 5 KB of dummy text.
    const big = "x".repeat(5000)
    const res = await POST(
      makePostReq({ ...validBody, source_metadata: { note: big } }),
      makeCtx()
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 404 when work item belongs to a different project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    workItemChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(404)
  })

  it("happy path: creates cost-line (201) + writes synthetic audit, source_type='manual'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    costLinesChain.__insertResult = {
      data: {
        id: "cl-new",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        work_item_id: WORK_ITEM_ID,
        source_type: "manual",
        amount: 1500,
        currency: "EUR",
        occurred_on: "2026-04-01",
      },
      error: null,
    }
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { cost_line: { id: string } }
    expect(body.cost_line.id).toBe("cl-new")

    // Verify the insert payload had source_type='manual' (not from client).
    expect(costLinesChain.insert).toHaveBeenCalledTimes(1)
    const insertPayload = costLinesChain.insert.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(insertPayload.source_type).toBe("manual")
    expect(insertPayload.source_ref_id).toBeNull()

    // Synthetic audit must have been written.
    expect(auditInsertMock).toHaveBeenCalledTimes(1)
    const auditPayload = auditInsertMock.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(auditPayload.entity_type).toBe("work_item_cost_lines")
    expect(auditPayload.field_name).toBe("row_created")
  })

  it("ignores client-supplied source_type — always 'manual'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    costLinesChain.__insertResult = {
      data: {
        id: "cl-new2",
        source_type: "manual",
        amount: 100,
        currency: "EUR",
      },
      error: null,
    }
    // Client tries to spoof source_type — schema strips it (Zod ignores
    // extra keys; route hardcodes the value).
    const res = await POST(
      makePostReq({
        ...validBody,
        source_type: "resource_allocation",
      }),
      makeCtx()
    )
    expect(res.status).toBe(201)
    const insertPayload = costLinesChain.insert.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(insertPayload.source_type).toBe("manual")
  })
})
