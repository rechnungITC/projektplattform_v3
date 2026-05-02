import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SupabaseClient } from "@supabase/supabase-js"

import { synthesizeResourceAllocationCostLines } from "./synthesize-cost-lines"

// PROJ-24 Phase δ — synthesizer tests.
//
// The synthesizer composes:
//   - DB reads (work_items, work_item_resources, resources, stakeholders,
//     tenant_settings, work_item_cost_lines)
//   - DB writes (DELETE + INSERT on work_item_cost_lines)
//   - the pure-TS engine (already tested in 24-β)
//   - the role-rate lookup (already tested in 24-β)
//   - the cost-audit helper (already exercised in 24-γ)
//
// We mock the admin Supabase client at the surface level (per-table chains
// + an `.rpc()` stub for the role-rate lookup). The audit helper is mocked
// to a noop so we don't have to wire the real createAdminClient there.

const auditMock = vi.fn(async (_input: Record<string, unknown>) => undefined)
vi.mock("@/app/api/_lib/cost-audit", () => ({
  writeCostAuditEntry: (input: Record<string, unknown>) => auditMock(input),
}))

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"
const ALLOCATION_ID = "44444444-4444-4444-8444-444444444444"
const RESOURCE_ID = "66666666-6666-4666-8666-666666666666"
const STAKEHOLDER_ID = "77777777-7777-4777-8777-777777777777"

interface ChainResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

interface TableState {
  workItem: ChainResult
  allocations: ChainResult
  resources: ChainResult
  stakeholders: ChainResult
  tenantSettings: ChainResult
  existingCostLines: ChainResult
  delResult: ChainResult
  insertResult: ChainResult
}

function defaultState(): TableState {
  return {
    workItem: {
      data: {
        id: WORK_ITEM_ID,
        kind: "work_package",
        attributes: { estimated_duration_days: 4 },
        created_at: "2026-04-01T10:00:00Z",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        is_deleted: false,
      },
      error: null,
    },
    allocations: {
      data: [
        {
          id: ALLOCATION_ID,
          resource_id: RESOURCE_ID,
          allocation_pct: 100,
        },
      ],
      error: null,
    },
    resources: {
      data: [{ id: RESOURCE_ID, source_stakeholder_id: STAKEHOLDER_ID }],
      error: null,
    },
    stakeholders: {
      data: [{ id: STAKEHOLDER_ID, role_key: "senior_dev" }],
      error: null,
    },
    tenantSettings: {
      data: { cost_settings: { velocity_factor: 0.5, default_currency: "EUR" } },
      error: null,
    },
    existingCostLines: {
      data: [],
      error: null,
    },
    delResult: { data: null, error: null },
    insertResult: {
      data: [
        {
          id: "new-cl-1",
          amount: 1000,
          currency: "EUR",
          source_ref_id: ALLOCATION_ID,
          source_metadata: { basis: "duration" },
        },
      ],
      error: null,
    },
  }
}

function makeMockClient(state: TableState) {
  // Track inserts so tests can assert payload.
  const insertCalls: unknown[] = []
  const deleteCalls: number[] = []

  // RPC stub for role-rate lookup.
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: {
      tenant_id: TENANT_ID,
      role_key: "senior_dev",
      daily_rate: 1000,
      currency: "EUR",
      valid_from: "2026-01-01",
    },
    error: null,
  }))

  // Per-table chain factories.
  function workItemsChain() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => state.workItem,
    }
    return chain
  }
  function workItemResourcesChain() {
    // List path: chain ends with `.limit()` returning a thenable.
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => Promise.resolve(state.allocations),
    }
    return chain
  }
  function resourcesChain() {
    const chain = {
      select: () => chain,
      in: () => chain,
      eq: () => Promise.resolve(state.resources),
    }
    return chain
  }
  function stakeholdersChain() {
    const chain = {
      select: () => chain,
      in: () => chain,
      eq: () => Promise.resolve(state.stakeholders),
    }
    return chain
  }
  function tenantSettingsChain() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => state.tenantSettings,
    }
    return chain
  }
  function costLinesChain() {
    let mode: "select" | "delete" | "insert" = "select"
    let insertPayload: unknown = null
    const chain: Record<string, unknown> = {
      select: () => {
        if (mode === "insert") {
          // After insert.select() → return inserted result directly.
          return Promise.resolve(state.insertResult)
        }
        return chain
      },
      eq: () => chain,
      delete: () => {
        mode = "delete"
        return chain
      },
      insert: (payload: unknown) => {
        mode = "insert"
        insertPayload = payload
        insertCalls.push(payload)
        return chain
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === "select") {
          resolve(state.existingCostLines)
        } else if (mode === "delete") {
          deleteCalls.push(1)
          resolve(state.delResult)
        } else {
          // insert without follow-up .select(): not used in this code path.
          resolve(state.insertResult)
        }
      },
    }
    void insertPayload
    return chain
  }

  const fromMock = vi.fn((table: string) => {
    if (table === "work_items") return workItemsChain()
    if (table === "work_item_resources") return workItemResourcesChain()
    if (table === "resources") return resourcesChain()
    if (table === "stakeholders") return stakeholdersChain()
    if (table === "tenant_settings") return tenantSettingsChain()
    if (table === "work_item_cost_lines") return costLinesChain()
    throw new Error(`unexpected table ${table}`)
  })

  const client = { from: fromMock, rpc } as unknown as SupabaseClient
  return { client, fromMock, rpc, insertCalls, deleteCalls }
}

beforeEach(() => {
  auditMock.mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("synthesizeResourceAllocationCostLines", () => {
  it("happy path: writes one cost-line for a duration-based work-item", async () => {
    const state = defaultState()
    const { client, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(1)
    expect(result.warnings).toEqual([])
    expect(insertCalls).toHaveLength(1)
    const payload = insertCalls[0] as Array<Record<string, unknown>>
    expect(payload[0].source_type).toBe("resource_allocation")
    expect(payload[0].tenant_id).toBe(TENANT_ID)
    expect(payload[0].project_id).toBe(PROJECT_ID)
    expect(payload[0].work_item_id).toBe(WORK_ITEM_ID)
    expect(payload[0].source_ref_id).toBe(ALLOCATION_ID)
    expect(payload[0].created_by).toBe(USER_ID)
    // Audit: 1 INSERT (no existing → no DELETE audit).
    expect(auditMock).toHaveBeenCalledTimes(1)
    const auditArg = auditMock.mock.calls[0][0] as Record<string, unknown>
    expect(auditArg.action).toBe("insert")
  })

  it("Replace-on-Update: deletes existing + inserts new + writes audits for both", async () => {
    const state = defaultState()
    state.existingCostLines = {
      data: [
        {
          id: "old-cl-1",
          amount: 800,
          currency: "EUR",
          source_ref_id: ALLOCATION_ID,
          source_metadata: { basis: "duration" },
        },
      ],
      error: null,
    }
    const { client, deleteCalls, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(1)
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1)
    expect(insertCalls).toHaveLength(1)
    // Audit: 1 DELETE for the old + 1 INSERT for the new.
    expect(auditMock).toHaveBeenCalledTimes(2)
    const actions = auditMock.mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).action
    )
    expect(actions).toEqual(expect.arrayContaining(["delete", "insert"]))
  })

  it("soft-deleted work-item: no synthesis, no error", async () => {
    const state = defaultState()
    state.workItem = {
      data: { ...(state.workItem.data as Record<string, unknown>), is_deleted: true },
      error: null,
    }
    const { client, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(0)
    expect(insertCalls).toHaveLength(0)
    expect(auditMock).not.toHaveBeenCalled()
  })

  it("missing work-item (hard-deleted between mutation and hook): no error", async () => {
    const state = defaultState()
    state.workItem = { data: null, error: null }
    const { client } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(0)
  })

  it("zero allocations: no cost-lines written; existing ones still get cleaned", async () => {
    const state = defaultState()
    state.allocations = { data: [], error: null }
    state.existingCostLines = {
      data: [
        {
          id: "old-cl-x",
          amount: 500,
          currency: "EUR",
          source_ref_id: "stale-allocation-id",
          source_metadata: {},
        },
      ],
      error: null,
    }
    const { client, deleteCalls, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(0)
    expect(insertCalls).toHaveLength(0)
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1)
    // One DELETE audit for the cleared row.
    expect(auditMock).toHaveBeenCalledTimes(1)
  })

  it("stakeholder without role_key: emits warning, no cost-line", async () => {
    const state = defaultState()
    state.stakeholders = {
      data: [{ id: STAKEHOLDER_ID, role_key: null }],
      error: null,
    }
    const { client, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(result.written).toBe(0)
    expect(insertCalls).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0].kind).toBe("no_role_key")
  })

  it("work_items load error: hadCostCalcError=true, no writes, no throw", async () => {
    const state = defaultState()
    state.workItem = { data: null, error: { message: "DB hiccup" } }
    const { client, insertCalls } = makeMockClient(state)
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(true)
    expect(result.written).toBe(0)
    expect(insertCalls).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("does NOT throw even on completely broken admin client", async () => {
    const broken = {
      from: () => {
        throw new Error("client init exploded")
      },
    } as unknown as SupabaseClient
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: broken,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(true)
    expect(result.written).toBe(0)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("missing tenant cost_settings: falls back to velocity 0.5 / EUR (default)", async () => {
    const state = defaultState()
    // tenant_settings row missing
    state.tenantSettings = { data: null, error: null }
    // story-point work-item to exercise velocity fallback.
    state.workItem = {
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 8 },
        created_at: "2026-04-01T10:00:00Z",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        is_deleted: false,
      },
      error: null,
    }
    state.insertResult = {
      data: [
        {
          id: "new-cl-sp",
          amount: 4000,
          currency: "EUR",
          source_ref_id: ALLOCATION_ID,
          source_metadata: { basis: "story_points" },
        },
      ],
      error: null,
    }
    const { client, insertCalls } = makeMockClient(state)

    const result = await synthesizeResourceAllocationCostLines({
      adminClient: client,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      workItemId: WORK_ITEM_ID,
      actorUserId: USER_ID,
    })

    expect(result.hadCostCalcError).toBe(false)
    expect(insertCalls).toHaveLength(1)
    const payload = insertCalls[0] as Array<Record<string, unknown>>
    // 8 SP × 0.5 velocity × 100% × 1000 EUR = 4000 EUR
    expect(payload[0].amount).toBe(4000)
    expect(payload[0].currency).toBe("EUR")
  })
})
