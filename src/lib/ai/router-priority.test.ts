/**
 * PROJ-32-c-γ — QA: priority-driven routing through the full router.
 *
 * Verifies that `getPriorityMatrix` rules actually take effect:
 *   - A rule overrides the hardcoded default
 *   - "Ollama for everything" override routes a Class-1/2 call to Ollama
 *   - A missing rule falls through to defaultProviderOrder()
 *   - First provider in priority skipped if invalid → falls to next entry
 *   - Priority lookup error falls through to defaults
 *
 * Note: `class1Context` actually classifies to Class-2 because
 * `projects.planned_start_date` is registered as Class-2 in the registry.
 * The tests use `data_class: 2` rules to match this real classification.
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

import { invokeRiskGeneration } from "./router"
import type { RiskAutoContext } from "./types"

interface ChainResult {
  data: unknown
  error: { message: string } | null
}

interface PriorityRow {
  purpose: string
  data_class: number
  provider_order: string[]
}

function buildSupabase(opts: {
  tenantSettings: Record<string, unknown> | null
  anthropicDecrypt?: ChainResult
  ollamaDecrypt?: ChainResult
  priorityRows: PriorityRow[]
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
      opts.insertSuggestionsResult ?? { data: [], error: null },
    ),
  }
  const providerStatusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  // Awaitable thenable for the priority bulk-fetch
  const priorityChain = {
    select: vi.fn(() => priorityChain),
    eq: vi.fn(() => priorityChain),
    then(resolve: (value: { data: PriorityRow[]; error: null }) => void) {
      resolve({ data: opts.priorityRows, error: null })
    },
  }

  let kiRunsCallCount = 0
  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "set_session_encryption_key")
        return { data: null, error: null }
      if (fn === "decrypt_tenant_ai_provider") {
        if (args?.p_provider === "anthropic")
          return opts.anthropicDecrypt ?? { data: null, error: null }
        if (args?.p_provider === "ollama")
          return opts.ollamaDecrypt ?? { data: null, error: null }
        return { data: null, error: null }
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
      if (table === "tenant_ai_cost_caps") {
        const chain: {
          select: unknown
          eq: unknown
          is: unknown
          maybeSingle: unknown
        } = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        }
        return chain
      }
      if (table === "tenant_settings") {
        const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: opts.tenantSettings, error: null }),
        }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
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
const OLLAMA = {
  data: {
    endpoint_url: "https://ollama.example.com",
    model_id: "llama3.1:70b",
  },
  error: null,
}
const EMPTY = { data: null, error: null }

const COMMON = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
}

describe("PROJ-32-c-γ priority-driven routing", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-key-32-chars-long-padding-x"
    delete process.env.EXTERNAL_AI_DISABLED
    delete process.env.ANTHROPIC_API_KEY
    generateObjectMock.mockReset()
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
  })

  it("priority rule overrides the default — Class-2 risks → ollama only", async () => {
    // Default for Class-2 + both providers = [anthropic, ollama]
    // Override: ['ollama'] only → must skip Anthropic entirely.
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: ANTHROPIC,
      ollamaDecrypt: OLLAMA,
      priorityRows: [
        { purpose: "risks", data_class: 2, provider_order: ["ollama"] },
      ],
      insertRunResult: { data: { id: "run-priority-ollama" }, error: null },
      insertSuggestionsResult: { data: [{ id: "s-1" }], error: null },
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          { title: "T", description: "D", probability: 1, impact: 1, mitigation: "M" },
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
    expect(result.provider).toBe("ollama")
    expect(result.external_blocked).toBe(false)
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("missing rule falls through to default — Class-1 → anthropic preferred", async () => {
    // No priority rule for (risks, 1) → resolver uses default order.
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: ANTHROPIC,
      ollamaDecrypt: OLLAMA,
      priorityRows: [
        // Rule for narrative+class3 only — irrelevant to our risks call
        { purpose: "narrative", data_class: 3, provider_order: ["ollama"] },
      ],
      insertRunResult: { data: { id: "run-default" }, error: null },
      insertSuggestionsResult: { data: [{ id: "s-1" }], error: null },
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          { title: "T", description: "D", probability: 1, impact: 1, mitigation: "M" },
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
  })

  it("Ollama-only preset routes Class-1/2 via Ollama (no anthropic)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: ANTHROPIC,
      ollamaDecrypt: OLLAMA,
      priorityRows: [
        { purpose: "risks", data_class: 1, provider_order: ["ollama"] },
        { purpose: "risks", data_class: 2, provider_order: ["ollama"] },
        { purpose: "risks", data_class: 3, provider_order: ["ollama"] },
      ],
      insertRunResult: { data: { id: "run-ollama-everywhere" }, error: null },
      insertSuggestionsResult: { data: [{ id: "s-1" }], error: null },
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          { title: "T", description: "D", probability: 1, impact: 1, mitigation: "M" },
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
    expect(result.provider).toBe("ollama")
  })

  it("first provider in priority skipped if invalid — falls to next entry", async () => {
    // Priority: [anthropic, ollama] but Anthropic status is 'invalid' →
    // resolver MUST skip anthropic and pick ollama.
    // Returns 'invalid' for Anthropic, null for Ollama.
    const statusByProvider = new Map<string, string>([["anthropic", "invalid"]])
    const providerStatusChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(function (
        this: typeof providerStatusChain,
        col: string,
        val: string,
      ) {
        if (col === "provider") {
          this._currentProvider = val
        }
        return this
      }),
      _currentProvider: "" as string,
      maybeSingle: vi.fn(async function (this: typeof providerStatusChain) {
        const v = statusByProvider.get(this._currentProvider) ?? null
        return { data: v ? { last_validation_status: v } : null, error: null }
      }),
    }

    const supabase = {
      rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
        if (fn === "set_session_encryption_key")
          return { data: null, error: null }
        if (fn === "decrypt_tenant_ai_provider") {
          if (args?.p_provider === "anthropic") return ANTHROPIC
          if (args?.p_provider === "ollama") return OLLAMA
          return { data: null, error: null }
        }
        throw new Error(`unexpected rpc ${fn}`)
      }),
      from: vi.fn((table: string) => {
        if (table === "ki_runs") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: "run-skip-invalid" }, error: null }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === "ki_suggestions")
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ id: "s-1" }], error: null }),
          }
        if (table === "tenant_ai_providers") return providerStatusChain
        if (table === "tenant_ai_cost_caps") {
          const c: {
            select: unknown
            eq: unknown
            is: unknown
            maybeSingle: unknown
          } = {
            select: () => c,
            eq: () => c,
            is: () => c,
            maybeSingle: async () => ({ data: null, error: null }),
          }
          return c
        }
        if (table === "tenant_ai_provider_priority") {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            then(resolve: (value: { data: PriorityRow[]; error: null }) => void) {
              resolve({
                data: [
                  {
                    purpose: "risks",
                    data_class: 2,
                    provider_order: ["anthropic", "ollama"],
                  },
                ],
                error: null,
              })
            },
          }
          return chain
        }
        if (table === "tenant_settings") {
          const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                privacy_defaults: { default_class: 1 },
                ai_provider_config: { external_provider: "anthropic" },
              },
              error: null,
            }),
          }
          return chain
        }
        throw new Error(`unexpected table ${table}`)
      }),
    }

    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          { title: "T", description: "D", probability: 1, impact: 1, mitigation: "M" },
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
    // Anthropic status is invalid → resolver picks the next entry (ollama)
    expect(result.provider).toBe("ollama")
    expect(result.external_blocked).toBe(false)
  })

  it("priority lookup error falls through to defaults gracefully", async () => {
    // Simulate the priority bulk-fetch erroring — resolver must NOT throw,
    // it must fall through to defaultProviderOrder().
    const errChain = {
      select: vi.fn(() => errChain),
      eq: vi.fn(() => errChain),
      then(resolve: (value: { data: null; error: { message: string } }) => void) {
        resolve({ data: null, error: { message: "simulated DB error" } })
      },
    }

    const supabase = {
      rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
        if (fn === "set_session_encryption_key")
          return { data: null, error: null }
        if (fn === "decrypt_tenant_ai_provider") {
          if (args?.p_provider === "anthropic") return ANTHROPIC
          if (args?.p_provider === "ollama") return EMPTY
          return EMPTY
        }
        throw new Error(`unexpected rpc ${fn}`)
      }),
      from: vi.fn((table: string) => {
        if (table === "ki_runs") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: "run-fallthrough" }, error: null }),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === "ki_suggestions")
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: [{ id: "s-1" }], error: null }),
          }
        if (table === "tenant_ai_providers")
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        if (table === "tenant_ai_cost_caps") {
          const c: {
            select: unknown
            eq: unknown
            is: unknown
            maybeSingle: unknown
          } = {
            select: () => c,
            eq: () => c,
            is: () => c,
            maybeSingle: async () => ({ data: null, error: null }),
          }
          return c
        }
        if (table === "tenant_ai_provider_priority") return errChain
        if (table === "tenant_settings") {
          const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                privacy_defaults: { default_class: 1 },
                ai_provider_config: { external_provider: "anthropic" },
              },
              error: null,
            }),
          }
          return chain
        }
        throw new Error(`unexpected table ${table}`)
      }),
    }

    // Suppress the expected console.error from the resolver.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
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
      // Fallthrough: default order for Class-1 + anthropic available = anthropic first.
      expect(result.provider).toBe("anthropic")
      expect(result.external_blocked).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
