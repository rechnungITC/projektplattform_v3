/**
 * PROJ-32-c-γ — integration tests for /api/tenants/[id]/ai-priority.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

interface MatrixRow {
  purpose: string
  data_class: number
  provider_order: string[]
}
const matrixState: { rows: MatrixRow[] } = { rows: [] }

const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
const deleteSpy = vi.fn()

// One unified thenable chain used for all priority queries — GET (select+eq+order),
// PUT-snapshot (select+eq), PUT-delete (delete+eq), and PUT-insert.
function makePriorityChain() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    delete: vi.fn(() => {
      deleteSpy()
      return chain
    }),
    insert: insertSpy,
    then(resolve: (value: { data: MatrixRow[]; error: null }) => void) {
      resolve({ data: matrixState.rows, error: null })
    },
  }
  return chain
}

const rpcMock = vi.fn(async () => ({ data: null, error: null }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => {
      if (table === "tenant_memberships") return tenantMembershipChain
      if (table === "tenant_ai_provider_priority") return makePriorityChain()
      throw new Error(`unexpected table ${table}`)
    }),
    rpc: rpcMock,
  })),
}))

import { GET, PUT } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  matrixState.rows = []
  insertSpy.mockResolvedValue({ data: null, error: null })

  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
})

function makeReq(body?: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/tenants/[id]/ai-priority", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns the persisted rules", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    matrixState.rows = [
      { purpose: "narrative", data_class: 3, provider_order: ["ollama"] },
    ]
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rules).toHaveLength(1)
    expect(body.rules[0].provider_order).toEqual(["ollama"])
  })
})

describe("PUT /api/tenants/[id]/ai-priority", () => {
  it("rejects body shape errors", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ no_rules_field: 1 }), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects Class-3 with cloud provider (CIA HIGH-risk lock)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({
        rules: [
          {
            purpose: "narrative",
            data_class: 3,
            provider_order: ["anthropic", "ollama"],
          },
        ],
      }),
      { params: Promise.resolve({ id: TENANT_ID }) },
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.message).toMatch(/Class-3/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("rejects duplicate (purpose, data_class) tuples", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({
        rules: [
          {
            purpose: "risks",
            data_class: 1,
            provider_order: ["anthropic"],
          },
          {
            purpose: "risks",
            data_class: 1,
            provider_order: ["ollama"],
          },
        ],
      }),
      { params: Promise.resolve({ id: TENANT_ID }) },
    )
    expect(res.status).toBe(400)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("rejects unknown purpose via Zod", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({
        rules: [
          { purpose: "fictional", data_class: 1, provider_order: ["anthropic"] },
        ],
      }),
      { params: Promise.resolve({ id: TENANT_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("rejects unknown provider via Zod", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({
        rules: [
          { purpose: "risks", data_class: 1, provider_order: ["openai"] },
        ],
      }),
      { params: Promise.resolve({ id: TENANT_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("happy path replaces matrix + audits each changed cell", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    matrixState.rows = [
      { purpose: "narrative", data_class: 3, provider_order: ["ollama"] },
    ]
    const res = await PUT(
      makeReq({
        rules: [
          {
            purpose: "narrative",
            data_class: 3,
            provider_order: ["ollama"],
          }, // unchanged — no audit row
          {
            purpose: "risks",
            data_class: 1,
            provider_order: ["anthropic", "ollama"],
          }, // new cell — audit row
        ],
      }),
      { params: Promise.resolve({ id: TENANT_ID }) },
    )
    expect(res.status).toBe(200)
    expect(deleteSpy).toHaveBeenCalled()
    expect(insertSpy).toHaveBeenCalledOnce()
    const auditCalls = rpcMock.mock.calls.filter(
      (c) => c[0] === "record_tenant_ai_priority_audit",
    )
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0][1]).toMatchObject({
      p_purpose: "risks",
      p_data_class: 1,
      p_old_order: null,
    })
  })

  it("empty rules array clears the matrix", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    matrixState.rows = [
      { purpose: "narrative", data_class: 3, provider_order: ["ollama"] },
    ]
    const res = await PUT(makeReq({ rules: [] }), {
      params: Promise.resolve({ id: TENANT_ID }),
    })
    expect(res.status).toBe(200)
    expect(deleteSpy).toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
    const auditCalls = rpcMock.mock.calls.filter(
      (c) => c[0] === "record_tenant_ai_priority_audit",
    )
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0][1]).toMatchObject({
      p_purpose: "narrative",
      p_data_class: 3,
      p_new_order: null,
    })
  })
})
