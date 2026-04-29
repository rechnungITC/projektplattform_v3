import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { invokeRiskGeneration } from "./router"
import type { RiskAutoContext } from "./types"

interface ChainResult {
  data: unknown
  error: { message: string } | null
}

function buildSupabaseMock(opts: {
  insertRunResult: ChainResult
  insertSuggestionsResult?: ChainResult
}) {
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const insertRunChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(opts.insertRunResult),
  }
  const insertSuggestionsChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(
      opts.insertSuggestionsResult ?? { data: [], error: null }
    ),
  }

  let kiRunsCallCount = 0
  return {
    from: vi.fn((table: string) => {
      if (table === "ki_runs") {
        kiRunsCallCount++
        return kiRunsCallCount === 1 ? insertRunChain : updateChain
      }
      if (table === "ki_suggestions") {
        return insertSuggestionsChain
      }
      throw new Error(`unexpected table ${table}`)
    }),
    _insertRunChain: insertRunChain,
    _insertSuggestionsChain: insertSuggestionsChain,
    _updateChain: updateChain,
  }
}

function baseContext(): RiskAutoContext {
  return {
    project: {
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "scrum",
      lifecycle_status: "active",
      planned_start_date: "2026-04-01",
      planned_end_date: "2026-12-31",
    },
    phases: [],
    milestones: [],
    work_items: [],
    existing_risks: [],
  }
}

describe("invokeRiskGeneration", () => {
  let originalApiKey: string | undefined
  let originalAiBlock: string | undefined

  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalAiBlock = process.env.EXTERNAL_AI_DISABLED
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.EXTERNAL_AI_DISABLED
  })
  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalApiKey
    if (originalAiBlock === undefined) delete process.env.EXTERNAL_AI_DISABLED
    else process.env.EXTERNAL_AI_DISABLED = originalAiBlock
  })

  it("falls back to stub provider when ANTHROPIC_API_KEY is missing (status='success')", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: { data: { id: "run-1" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "sug-1" }, { id: "sug-2" }],
        error: null,
      },
    })

    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseContext(),
      count: 2,
    })

    expect(result.provider).toBe("stub")
    expect(result.status).toBe("success")
    expect(result.external_blocked).toBe(false)
    expect(result.suggestion_ids).toHaveLength(2)
  })

  it("logs status='external_blocked' when EXTERNAL_AI_DISABLED is true", async () => {
    process.env.EXTERNAL_AI_DISABLED = "true"
    process.env.ANTHROPIC_API_KEY = "sk-fake" // would otherwise pick anthropic

    const supabase = buildSupabaseMock({
      insertRunResult: { data: { id: "run-2" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "sug-1" }],
        error: null,
      },
    })

    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseContext(),
      count: 1,
    })

    expect(result.provider).toBe("stub")
    expect(result.status).toBe("external_blocked")
    expect(result.external_blocked).toBe(true)
  })

  it("logs status='external_blocked' when classification is 3 (defense in depth)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake"
    const ctx = baseContext()
    // Inject a Class-3 field via a cast — simulates a future leak in the
    // auto-context allowlist.
    ;(ctx.project as unknown as Record<string, unknown>)["responsible_user_id"] =
      "00000000-0000-4000-8000-000000000099"

    const supabase = buildSupabaseMock({
      insertRunResult: { data: { id: "run-3" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "sug-1" }],
        error: null,
      },
    })

    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: ctx,
      count: 1,
    })

    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.status).toBe("external_blocked")
  })

  it("returns status='error' when ki_runs insert fails", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: null,
        error: { message: "RLS denied" },
      },
    })

    await expect(
      invokeRiskGeneration({
         
        supabase: supabase as any,
        tenantId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        actorUserId: "00000000-0000-4000-8000-000000000003",
        context: baseContext(),
        count: 1,
      })
    ).rejects.toThrow(/ki_runs insert failed/)
  })
})
