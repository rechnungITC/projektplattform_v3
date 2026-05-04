/**
 * PROJ-32a — QA verification: Class-3 routing through the full router.
 *
 * These tests assert the *integrated* router behavior (not just the
 * key-resolver in isolation) for the new contract:
 *
 *   - tenant config = anthropic, no tenant key, Class-3 → blocked (stub)
 *   - tenant config = anthropic, tenant key, Class-3   → external (anthropic)
 *   - tenant config = anthropic, no tenant key, Class-1 → platform fallback
 *   - tenant config = none, Class-3                    → external_blocked=true
 *
 * The Anthropic SDK call is intercepted by stubbing `generateObject` so no
 * real network call happens.
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

import { invokeRiskGeneration } from "./router"
import type { RiskAutoContext } from "./types"

interface ChainResult {
  data: unknown
  error: { message: string } | null
}

function buildSupabase(opts: {
  tenantSettings: Record<string, unknown> | null
  decryptResult: ChainResult
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

  let kiRunsCallCount = 0
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "set_session_encryption_key") {
        return { data: null, error: null }
      }
      if (fn === "decrypt_tenant_ai_key") {
        return opts.decryptResult
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: vi.fn((table: string) => {
      if (table === "ki_runs") {
        kiRunsCallCount++
        return kiRunsCallCount === 1 ? insertRunChain : updateChain
      }
      if (table === "ki_suggestions") return insertSuggestionsChain
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

describe("PROJ-32a router integration — Class-3 hard block via tenant key", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-x"
    delete process.env.EXTERNAL_AI_DISABLED
    generateObjectMock.mockReset()
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it("Class-3 + tenant config 'anthropic' + NO tenant key → blocked, stub provider", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      decryptResult: { data: null, error: null },
      insertRunResult: { data: { id: "run-c3" }, error: null },
    })
    const result = await invokeRiskGeneration({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: class3Context(),
      count: 2,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    // Anthropic SDK must NOT have been called
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it("Class-3 + tenant config 'anthropic' + tenant key set → tenant source (anthropic)", async () => {
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 3 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      decryptResult: { data: "sk-ant-tenant-key", error: null },
      insertRunResult: { data: { id: "run-c3-ok" }, error: null },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: class3Context(),
      count: 2,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("anthropic")
    expect(result.external_blocked).toBe(false)
    expect(result.status).toBe("success")
    // Anthropic SDK was actually called
    expect(generateObjectMock).toHaveBeenCalledOnce()
  })

  it("Class-1 + tenant config 'anthropic' + no tenant key → platform fallback", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform-key-xxxxxxxxxxxxxxxxxxxxxxxxxx"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      decryptResult: { data: null, error: null },
      insertRunResult: { data: { id: "run-c1" }, error: null },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
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
      decryptResult: { data: null, error: null },
      insertRunResult: { data: { id: "run-none-c3" }, error: null },
    })
    const result = await invokeRiskGeneration({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: class3Context(),
      count: 1,
    })
    expect(result.classification).toBe(3)
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
  })

  it("EXTERNAL_AI_DISABLED kill-switch → blocked even with tenant key", async () => {
    process.env.EXTERNAL_AI_DISABLED = "true"
    const supabase = buildSupabase({
      tenantSettings: {
        privacy_defaults: { default_class: 1 },
        ai_provider_config: { external_provider: "anthropic" },
      },
      decryptResult: { data: "sk-ant-tenant-key", error: null },
      insertRunResult: { data: { id: "run-killed" }, error: null },
    })
    const result = await invokeRiskGeneration({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      tenantId: "00000000-0000-4000-8000-000000000001",
      projectId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000003",
      context: class1Context(),
      count: 1,
    })
    expect(result.provider).toBe("stub")
    expect(result.external_blocked).toBe(true)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })
})
