import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-9 Round 2 — polymorphic dependencies (project-scoped POST/GET).
// We mock the Supabase client to drive each path of the route.

const getUserMock = vi.fn()

type MaybeSingleResult = { data: unknown; error: unknown }
type SingleResult = { data: unknown; error: unknown }
type ListResult = { data: unknown[] | null; error: unknown }

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

let workItemsResult: ListResult = { data: [], error: null }
const workItemsChain: {
  select: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  then: (
    resolve: (v: ListResult) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise<unknown>
} = {
  select: vi.fn(() => workItemsChain),
  in: vi.fn(() => workItemsChain),
  eq: vi.fn(() => workItemsChain),
  then: (resolve, reject) =>
    Promise.resolve(workItemsResult).then(resolve, reject),
}

let phasesResult: ListResult = { data: [], error: null }
const phasesChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  then: (
    resolve: (v: ListResult) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise<unknown>
} = {
  select: vi.fn(() => phasesChain),
  eq: vi.fn(() => phasesChain),
  then: (resolve, reject) =>
    Promise.resolve(phasesResult).then(resolve, reject),
}

const dependenciesInsertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "work_items") return workItemsChain
  if (table === "phases") return phasesChain
  if (table === "dependencies") return dependenciesInsertChain
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
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-999999999999"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const PRED_ID = "44444444-4444-4444-8444-444444444444"
const SUCC_ID = "55555555-5555-4555-8555-555555555555"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/dependencies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

function setProject(data: { id: string; tenant_id: string } | null) {
  projectChain.maybeSingle.mockResolvedValue({
    data,
    error: null,
  } satisfies MaybeSingleResult)
}

function setWorkItems(items: { id: string; project_id: string; kind: string }[]) {
  workItemsResult = { data: items, error: null }
}

function setInsertResult(res: SingleResult) {
  dependenciesInsertChain.single.mockResolvedValue(res)
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  dependenciesInsertChain.insert.mockReturnValue(dependenciesInsertChain)
  dependenciesInsertChain.select.mockReturnValue(dependenciesInsertChain)

  setProject({ id: PROJECT_ID, tenant_id: TENANT_ID })
  setWorkItems([])
  phasesResult = { data: [], error: null }
})

describe("POST /api/projects/[id]/dependencies — legacy body shape", () => {
  it("maps work_package + task to (work_package, todo) and inserts (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setWorkItems([
      { id: PRED_ID, project_id: PROJECT_ID, kind: "work_package" },
      { id: SUCC_ID, project_id: PROJECT_ID, kind: "task" },
    ])
    setInsertResult({
      data: {
        id: "dep-1",
        tenant_id: TENANT_ID,
        from_type: "work_package",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: SUCC_ID,
        constraint_type: "FS",
        lag_days: 0,
      },
      error: null,
    })

    const res = await POST(
      makePost({ predecessor_id: PRED_ID, successor_id: SUCC_ID, type: "FS" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      dependency: { from_type: string; to_type: string }
    }
    expect(body.dependency.from_type).toBe("work_package")
    expect(body.dependency.to_type).toBe("todo")
    // Verify the INSERT payload used the polymorphic shape.
    const insertCall = dependenciesInsertChain.insert.mock.calls[0]?.[0] as {
      from_type: string
      to_type: string
      tenant_id: string
    }
    expect(insertCall.from_type).toBe("work_package")
    expect(insertCall.to_type).toBe("todo")
    expect(insertCall.tenant_id).toBe(TENANT_ID)
  })

  it("rejects legacy body when predecessor and successor sit in different projects (422)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setWorkItems([
      { id: PRED_ID, project_id: PROJECT_ID, kind: "task" },
      { id: SUCC_ID, project_id: OTHER_PROJECT_ID, kind: "task" },
    ])

    const res = await POST(
      makePost({ predecessor_id: PRED_ID, successor_id: SUCC_ID, type: "FS" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("cross_project")
  })
})

describe("POST /api/projects/[id]/dependencies — polymorphic body shape", () => {
  it("inserts cross-project edge with explicit from_type/to_type (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setInsertResult({
      data: {
        id: "dep-2",
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: SUCC_ID,
        constraint_type: "FS",
        lag_days: 0,
      },
      error: null,
    })

    const res = await POST(
      makePost({
        from_type: "todo",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: SUCC_ID,
        constraint_type: "FS",
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)
    // The polymorphic path does not call work_items lookup — verify we
    // bypassed the legacy same-project gate.
    expect(workItemsChain.in).not.toHaveBeenCalled()
  })

  it("returns 422 cycle_detected on cycle violation (errcode check_violation)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setInsertResult({
      data: null,
      error: { code: "23514", message: "dependency cycle detected (todo …)" },
    })

    const res = await POST(
      makePost({
        from_type: "todo",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: SUCC_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("cycle_detected")
  })

  it("returns 422 cross_tenant when tenant-boundary trigger fires (22023)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setInsertResult({
      data: null,
      error: {
        code: "22023",
        message:
          "cross-tenant dependencies are not allowed (from_tenant=…, to_tenant=…, edge_tenant=…)",
      },
    })

    const res = await POST(
      makePost({
        from_type: "todo",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: SUCC_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("cross_tenant")
  })

  it("returns 422 self_dependency when from and to are identical", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const res = await POST(
      makePost({
        from_type: "todo",
        from_id: PRED_ID,
        to_type: "todo",
        to_id: PRED_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("self_dependency")
  })
})
