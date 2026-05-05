/**
 * PROJ-32-d — router cost-cap integration test.
 *
 * Verifies that an over-cap tenant gets routed to the StubProvider with
 * external_blocked=true and that error_message carries the cap detail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const generateObjectMock = vi.fn()
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}))
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({})),
  createAnthropic: vi.fn(() => vi.fn(() => ({}))),
}))
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => vi.fn(() => ({}))),
}))
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => ({})),
  createOpenAI: vi.fn(() => vi.fn(() => ({}))),
}))
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({})),
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))),
}))

import { invokeRiskGeneration } from "./router"
import type { RiskAutoContext } from "./types"

interface ChainResult {
  data: unknown
  error: { message: string } | null
}

function class1Context(): RiskAutoContext {
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

const ANTHROPIC = { data: { api_key: "sk-ant-test" }, error: null }

function buildSupabase(opts: {
  insertRunResult: ChainResult
  capRow: {
    monthly_input_token_cap: number | null
    monthly_output_token_cap: number | null
    cap_action: "block" | "warn_only"
  } | null
  monthlyUsage: Array<{
    provider: string
    input_tokens: number
    output_tokens: number
    call_count: number
  }>
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
    select: vi
      .fn()
      .mockResolvedValue({ data: [{ id: "s-1" }], error: null }),
  }
  const providerStatusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const priorityChain = {
    select: vi.fn(() => priorityChain),
    eq: vi.fn(() => priorityChain),
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: [], error: null })
    },
  }
  const capChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.capRow,
      error: null,
    }),
  }

  let kiRunsCallCount = 0
  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "set_session_encryption_key") return { data: null, error: null }
      if (fn === "decrypt_tenant_ai_provider") {
        if (args?.p_provider === "anthropic") return ANTHROPIC
        return { data: null, error: null }
      }
      if (fn === "tenant_ai_monthly_usage") {
        return { data: opts.monthlyUsage, error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: vi.fn((table: string) => {
      if (table === "ki_runs") {
        kiRunsCallCount++
        return kiRunsCallCount === 1 ? insertRunChain : updateChain
      }
      if (table === "ki_suggestions") return insertSuggestionsChain
      if (table === "tenant_ai_providers") return providerStatusChain
      if (table === "tenant_ai_provider_priority") return priorityChain
      if (table === "tenant_ai_cost_caps") return capChain
      if (table === "tenant_settings") {
        const c: { select: unknown; eq: unknown; maybeSingle: unknown } = {
          select: () => c,
          eq: () => c,
          maybeSingle: async () => ({
            data: {
              privacy_defaults: { default_class: 1 },
              ai_provider_config: { external_provider: "anthropic" },
            },
            error: null,
          }),
        }
        return c
      }
      throw new Error(`unexpected table ${table}`)
    }),
    /** the spy for assertion access */
    _updateChain: updateChain,
  }
}

const COMMON = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
}

describe("PROJ-32-d router cost-cap gate", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-key"
    delete process.env.EXTERNAL_AI_DISABLED
    delete process.env.ANTHROPIC_API_KEY
    generateObjectMock.mockReset()
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
  })

  it("over cap + cap_action='block' → routes to StubProvider, external_blocked=true, detail in error_message", async () => {
    const supabase = buildSupabase({
      insertRunResult: { data: { id: "run-cap-blocked" }, error: null },
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      monthlyUsage: [
        {
          provider: "anthropic",
          input_tokens: 1500,
          output_tokens: 0,
          call_count: 5,
        },
      ],
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON,
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    expect(result.error_message).toContain("Monthly token cap exceeded")
    expect(result.error_message).toContain("input 1500 / cap 1000")
    // Anthropic SDK must NOT have been called
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it("over cap + cap_action='warn_only' → call still happens, error_message has WARN prefix", async () => {
    const supabase = buildSupabase({
      insertRunResult: { data: { id: "run-cap-warn" }, error: null },
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "warn_only",
      },
      monthlyUsage: [
        {
          provider: "anthropic",
          input_tokens: 1500,
          output_tokens: 0,
          call_count: 5,
        },
      ],
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            title: "T",
            description: "D",
            probability: 1,
            impact: 1,
            mitigation: "M",
          },
        ],
      },
      usage: { inputTokens: 50, outputTokens: 30 },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON,
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("anthropic")
    expect(result.external_blocked).toBe(false)
    expect(result.error_message).toMatch(/^WARN:/)
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("under cap → no block, no warning", async () => {
    const supabase = buildSupabase({
      insertRunResult: { data: { id: "run-cap-ok" }, error: null },
      capRow: {
        monthly_input_token_cap: 10000,
        monthly_output_token_cap: 10000,
        cap_action: "block",
      },
      monthlyUsage: [
        {
          provider: "anthropic",
          input_tokens: 1000,
          output_tokens: 500,
          call_count: 5,
        },
      ],
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            title: "T",
            description: "D",
            probability: 1,
            impact: 1,
            mitigation: "M",
          },
        ],
      },
      usage: { inputTokens: 50, outputTokens: 30 },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON,
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("anthropic")
    expect(result.external_blocked).toBe(false)
    expect(result.error_message).toBeUndefined()
  })

  it("StubProvider already chosen (no tenant config) → cap check is skipped", async () => {
    // No tenant providers AND a cap config that would normally trigger.
    // Since the chosen provider is Stub, the cap check is bypassed
    // (no external call to gate).
    const supabase = buildSupabase({
      insertRunResult: { data: { id: "run-stub-skipped" }, error: null },
      capRow: {
        monthly_input_token_cap: 1,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      monthlyUsage: [
        {
          provider: "anthropic",
          input_tokens: 1500,
          output_tokens: 0,
          call_count: 5,
        },
      ],
    })
    // Override the rpc to NOT return an Anthropic key — forces Stub.
     
    ;(supabase as any).rpc = vi.fn(async (fn: string) => {
      if (fn === "set_session_encryption_key") return { data: null, error: null }
      if (fn === "decrypt_tenant_ai_provider") return { data: null, error: null }
      if (fn === "tenant_ai_monthly_usage") {
        // This MUST NOT be called — the cost-cap gate is skipped for Stub.
        throw new Error("should-not-call-tenant_ai_monthly_usage")
      }
      throw new Error(`unexpected rpc ${fn}`)
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON,
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("stub")
    // No cap block — already routing to local stub. error_message is
    // undefined (no provider error, no cap detail).
    expect(result.error_message ?? "").not.toMatch(/Monthly token cap/)
  })
})
