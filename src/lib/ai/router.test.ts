import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  invokeNarrativeGeneration,
  invokeRiskGeneration,
  invokeSentimentGeneration,
} from "./router"
import type {
  NarrativeAutoContext,
  RiskAutoContext,
  SentimentAutoContext,
} from "./types"

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
      if (table === "tenant_settings") {
        // Empty settings => router uses defaults (no tenant override).
        const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        }
        return chain
      }
      if (table === "tenant_ai_cost_caps") {
        // 32-d cost-cap config — no caps configured.
        const c: { select: unknown; eq: unknown; maybeSingle: unknown } = {
          select: () => c,
          eq: () => c,
          maybeSingle: async () => ({ data: null, error: null }),
        }
        return c
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

// ---------------------------------------------------------------------------
// PROJ-30 — invokeNarrativeGeneration tests
// ---------------------------------------------------------------------------

function baseNarrativeRouterContext(): NarrativeAutoContext {
  return {
    kind: "status_report",
    project: {
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "waterfall",
      lifecycle_status: "active",
      planned_start_date: "2026-04-01",
      planned_end_date: "2026-12-31",
    },
    phases_summary: { total: 3, by_status: { active: 1, planned: 2 } },
    top_risks: [],
    top_decisions: [],
    upcoming_milestones: [],
    backlog_counts: { by_kind: {}, by_status: {} },
  }
}

describe("invokeNarrativeGeneration", () => {
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

  it("happy path with stub provider returns templated narrative", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: { id: "run-narrative-1" },
        error: null,
      },
    })

    const result = await invokeNarrativeGeneration({

      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseNarrativeRouterContext(),
    })

    expect(result.run_id).toBe("run-narrative-1")
    expect(result.provider).toBe("stub")
    expect(result.text.length).toBeGreaterThan(20)
    expect(result.status).toBe("success")
    expect(result.external_blocked).toBe(false)
  })

  it("never writes to ki_suggestions (narrative is transient)", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: { id: "run-narrative-2" },
        error: null,
      },
    })

    await invokeNarrativeGeneration({

      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseNarrativeRouterContext(),
    })

    // ki_suggestions chain insert should never have been called.
    expect(
      (supabase as ReturnType<typeof buildSupabaseMock>)._insertSuggestionsChain
        .insert,
    ).not.toHaveBeenCalled()
  })

  it("Class-3 context produces stub fallback (defense-in-depth)", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: { id: "run-narrative-3" },
        error: null,
      },
    })

    // Inject a Class-3 indicator that the whitelist classifier flips.
    const ctx = baseNarrativeRouterContext() as NarrativeAutoContext & {
      lead_name?: string
    }
    ctx.lead_name = "Anna Beispiel"

    const result = await invokeNarrativeGeneration({

      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: ctx,
    })

    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    expect(result.text.length).toBeGreaterThan(20)
  })

  it("returns status='error' when ki_runs insert fails", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: null,
        error: { message: "RLS denied" },
      },
    })

    await expect(
      invokeNarrativeGeneration({

        supabase: supabase as any,
        tenantId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        actorUserId: "00000000-0000-4000-8000-000000000003",
        context: baseNarrativeRouterContext(),
      }),
    ).rejects.toThrow(/ki_runs insert failed/)
  })

  it("uses purpose='narrative' on the ki_runs insert payload", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: { id: "run-narrative-4" },
        error: null,
      },
    })

    await invokeNarrativeGeneration({

      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseNarrativeRouterContext(),
    })

    const insertCall = (
      supabase as ReturnType<typeof buildSupabaseMock>
    )._insertRunChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertCall?.purpose).toBe("narrative")
  })
})

// ---------------------------------------------------------------------------
// PROJ-34-γ.1 — invokeSentimentGeneration tests
// ---------------------------------------------------------------------------

function baseSentimentContext(): SentimentAutoContext {
  return {
    summary:
      "Stakeholder X war zurückhaltend, hat aber konstruktive Vorschläge gemacht.",
    participants: [
      { stakeholder_id: "11111111-1111-4111-8111-aaaaaaaaaaaa", label: "X" },
      { stakeholder_id: "11111111-1111-4111-8111-bbbbbbbbbbbb", label: "Y" },
    ],
  }
}

describe("invokeSentimentGeneration", () => {
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

  it("returns one neutral signal per participant via stub provider", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: {
        data: { id: "run-sentiment-1" },
        error: null,
      },
    })

    const result = await invokeSentimentGeneration({
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseSentimentContext(),
    })

    expect(result.run_id).toBe("run-sentiment-1")
    expect(result.provider).toBe("stub")
    expect(result.signals).toHaveLength(2)
    expect(result.signals[0].sentiment).toBe(0)
    expect(result.signals[0].cooperation_signal).toBe(0)
    expect(result.signals.map((s) => s.stakeholder_id).sort()).toEqual([
      "11111111-1111-4111-8111-aaaaaaaaaaaa",
      "11111111-1111-4111-8111-bbbbbbbbbbbb",
    ])
    // Class-3 forces local routing — when the test tenant has no own
    // provider keys, the router falls back to the Stub and flags
    // external_blocked so callers can surface that to the user. The
    // call still completes and the signals are populated.
    expect(["success", "external_blocked"]).toContain(result.status)
    expect(result.external_blocked).toBe(true)
  })

  it("always classifies as Class-3 (CIA-L1 lock)", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: { data: { id: "run-sentiment-2" }, error: null },
    })

    const result = await invokeSentimentGeneration({
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: {
        summary: "Komplett harmloser Text ohne Personenbezug.",
        participants: [],
      },
    })

    expect(result.classification).toBe(3)
  })

  it("persists ki_runs purpose='sentiment'", async () => {
    const supabase = buildSupabaseMock({
      insertRunResult: { data: { id: "run-sentiment-3" }, error: null },
    })

    await invokeSentimentGeneration({
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: baseSentimentContext(),
    })

    const insertCall = (
      supabase as ReturnType<typeof buildSupabaseMock>
    )._insertRunChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertCall?.purpose).toBe("sentiment")
  })
})
