import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-96 (AC1) — GET /api/ma-project-templates (tenant-scoped catalog).
const { getUserMock, rpcMock, resolveTenantMock, fromMock, results } =
  vi.hoisted(() => {
    const results: Record<string, { data: unknown; error: unknown }> = {}
    // Thenable query-chain: select/order/in/limit return the chain; awaiting
    // the chain resolves to the preset { data, error } for that table.
    const chainFor = (result: { data: unknown; error: unknown }) => {
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "order", "in", "limit"]) {
        chain[m] = vi.fn().mockReturnValue(chain)
      }
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    }
    return {
      getUserMock: vi.fn(),
      rpcMock: vi.fn(),
      resolveTenantMock: vi.fn(),
      results,
      fromMock: vi.fn((table: string) =>
        chainFor(results[table] ?? { data: [], error: null })
      ),
    }
  })

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))
vi.mock("../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))

import { GET } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TENANT = "11111111-1111-4111-8111-111111111111"
const TPL = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"

beforeEach(() => {
  getUserMock.mockReset()
  rpcMock.mockReset()
  resolveTenantMock.mockReset()
  fromMock.mockClear()
  for (const k of Object.keys(results)) delete results[k]
  rpcMock.mockResolvedValue({ data: 0, error: null })
})

describe("GET /api/ma-project-templates", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 when the caller has no tenant membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("200 lazy-seeds then lists templates with nested children", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(TENANT)
    results["ma_project_templates"] = {
      data: [{ id: TPL, tenant_id: TENANT, name: "Buy-Side M&A (Standard)" }],
      error: null,
    }
    results["ma_template_workstreams"] = {
      data: [{ id: "w1", template_id: TPL, workstream_key: "financial" }],
      error: null,
    }
    results["ma_template_deliverables"] = {
      data: [{ id: "d1", template_id: TPL, workstream_key: "financial" }],
      error: null,
    }
    // PROJ-Y-96e — the third kind-table is loaded in the same Promise.all.
    results["ma_template_tasks"] = {
      data: [
        {
          id: "t1",
          template_id: TPL,
          task_key: "financial_kickoff",
          target_kind: "task",
          workstream_key: "financial",
        },
        {
          id: "t2",
          template_id: TPL,
          task_key: "financial_qoe_prep",
          target_kind: "subtask",
          workstream_key: "financial",
          parent_task_key: "financial_qoe",
        },
      ],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      templates: Array<{
        workstreams: unknown[]
        deliverables: unknown[]
        tasks: unknown[]
      }>
    }
    expect(body.templates).toHaveLength(1)
    expect(body.templates[0].workstreams).toHaveLength(1)
    expect(body.templates[0].deliverables).toHaveLength(1)
    expect(body.templates[0].tasks).toHaveLength(2)
    expect(rpcMock).toHaveBeenCalledWith("ensure_default_ma_project_templates", {
      p_tenant_id: TENANT,
    })
  })

  // PROJ-Y-96e — a real error loading tasks must not masquerade as empty tasks.
  it("500 list_failed when ma_template_tasks select errors", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(TENANT)
    results["ma_project_templates"] = {
      data: [{ id: TPL, tenant_id: TENANT }],
      error: null,
    }
    results["ma_template_tasks"] = {
      data: null,
      error: { code: "42P01", message: "relation missing" },
    }
    const res = await GET()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("list_failed")
  })

  it("200 returns empty list when no templates exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(TENANT)
    results["ma_project_templates"] = { data: [], error: null }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { templates: unknown[] }
    expect(body.templates).toHaveLength(0)
  })

  // PROJ-141-γ7 (L-1) — a real seed DB error must not masquerade as an empty catalog.
  it("500 seed_failed when ensure_default errors with a real DB error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(TENANT)
    rpcMock.mockResolvedValue({ data: null, error: { code: "42P01", message: "boom" } })
    const res = await GET()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("seed_failed")
  })

  it("200 still lists when seed errors with 42501 (membership race, non-blocking)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(TENANT)
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "not a member" } })
    results["ma_project_templates"] = { data: [], error: null }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { templates: unknown[] }
    expect(body.templates).toHaveLength(0)
  })
})
