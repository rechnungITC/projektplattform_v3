import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-43-α — three-path Critical-Path-Detection.
// Covers:
//   T1 Path A isolated  — resource via source_stakeholder_id
//   T2 Path B isolated  — resource via linked_user_id (no stakeholder link)
//   T3 Path C isolated  — work_items.responsible_user_id
//   T4 Multipath        — same stakeholder via A and C → Set-Idempotenz
//   T5 Negative         — stakeholder without linked_user_id and without resource
//   T6 Negative         — phase is_critical = false
//   T7 Negative         — work_item is_deleted = true
//   T8 Cross-project    — allocation in another project of the same tenant

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const stakeholdersChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  __result: { data: [] as unknown[], error: null as null | { message: string } },
  then: (resolve: (v: unknown) => void) =>
    resolve(stakeholdersChain.__result),
}

const wirChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  __result: { data: [] as unknown[], error: null as null | { message: string } },
  then: (resolve: (v: unknown) => void) => resolve(wirChain.__result),
}

const workItemsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  __result: { data: [] as unknown[], error: null as null | { message: string } },
  then: (resolve: (v: unknown) => void) =>
    resolve(workItemsChain.__result),
}

const tenantSettingsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "stakeholders") return stakeholdersChain
  if (table === "work_item_resources") return wirChain
  if (table === "work_items") return workItemsChain
  if (table === "tenant_settings") return tenantSettingsChain
  throw new Error(`unexpected table ${table}`)
})

// PROJ-43-γ: RPC mock for compute_critical_path_phases. Default returns
// an empty critical-path so existing α/β tests behave unchanged.
const rpcMock = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

// PROJ-Security-α — `compute_critical_path_phases` is now invoked via the
// service-role admin client (EXECUTE revoked from `authenticated`). Mock
// the admin factory so it returns the same `rpc` mock used by tests.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

import { GET } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID_VIEWER = "33333333-3333-4333-8333-333333333333"

const STK_TEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" // no linked_user_id
const STK_ICKE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" // linked_user_id = USER_ICKE
const STK_BARE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" // no link, no resource
const USER_ICKE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

function makeReq(): {
  request: Request
  context: { params: Promise<{ id: string }> }
} {
  return {
    request: new Request(
      `http://localhost/api/projects/${PROJECT_ID}/stakeholder-health`,
    ),
    context: { params: Promise.resolve({ id: PROJECT_ID }) },
  }
}

function stakeholder(
  id: string,
  linked_user_id: string | null,
  name = `stk-${id.slice(0, 4)}`,
) {
  return {
    id,
    name,
    is_active: true,
    linked_user_id,
    attitude: null,
    conflict_potential: null,
    decision_authority: null,
    influence: null,
    impact: null,
    communication_need: null,
    preferred_channel: null,
    current_escalation_patterns: [],
    stakeholder_personality_profiles: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID_VIEWER } } })
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  stakeholdersChain.select.mockReturnValue(stakeholdersChain)
  stakeholdersChain.eq.mockReturnValue(stakeholdersChain)
  stakeholdersChain.__result = { data: [], error: null }
  wirChain.select.mockReturnValue(wirChain)
  wirChain.eq.mockReturnValue(wirChain)
  wirChain.__result = { data: [], error: null }
  workItemsChain.select.mockReturnValue(workItemsChain)
  workItemsChain.eq.mockReturnValue(workItemsChain)
  workItemsChain.not.mockReturnValue(workItemsChain)
  workItemsChain.__result = { data: [], error: null }
  tenantSettingsChain.select.mockReturnValue(tenantSettingsChain)
  tenantSettingsChain.eq.mockReturnValue(tenantSettingsChain)
  tenantSettingsChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
  // PROJ-43-γ default: RPC returns empty critical-path so existing α/β
  // tests behave as before. Individual γ tests override.
  rpcMock.mockResolvedValue({ data: [], error: null })
})

describe("GET /api/projects/[id]/stakeholder-health — PROJ-43-α three-path detection", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { request, context } = makeReq()
    const res = await GET(request, context)
    expect(res.status).toBe(401)
  })

  it("T1 Path A isolated: resource via source_stakeholder_id flags stakeholder", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_TEST, null)],
      error: null,
    }
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: STK_TEST, linked_user_id: null },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: true },
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders).toHaveLength(1)
    expect(body.stakeholders[0]?.id).toBe(STK_TEST)
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T2 Path B isolated: resource via linked_user_id (no source_stakeholder_id) flags stakeholder", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: null, linked_user_id: USER_ICKE },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: true },
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.id).toBe(STK_ICKE)
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T3 Path C isolated: work_items.responsible_user_id flags stakeholder via linked_user_id match", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: true },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.id).toBe(STK_ICKE)
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T4 Multipath: same stakeholder reached via A and C is flagged exactly once", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: STK_ICKE, linked_user_id: null },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: true },
          },
        },
      ],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-2",
          phases: { is_critical: true },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders).toHaveLength(1)
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T5 Negative: stakeholder without link and without allocation stays false", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_BARE, null)],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(false)
  })

  it("T6 Negative: phase is_critical=false does not flag stakeholder", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_TEST, null)],
      error: null,
    }
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: STK_TEST, linked_user_id: null },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: false },
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(false)
  })

  it("T7 Negative: is_deleted work-items are excluded from detection", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: true,
          phase_id: "phase-1",
          phases: { is_critical: true },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(false)
  })

  it("T8 Cross-project isolation: WIR query is project-filtered via .eq()", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_TEST, null)],
      error: null,
    }
    const { request, context } = makeReq()
    await GET(request, context)

    expect(wirChain.eq).toHaveBeenCalledWith("project_id", PROJECT_ID)
    expect(workItemsChain.eq).toHaveBeenCalledWith("project_id", PROJECT_ID)
  })

  it("response shape stays unchanged: linked_user_id is NOT exposed", async () => {
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<Record<string, unknown>>
    }
    expect(body.stakeholders[0]).toBeDefined()
    expect(Object.keys(body.stakeholders[0]!)).not.toContain("linked_user_id")
  })
})

// ---------------------------------------------------------------------------
// PROJ-43-β — Sprint path + method-gating
// ---------------------------------------------------------------------------

describe("GET /api/projects/[id]/stakeholder-health — PROJ-43-β method-gating", () => {
  it("T9 Scrum-only: sprint with is_critical=true flags stakeholder, phase data ignored", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: "scrum" },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    // Sprint-side WIR row — picked up by sprint-WIR query.
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: null, linked_user_id: USER_ICKE },
          work_items: {
            is_deleted: false,
            sprint_id: "sprint-1",
            sprints: { is_critical: true },
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.id).toBe(STK_ICKE)
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T10 Waterfall-only: sprint data with is_critical=true is ignored (sprint path inactive)", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: {
        id: PROJECT_ID,
        tenant_id: TENANT_ID,
        project_method: "waterfall",
      },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    // Sprint-shaped data — should be ignored because sprint path is inactive
    // for waterfall projects. Phase path runs but its data (workItemsChain
    // and wirChain when interpreted as phase rows) has no phases.is_critical.
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: null, linked_user_id: USER_ICKE },
          work_items: {
            is_deleted: false,
            sprint_id: "sprint-1",
            sprints: { is_critical: true },
            // no phases field → phase loop will not flag
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(false)
  })

  it("T11 NULL method (project setup): both phase + sprint paths active", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    // Phase-shaped row — phase path matches.
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: null, linked_user_id: USER_ICKE },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: true },
            sprint_id: null,
            sprints: null,
          },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
  })

  it("T12 Kanban: neither phase nor sprint path active → all stakeholders false", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: {
        id: PROJECT_ID,
        tenant_id: TENANT_ID,
        project_method: "kanban",
      },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    // Even with maximal critical data: kanban locks both paths.
    wirChain.__result = {
      data: [
        {
          resources: { source_stakeholder_id: STK_ICKE, linked_user_id: null },
          work_items: {
            is_deleted: false,
            phase_id: "phase-1",
            phases: { is_critical: true },
            sprint_id: "sprint-1",
            sprints: { is_critical: true },
          },
        },
      ],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: true },
          sprint_id: "sprint-1",
          sprints: { is_critical: true },
        },
      ],
      error: null,
    }

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{ id: string; on_critical_path: boolean }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PROJ-43-γ — Computed-Critical-Path-Marker via compute_critical_path_phases
// ---------------------------------------------------------------------------

describe("GET /api/projects/[id]/stakeholder-health — PROJ-43-γ computed critical path", () => {
  it("T13 RPC-only: computed phase flags stakeholder even when manual flag is false", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: false }, // manual NOT set
          sprint_id: null,
          sprints: null,
        },
      ],
      error: null,
    }
    rpcMock.mockResolvedValue({ data: ["phase-1"], error: null })

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{
        id: string
        on_critical_path: boolean
        critical_path_sources?: { manual: boolean; computed: boolean }
      }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.manual).toBe(false)
    expect(body.stakeholders[0]?.critical_path_sources?.computed).toBe(true)
  })

  it("T14 Manual-only: PM-marked phase still flags stakeholder when RPC returns empty", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: true },
          sprint_id: null,
          sprints: null,
        },
      ],
      error: null,
    }
    rpcMock.mockResolvedValue({ data: [], error: null })

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{
        on_critical_path: boolean
        critical_path_sources?: { manual: boolean; computed: boolean }
      }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.manual).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.computed).toBe(false)
  })

  it("T15 RPC error → graceful fallback: manual path still resolves, response 200", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: true },
          sprint_id: null,
          sprints: null,
        },
      ],
      error: null,
    }
    rpcMock.mockRejectedValue(new Error("RPC down"))

    const { request, context } = makeReq()
    const res = await GET(request, context)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      stakeholders: Array<{
        on_critical_path: boolean
        critical_path_sources?: { manual: boolean; computed: boolean }
      }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.manual).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.computed).toBe(false)
  })

  it("T16 Kanban: RPC is NOT called (Method-Gating short-circuits the computed path)", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: {
        id: PROJECT_ID,
        tenant_id: TENANT_ID,
        project_method: "kanban",
      },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }

    const { request, context } = makeReq()
    await GET(request, context)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("T17 Both sources: RPC and PM agree → critical_path_sources marks both true", async () => {
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    stakeholdersChain.__result = {
      data: [stakeholder(STK_ICKE, USER_ICKE)],
      error: null,
    }
    workItemsChain.__result = {
      data: [
        {
          responsible_user_id: USER_ICKE,
          is_deleted: false,
          phase_id: "phase-1",
          phases: { is_critical: true },
          sprint_id: null,
          sprints: null,
        },
      ],
      error: null,
    }
    rpcMock.mockResolvedValue({ data: ["phase-1"], error: null })

    const { request, context } = makeReq()
    const res = await GET(request, context)
    const body = (await res.json()) as {
      stakeholders: Array<{
        on_critical_path: boolean
        critical_path_sources?: { manual: boolean; computed: boolean }
      }>
    }
    expect(body.stakeholders[0]?.on_critical_path).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.manual).toBe(true)
    expect(body.stakeholders[0]?.critical_path_sources?.computed).toBe(true)
  })
})
