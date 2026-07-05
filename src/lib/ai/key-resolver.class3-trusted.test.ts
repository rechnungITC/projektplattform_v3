/**
 * PROJ-93 — Trusted-EU-Processor: Class-3 resolver eligibility regression.
 *
 * The Class-3 gate is the authoritative one at request time (architecture-CIA
 * R-1). This suite drives `resolveProvider` directly and proves, data-driven
 * over dataClass=3:
 *   * no attest              → Ollama only, Azure clamped (blocked if no Ollama)
 *   * attest + EU region     → Azure Class-3-eligible
 *   * attest + NON-EU region → Azure clamped (region gate)
 *   * helper RPC error       → fail-closed (Azure not eligible)  [AC-93.11]
 *   * anthropic/openai/google→ NEVER Class-3-eligible             [AC-93.7]
 *   * resource_swap == proposal_stakeholders_from_context gate    [D5]
 *   * Class-1/2 unaffected by DPA + helper RPC not even called    [D5]
 *   * kill-switch overrides even attested Azure                   [AC-93.12]
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/operation-mode", () => ({
  isExternalAIBlocked: vi.fn(() => false),
}))

import { isExternalAIBlocked } from "@/lib/operation-mode"
import { resolveProvider } from "./key-resolver"
import type { AIPurpose, DataClass } from "./types"

const isExternalAIBlockedMock = vi.mocked(isExternalAIBlocked)

const TENANT = "11111111-1111-1111-1111-111111111111"

interface MockOpts {
  ollama?: boolean
  azure?: { region: string } | null
  anthropic?: boolean
  openai?: boolean
  google?: boolean
  trustedFlag?: boolean
  trustedError?: string
  priorityRules?: { purpose: string; data_class: number; provider_order: string[] }[]
}

function azureJsonb(region: string) {
  return {
    endpoint_url: "https://res.openai.azure.com",
    deployment_name: "gpt-4o",
    api_key: "azkey-abcdefghijklmnop",
    api_version: "2024-10-21",
    azure_region: region,
  }
}

function buildSupabaseMock(opts: MockOpts) {
  const statusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const priorityChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: opts.priorityRules ?? [], error: null }),
  }

  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "decrypt_tenant_ai_provider_with_key") {
        switch (args?.p_provider) {
          case "ollama":
            return opts.ollama
              ? { data: { endpoint_url: "http://ollama.local:11434", model_id: "qwen2.5:7b" }, error: null }
              : { data: null, error: null }
          case "azure":
            return opts.azure
              ? { data: azureJsonb(opts.azure.region), error: null }
              : { data: null, error: null }
          case "anthropic":
            return opts.anthropic ? { data: { api_key: "sk-ant-xxxxxxxxxxxx" }, error: null } : { data: null, error: null }
          case "openai":
            return opts.openai ? { data: { api_key: "sk-openai-xxxxxxxx" }, error: null } : { data: null, error: null }
          case "google":
            return opts.google ? { data: { api_key: "AIzaxxxxxxxxxxxx" }, error: null } : { data: null, error: null }
          default:
            return { data: null, error: null }
        }
      }
      if (fn === "tenant_has_class3_trusted_processor") {
        if (opts.trustedError) return { data: null, error: { message: opts.trustedError } }
        return { data: opts.trustedFlag === true, error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: vi.fn((table: string) => {
      if (table === "tenant_ai_provider_priority") return priorityChain
      return statusChain
    }),
  } as unknown as Parameters<typeof resolveProvider>[0]["supabase"]
}

function resolve(
  supabase: ReturnType<typeof buildSupabaseMock>,
  dataClass: DataClass,
  purpose: AIPurpose = "proposal_stakeholders_from_context",
) {
  return resolveProvider({ supabase, tenantId: TENANT, purpose, dataClass })
}

describe("PROJ-93 — Class-3 trusted-processor eligibility", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-xx"
    delete process.env.ANTHROPIC_API_KEY
    isExternalAIBlockedMock.mockReturnValue(false)
  })
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    vi.clearAllMocks()
  })

  it("no attest: Ollama serves Class-3; Azure is not eligible", async () => {
    const supabase = buildSupabaseMock({ ollama: true, azure: { region: "westeurope" }, trustedFlag: false })
    const r = await resolve(supabase, 3)
    expect(r).toMatchObject({ source: "tenant", provider: "ollama" })
  })

  it("no attest, no Ollama: Class-3 blocked (Azure clamped without attest)", async () => {
    const supabase = buildSupabaseMock({ azure: { region: "westeurope" }, trustedFlag: false })
    const r = await resolve(supabase, 3)
    expect(r).toEqual({ source: "blocked", reason: "class3_no_local_provider" })
  })

  it("attest + EU region, no Ollama: Azure IS Class-3-eligible", async () => {
    const supabase = buildSupabaseMock({ azure: { region: "germanywestcentral" }, trustedFlag: true })
    const r = await resolve(supabase, 3)
    expect(r).toMatchObject({ source: "tenant", provider: "azure" })
  })

  it("attest + EU region + explicit matrix rule [azure,ollama]: Azure chosen first", async () => {
    const supabase = buildSupabaseMock({
      ollama: true,
      azure: { region: "westeurope" },
      trustedFlag: true,
      priorityRules: [
        { purpose: "proposal_stakeholders_from_context", data_class: 3, provider_order: ["azure", "ollama"] },
      ],
    })
    const r = await resolve(supabase, 3)
    expect(r).toMatchObject({ source: "tenant", provider: "azure" })
  })

  it("attest + NON-EU region, no Ollama: Azure clamped by region gate → blocked", async () => {
    const supabase = buildSupabaseMock({ azure: { region: "eastus" }, trustedFlag: true })
    const r = await resolve(supabase, 3)
    expect(r).toEqual({ source: "blocked", reason: "class3_no_local_provider" })
  })

  it("AC-93.11 fail-closed: helper RPC error → Azure not eligible → blocked", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const supabase = buildSupabaseMock({ azure: { region: "westeurope" }, trustedError: "permission denied" })
      const r = await resolve(supabase, 3)
      expect(r).toEqual({ source: "blocked", reason: "class3_no_local_provider" })
    } finally {
      errSpy.mockRestore()
    }
  })

  it("AC-93.7 anti-scope: anthropic/openai/google never Class-3-eligible even via matrix rule", async () => {
    const supabase = buildSupabaseMock({
      anthropic: true,
      openai: true,
      google: true,
      trustedFlag: true, // attest present, but no azure in the order
      priorityRules: [
        { purpose: "proposal_stakeholders_from_context", data_class: 3, provider_order: ["anthropic", "openai", "google"] },
      ],
    })
    const r = await resolve(supabase, 3)
    expect(r).toEqual({ source: "blocked", reason: "class3_no_local_provider" })
  })

  it("D5: resource_swap and proposal_stakeholders_from_context share the same gate", async () => {
    for (const purpose of ["resource_swap", "proposal_stakeholders_from_context"] as const) {
      const supabase = buildSupabaseMock({ azure: { region: "northeurope" }, trustedFlag: true })
      const r = await resolve(supabase, 3, purpose)
      expect(r).toMatchObject({ source: "tenant", provider: "azure" })
    }
  })

  it("D5: Class-1/2 unaffected by DPA — Azure usable AND helper RPC not called", async () => {
    const supabase = buildSupabaseMock({ azure: { region: "westeurope" }, trustedFlag: false })
    const r = await resolve(supabase, 1)
    expect(r).toMatchObject({ source: "tenant", provider: "azure" })
    const rpcCalls = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls.map((c) => c[0])
    expect(rpcCalls).not.toContain("tenant_has_class3_trusted_processor")
  })

  it("AC-93.12 kill-switch overrides even attested Azure (and skips the helper RPC)", async () => {
    isExternalAIBlockedMock.mockReturnValue(true)
    const supabase = buildSupabaseMock({ azure: { region: "westeurope" }, trustedFlag: true })
    const r = await resolve(supabase, 3)
    expect(r).toEqual({ source: "blocked", reason: "external_ai_disabled" })
    const rpcCalls = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls.map((c) => c[0])
    expect(rpcCalls).not.toContain("tenant_has_class3_trusted_processor")
  })
})
