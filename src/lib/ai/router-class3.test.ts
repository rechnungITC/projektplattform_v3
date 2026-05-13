/**
 * PROJ-32 — QA verification: integrated router behavior across 32a + 32-c-β.
 *
 * After 32-c-β:
 *   * Resolver reads from `tenant_ai_providers` via the new RPC
 *     `decrypt_tenant_ai_provider` (returns provider-specific JSONB).
 *   * Class-3 routing accepts ONLY local providers (Ollama). Anthropic is
 *     never Class-3-eligible — even with a tenant key, because data still
 *     leaves the tenant control domain.
 *
 * Scenarios covered:
 *   1. Class-3 + tenant Anthropic only → BLOCKED (Anthropic clamped out)
 *   2. Class-3 + tenant Ollama → tenant source (Ollama)
 *   3. Class-1 + tenant Anthropic → tenant source (Anthropic)
 *   4. Class-1 + no tenant providers → platform fallback
 *   5. tenant config 'none' + Class-3 → externalBlocked=true preserved
 *   6. EXTERNAL_AI_DISABLED kill-switch → blocked even with tenant Ollama
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

function buildSupabase(opts: {
  tenantSettings: Record<string, unknown> | null
  /** Anthropic provider config (decrypted). Default: not configured. */
  anthropicDecrypt?: ChainResult
  /** Ollama provider config (decrypted). Default: not configured. */
  ollamaDecrypt?: ChainResult
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

  // Status read for tenant_ai_providers — RLS denies non-admin.
  const providerStatusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  let kiRunsCallCount = 0
  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "set_session_encryption_key") {
        return { data: null, error: null }
      }
      if (fn === "decrypt_tenant_ai_provider") {
        if (args?.p_provider === "anthropic") {
          return opts.anthropicDecrypt ?? { data: null, error: null }
        }
        if (args?.p_provider === "ollama") {
          return opts.ollamaDecrypt ?? { data: null, error: null }
        }
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
      if (table === "tenant_ai_cost_caps") {
        // 32-d cost-cap config — no caps configured. ε.β added the
        // `.is("purpose", null)` step for purpose-aware lookups.
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
      if (table === "tenant_ai_provider_priority") {
        // 32-c-γ: priority matrix lookup. Return no rules so the resolver
        // falls back to defaultProviderOrder() which encodes the SaaS-mandate.
        const chain: { select: unknown; eq: unknown } = {
          select: () => chain,
          eq: async () => ({ data: [], error: null }),
        }
        return chain
      }
      if (table === "tenant_settings") {
        const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: opts.tenantSettings,
            error: null,
          }),
        }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
}

function class3Context(): RiskAutoContext {
  // Inject a Class-3 field via cast (mirrors the existing
  // router.test.ts "defense in depth" pattern). projects.responsible_user_id
  // has class=3 in the registry; auto-context allowlist normally excludes
  // it. This forces the classifier to bump to 3.
  const ctx: RiskAutoContext = {
    project: {
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "scrum",
      lifecycle_status: "active",
      planned_start_date: null,
      planned_end_date: null,
    },
    phases: [],
    milestones: [],
    work_items: [],
    existing_risks: [],
  }
  ;(ctx.project as unknown as Record<string, unknown>).responsible_user_id =
    "00000000-0000-4000-8000-000000000099"
  return ctx
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

const ANTHROPIC_CONFIG = { data: { api_key: "sk-ant-tenant" }, error: null }
const OLLAMA_CONFIG = {
  data: {
    endpoint_url: "https://ollama.example.com",
    model_id: "llama3.1:70b",
  },
  error: null,
}
const EMPTY_DECRYPT = { data: null, error: null }

const COMMON_ARGS = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
}

describe("PROJ-32 router integration — Class-3 hard block via tenant key", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-x"
    delete process.env.EXTERNAL_AI_DISABLED
    generateObjectMock.mockReset()
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it("Class-3 + tenant Anthropic only → BLOCKED (Anthropic not Class-3-eligible)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: ANTHROPIC_CONFIG,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-c3-anthropic-blocked" }, error: null },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class3Context(),
      count: 1,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it("Class-3 + tenant Ollama → tenant source (Ollama)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: EMPTY_DECRYPT,
      ollamaDecrypt: OLLAMA_CONFIG,
      insertRunResult: { data: { id: "run-c3-ollama" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "s-1" }],
        error: null,
      },
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            title: "T",
            description: "D",
            probability: 3,
            impact: 3,
            mitigation: "M",
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class3Context(),
      count: 1,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("ollama")
    // Critical: Ollama on tenant infra is NOT externalBlocked.
    expect(result.external_blocked).toBe(false)
    expect(result.status).toBe("success")
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("Class-1 + tenant Anthropic → tenant source (Anthropic)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: ANTHROPIC_CONFIG,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-c1-anthropic" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "s-1" }, { id: "s-2" }],
        error: null,
      },
    })
    generateObjectMock.mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            title: "T1",
            description: "D1",
            probability: 3,
            impact: 3,
            mitigation: "M1",
          },
          {
            title: "T2",
            description: "D2",
            probability: 2,
            impact: 4,
            mitigation: "M2",
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class1Context(),
      count: 2,
    })
    expect(result.provider).toBe("anthropic")
    expect(result.external_blocked).toBe(false)
    expect(result.status).toBe("success")
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("Class-1 + no tenant providers → platform fallback", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform-fallback"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: EMPTY_DECRYPT,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-c1-platform" }, error: null },
      insertSuggestionsResult: {
        data: [{ id: "s-1" }],
        error: null,
      },
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
      ...COMMON_ARGS,
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("anthropic")
    expect(result.external_blocked).toBe(false)
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("tenant config 'none' + Class-3 → external_blocked=true (preserved semantics)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "none" },
      },
      anthropicDecrypt: EMPTY_DECRYPT,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-none-c3" }, error: null },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class3Context(),
      count: 1,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
  })

  it("EXTERNAL_AI_DISABLED kill-switch → blocked even with tenant Ollama", async () => {
    process.env.EXTERNAL_AI_DISABLED = "true"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      anthropicDecrypt: EMPTY_DECRYPT,
      ollamaDecrypt: OLLAMA_CONFIG,
      insertRunResult: { data: { id: "run-killed" }, error: null },
    })
    const result = await invokeRiskGeneration({
       
      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class3Context(),
      count: 1,
    })
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })
})
