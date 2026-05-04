/**
 * PROJ-32 — legacy `resolveAnthropicKey` wrapper unit tests.
 *
 * After 32-c-β the resolver reads from `tenant_ai_providers` (new
 * generic table) via the SECURITY DEFINER RPC `decrypt_tenant_ai_provider`.
 * The 32a-shape `resolveAnthropicKey` is preserved as a thin wrapper
 * for backward compatibility until 32-c-γ cleanup.
 *
 * Behavioural change vs 32a (CIA-locked):
 *   * Class-3 + tenant Anthropic key now returns BLOCKED. Anthropic is
 *     a cloud provider — data leaves the tenant control domain even
 *     when using the tenant's own key. Class-3 can only route to Ollama
 *     (which runs on tenant infrastructure). Tests below reflect this.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveAnthropicKey } from "./key-resolver"

// Mock the operation-mode kill-switch
vi.mock("@/lib/operation-mode", () => ({
  isExternalAIBlocked: vi.fn(() => false),
}))

import { isExternalAIBlocked } from "@/lib/operation-mode"

const isExternalAIBlockedMock = vi.mocked(isExternalAIBlocked)

interface RpcResult {
  data: unknown
  error: { message: string } | null
}

function buildSupabaseMock(opts: {
  setKeyResult?: RpcResult
  /** Anthropic decrypt result. `null` → not configured. */
  anthropicDecrypt?: RpcResult
  /** Ollama decrypt result. `null` → not configured. Default: not configured. */
  ollamaDecrypt?: RpcResult
  decryptError?: RpcResult
}) {
  // Status read from tenant_ai_providers — RLS denies non-admin, returns null.
  const statusChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  // 32-c-γ priority matrix — empty rules so resolver uses defaults.
  const priorityChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  }

  return {
    rpc: vi.fn(async (fn: string, args?: { p_provider?: string }) => {
      if (fn === "set_session_encryption_key") {
        return opts.setKeyResult ?? { data: null, error: null }
      }
      if (fn === "decrypt_tenant_ai_provider") {
        if (opts.decryptError) return opts.decryptError
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
      if (table === "tenant_ai_provider_priority") return priorityChain
      return statusChain
    }),
  } as unknown as Parameters<typeof resolveAnthropicKey>[0]["supabase"]
}

/** Build the JSONB shape that decrypt_tenant_ai_provider returns. */
function anthropicConfig(apiKey: string): { data: object; error: null } {
  return { data: { api_key: apiKey }, error: null }
}

const TENANT = "11111111-1111-1111-1111-111111111111"
const PLATFORM_KEY = "sk-ant-platform-default-1234"
const TENANT_KEY = "sk-ant-tenant-rotated-abcd"

describe("resolveAnthropicKey", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-xx"
    process.env.ANTHROPIC_API_KEY = PLATFORM_KEY
    isExternalAIBlockedMock.mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    delete process.env.ANTHROPIC_API_KEY
    vi.clearAllMocks()
  })

  describe("tenant Anthropic key set", () => {
    for (const dataClass of [1, 2] as const) {
      it(`Class-${dataClass}: returns tenant source with decrypted key`, async () => {
        const supabase = buildSupabaseMock({
          anthropicDecrypt: anthropicConfig(TENANT_KEY),
        })
        const r = await resolveAnthropicKey({
          supabase,
          tenantId: TENANT,
          provider: "anthropic",
          dataClass,
        })
        expect(r).toEqual({ source: "tenant", key: TENANT_KEY })
      })
    }

    it("Class-3: BLOCKED — Anthropic is cloud, not Class-3-eligible", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: anthropicConfig(TENANT_KEY),
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 3,
      })
      expect(r).toEqual({
        source: "blocked",
        reason: "class3_no_tenant_key",
      })
    })
  })

  describe("no tenant key set (decrypt returns null)", () => {
    it("Class-1: falls back to platform key", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: { data: null, error: null },
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 1,
      })
      expect(r).toEqual({ source: "platform", key: PLATFORM_KEY })
    })

    it("Class-2: falls back to platform key", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: { data: null, error: null },
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 2,
      })
      expect(r).toEqual({ source: "platform", key: PLATFORM_KEY })
    })

    it("Class-3: blocked with class3_no_tenant_key reason", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: { data: null, error: null },
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 3,
      })
      expect(r).toEqual({
        source: "blocked",
        reason: "class3_no_tenant_key",
      })
    })
  })

  describe("no tenant key + no platform key", () => {
    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it("Class-1: blocked with no_key_available reason", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: { data: null, error: null },
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 1,
      })
      expect(r).toEqual({ source: "blocked", reason: "no_key_available" })
    })

    it("Class-3: still blocks with class3_no_tenant_key (Class-3 short-circuits)", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: { data: null, error: null },
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 3,
      })
      expect(r).toEqual({
        source: "blocked",
        reason: "class3_no_tenant_key",
      })
    })
  })

  describe("kill-switch (EXTERNAL_AI_DISABLED)", () => {
    beforeEach(() => {
      isExternalAIBlockedMock.mockReturnValue(true)
    })

    it("blocks even when tenant key is set", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: anthropicConfig(TENANT_KEY),
      })
      const r = await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 1,
      })
      expect(r).toEqual({
        source: "blocked",
        reason: "external_ai_disabled",
      })
    })

    it("does not call the decrypt RPC when killed", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: anthropicConfig(TENANT_KEY),
      })
      await resolveAnthropicKey({
        supabase,
        tenantId: TENANT,
        provider: "anthropic",
        dataClass: 1,
      })
      const rpcCalls = (
        supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      ).rpc.mock.calls.map((c) => c[0])
      expect(rpcCalls).not.toContain("decrypt_tenant_ai_provider")
      expect(rpcCalls).not.toContain("set_session_encryption_key")
    })
  })

  describe("misconfig — SECRETS_ENCRYPTION_KEY missing", () => {
    beforeEach(() => {
      delete process.env.SECRETS_ENCRYPTION_KEY
    })

    it("treats as 'no tenant key' and falls back to platform for Class-1/2", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: anthropicConfig(TENANT_KEY),
      })
      // Suppress the console.error noise for this expected-misconfig path.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        const r = await resolveAnthropicKey({
          supabase,
          tenantId: TENANT,
          provider: "anthropic",
          dataClass: 2,
        })
        expect(r).toEqual({ source: "platform", key: PLATFORM_KEY })
      } finally {
        errorSpy.mockRestore()
      }
    })

    it("blocks Class-3 with class3_no_tenant_key (no platform fallback)", async () => {
      const supabase = buildSupabaseMock({
        anthropicDecrypt: anthropicConfig(TENANT_KEY),
      })
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        const r = await resolveAnthropicKey({
          supabase,
          tenantId: TENANT,
          provider: "anthropic",
          dataClass: 3,
        })
        expect(r).toEqual({
          source: "blocked",
          reason: "class3_no_tenant_key",
        })
      } finally {
        errorSpy.mockRestore()
      }
    })
  })

  describe("decrypt RPC error", () => {
    it("propagates the error (caller decides retry vs degrade)", async () => {
      const supabase = buildSupabaseMock({
        decryptError: {
          data: null,
          error: { message: "encryption_unavailable" },
        },
      })
      await expect(
        resolveAnthropicKey({
          supabase,
          tenantId: TENANT,
          provider: "anthropic",
          dataClass: 1,
        }),
      ).rejects.toThrow(/encryption_unavailable/)
    })
  })

  describe("set_session_encryption_key error", () => {
    it("propagates the error", async () => {
      const supabase = buildSupabaseMock({
        setKeyResult: {
          data: null,
          error: { message: "permission denied" },
        },
        anthropicDecrypt: { data: null, error: null },
      })
      await expect(
        resolveAnthropicKey({
          supabase,
          tenantId: TENANT,
          provider: "anthropic",
          dataClass: 1,
        }),
      ).rejects.toThrow(/set_session_encryption_key failed/)
    })
  })
})
