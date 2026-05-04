/**
 * PROJ-32a — key-resolver unit tests.
 *
 * Mocks the Supabase RPCs (`set_session_encryption_key`,
 * `decrypt_tenant_ai_key`) so we can isolate the routing-policy logic:
 *   - 4 tenant-key states (not_set / valid / invalid_decrypt-error / unknown)
 *     × 3 dataClasses × 2 platform-key states × 1 kill-switch state
 *
 * Required AC verification:
 *   * Class-3 + no tenant key  → blocked (Spec C.1, C.2)
 *   * Class-1/2 + no tenant key → platform fallback (Spec C.1)
 *   * Tenant key set           → tenant source for all classes
 *   * Kill-switch blocks all
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
  decryptResult: RpcResult
}) {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "set_session_encryption_key") {
        return opts.setKeyResult ?? { data: null, error: null }
      }
      if (fn === "decrypt_tenant_ai_key") {
        return opts.decryptResult
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    // Cast to satisfy SupabaseClient — only `rpc` is exercised.
  } as unknown as Parameters<typeof resolveAnthropicKey>[0]["supabase"]
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

  describe("tenant key set (decrypt returns plaintext)", () => {
    for (const dataClass of [1, 2, 3] as const) {
      it(`Class-${dataClass}: returns tenant source with decrypted key`, async () => {
        const supabase = buildSupabaseMock({
          decryptResult: { data: TENANT_KEY, error: null },
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
  })

  describe("no tenant key set (decrypt returns null)", () => {
    it("Class-1: falls back to platform key", async () => {
      const supabase = buildSupabaseMock({
        decryptResult: { data: null, error: null },
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
        decryptResult: { data: null, error: null },
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
        decryptResult: { data: null, error: null },
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
        decryptResult: { data: null, error: null },
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
        decryptResult: { data: null, error: null },
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
        decryptResult: { data: TENANT_KEY, error: null },
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
        decryptResult: { data: TENANT_KEY, error: null },
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
      expect(rpcCalls).not.toContain("decrypt_tenant_ai_key")
      expect(rpcCalls).not.toContain("set_session_encryption_key")
    })
  })

  describe("misconfig — SECRETS_ENCRYPTION_KEY missing", () => {
    beforeEach(() => {
      delete process.env.SECRETS_ENCRYPTION_KEY
    })

    it("treats as 'no tenant key' and falls back to platform for Class-1/2", async () => {
      const supabase = buildSupabaseMock({
        decryptResult: { data: TENANT_KEY, error: null },
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
        decryptResult: { data: TENANT_KEY, error: null },
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
        decryptResult: {
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
        decryptResult: { data: null, error: null },
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
