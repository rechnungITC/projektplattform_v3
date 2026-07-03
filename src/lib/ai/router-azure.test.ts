/**
 * PROJ-92 — router integration for the Azure OpenAI provider.
 *
 * Proves both directions of the invariant at the routing layer:
 *   1. Class-1 + tenant Azure configured  → provider = 'azure' (selected,
 *      generateObject called, not blocked).  [AC-92.3 / AC-92.7 shape]
 *   2. Class-3 + tenant Azure ONLY         → BLOCKED. Azure is cloud, so
 *      clampForClass3 + defaultProviderOrder(3) remove it; no cloud call.
 *      provider = 'stub', external_blocked = true.  [AC-92.4 structural]
 *
 * Mirrors the router-class3.test.ts mocking approach.
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

// Azure + Ollama both go through the openai-compatible factory.
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
  azureDecrypt?: ChainResult
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
  const providerStatusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  let kiRunsCallCount = 0
  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "set_session_encryption_key") return { data: null, error: null }
      if (fn === "decrypt_tenant_ai_provider_with_key") {
        if (args?.p_provider === "azure") {
          return opts.azureDecrypt ?? { data: null, error: null }
        }
        if (args?.p_provider === "ollama") {
          return opts.ollamaDecrypt ?? { data: null, error: null }
        }
        return { data: null, error: null }
      }
      if (fn === "tenant_has_class3_trusted_processor") {
        // PROJ-93: no DPA attest in these scenarios → false (Azure stays
        // Class-3-blocked, preserving the pre-PROJ-93 clamp assertions).
        return { data: false, error: null }
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
          maybeSingle: async () => ({ data: opts.tenantSettings, error: null }),
        }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
}

const AZURE_CONFIG = {
  data: {
    endpoint_url: "https://res.openai.azure.com",
    deployment_name: "gpt-4o",
    api_key: "az-secret-key-1234567890",
    api_version: "2024-10-21",
    azure_region: "westeurope",
  },
  error: null,
}
const EMPTY_DECRYPT = { data: null, error: null }

const COMMON_ARGS = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
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

function class3Context(): RiskAutoContext {
  const ctx = class1Context()
  // Inject a Class-3 field (registry class=3) to force classification to 3.
  ;(ctx.project as unknown as Record<string, unknown>).responsible_user_id =
    "00000000-0000-4000-8000-000000000099"
  return ctx
}

describe("PROJ-92 — Azure provider routing", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-x"
    delete process.env.EXTERNAL_AI_DISABLED
    generateObjectMock.mockReset()
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it("Class-1 + tenant Azure → provider 'azure', not blocked, cloud call made", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        suggestions: [
          {
            title: "Integrationsrisiko Altsystem",
            description: "Schnittstellen zum Altsystem sind unklar.",
            probability: 3,
            impact: 4,
            mitigation: "Frühzeitig ein Schnittstellen-Assessment beauftragen.",
          },
        ],
      },
      usage: { inputTokens: 120, outputTokens: 40 },
    })
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "azure" },
      },
      azureDecrypt: AZURE_CONFIG,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-azure-c1" }, error: null },
    })
    const result = await invokeRiskGeneration({

      supabase: supabase as any,
      ...COMMON_ARGS,
      context: class1Context(),
      count: 1,
    })
    expect(result.classification).not.toBe(3)
    expect(result.provider).toBe("azure")
    expect(result.external_blocked).toBe(false)
    expect(generateObjectMock).toHaveBeenCalledTimes(1)
  })

  it("Class-3 + tenant Azure ONLY → BLOCKED (Azure clamped out, no cloud call)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "azure" },
      },
      azureDecrypt: AZURE_CONFIG,
      ollamaDecrypt: EMPTY_DECRYPT,
      insertRunResult: { data: { id: "run-azure-c3-blocked" }, error: null },
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
})
