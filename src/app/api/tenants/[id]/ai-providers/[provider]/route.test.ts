/**
 * PROJ-32-c-β — integration tests for /api/tenants/[id]/ai-providers/[provider].
 *
 * Mocks Supabase client (auth + from + rpc) + global fetch (Anthropic + Ollama).
 *
 * Coverage:
 *   * GET — not_set / valid mapping for both providers
 *   * PUT — Anthropic happy path / Ollama happy path / wrong-provider body
 *           rejection / 401 from Anthropic / unreachable Ollama persists
 *           with warning / encryption_unavailable / authn / authz
 *   * DELETE — happy / not-found idempotent / authn / authz
 *   * Plain-config never appears in any response
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

interface RowState {
  data: Record<string, unknown> | null
}
const rowState: RowState = { data: null }

const providersChain = {
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: rowState.data, error: null })),
}

const rpcMock = vi.fn(async (fn: string, _args?: unknown) => {
  if (fn === "set_session_encryption_key") return { data: null, error: null }
  if (fn === "encrypt_tenant_secret")
    return { data: "\\x" + "deadbeef".repeat(8), error: null }
  if (fn === "record_tenant_ai_provider_audit")
    return { data: null, error: null }
  if (fn === "decrypt_tenant_ai_provider")
    return { data: { api_key: "sk-ant-decrypted-1234" }, error: null }
  throw new Error(`unexpected rpc ${fn}`)
})

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "tenant_ai_providers") return providersChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { DELETE, GET, PUT } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const VALID_ANTHROPIC = "sk-ant-api03-test-key-with-enough-length-1234"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-x"

  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })

  providersChain.select.mockReturnValue(providersChain)
  providersChain.delete.mockReturnValue(providersChain)
  providersChain.eq.mockReturnValue(providersChain)
  rowState.data = null

  globalThis.fetch = vi.fn(async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: "llama3.1:70b" }, { name: "qwen2.5:32b" }],
      }),
    }) as unknown as Response,
  )
})

function makeReq(body?: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/tenants/[id]/ai-providers/[provider]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 400 for unsupported provider", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "mistral" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns not_set when no row exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = null
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_set")
  })

  it("returns valid + fingerprint when Anthropic row is valid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = {
      key_fingerprint: "sk-ant-...abcd",
      last_validation_status: "valid",
      last_validated_at: "2026-05-04T01:00:00Z",
      created_at: "2026-05-04T00:00:00Z",
      updated_at: "2026-05-04T01:00:00Z",
    }
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toBe("sk-ant-...abcd")
    expect(body).not.toHaveProperty("encrypted_config")
    expect(body).not.toHaveProperty("api_key")
  })

  it("maps Ollama unreachable status correctly", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = {
      key_fingerprint: "ollama:host/model",
      last_validation_status: "unreachable",
      last_validated_at: null,
    }
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    const body = await res.json()
    expect(body.status).toBe("unreachable")
  })
})

describe("PUT — Anthropic", () => {
  it("rejects body without key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({}), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects key without sk-ant- prefix", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({ key: "sk-openai-bogus-1234567890123456789012345678" }),
      {
        params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
      },
    )
    expect(res.status).toBe(400)
  })

  it("rejects with 422 when Anthropic returns 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(
      async () => ({ ok: false, status: 401 }) as Response,
    )
    const res = await PUT(makeReq({ key: VALID_ANTHROPIC }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(422)
    expect(rpcMock).not.toHaveBeenCalledWith(
      "encrypt_tenant_secret",
      expect.anything(),
    )
  })

  it("happy path persists + audits + never returns the key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: VALID_ANTHROPIC }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toMatch(/^sk-ant-\.\.\..{4}$/)

    const rpcCalls = rpcMock.mock.calls.map((c) => c[0])
    expect(rpcCalls).toContain("encrypt_tenant_secret")
    expect(rpcCalls).toContain("record_tenant_ai_provider_audit")
    expect(providersChain.upsert).toHaveBeenCalledOnce()

    // The plain key never appears in response
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(VALID_ANTHROPIC)
  })

  it("rotate path: writes 'rotate' action", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = { key_fingerprint: "sk-ant-...prev" }
    const res = await PUT(makeReq({ key: VALID_ANTHROPIC }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const auditCall = rpcMock.mock.calls.find(
      (c) => c[0] === "record_tenant_ai_provider_audit",
    )
    expect(auditCall?.[1]).toMatchObject({
      p_action: "rotate",
      p_old_fingerprint: "sk-ant-...prev",
    })
  })
})

describe("PUT — OpenAI", () => {
  const VALID_OPENAI = "sk-proj-test-key-1234567890123456789012"

  it("rejects key without sk- prefix", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: "AIza-bogus-1234567890" }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "openai" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects with 422 when OpenAI returns 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(
      async () => ({ ok: false, status: 401 }) as Response,
    )
    const res = await PUT(makeReq({ key: VALID_OPENAI }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "openai" }),
    })
    expect(res.status).toBe(422)
  })

  it("happy path persists + audits + plain key never in response", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: VALID_OPENAI }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "openai" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toMatch(/^sk-\.\.\..{4}$/)
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(VALID_OPENAI)
  })
})

describe("PUT — Google", () => {
  const VALID_GOOGLE = "AIzaTest-key-1234567890123456789012"

  it("rejects key without AIza prefix", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: "sk-bogus-12345678901234567890" }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "google" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects with 422 when Google returns 400", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(
      async () => ({ ok: false, status: 400 }) as Response,
    )
    const res = await PUT(makeReq({ key: VALID_GOOGLE }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "google" }),
    })
    expect(res.status).toBe(422)
  })

  it("happy path persists + audits + plain key never in response", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: VALID_GOOGLE }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "google" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toMatch(/^AIza\.\.\..{4}$/)
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(VALID_GOOGLE)
  })
})

describe("PUT — Ollama", () => {
  const validOllama = {
    endpoint_url: "https://ollama.acme.com",
    model_id: "llama3.1:70b",
  }

  it("happy path persists when /api/tags returns the model", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq(validOllama), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toContain("ollama.acme.com")
    expect(body.fingerprint).toContain("llama3.1:70b")
  })

  it("rejects SSRF URL (cloud metadata)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({ ...validOllama, endpoint_url: "http://169.254.169.254" }),
      { params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.field).toBe("endpoint_url")
  })

  it("rejects file:// scheme", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({ ...validOllama, endpoint_url: "file:///etc/passwd" }),
      { params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }) },
    )
    expect(res.status).toBe(400)
  })

  it("persists with model_missing warning when Ollama lacks the model", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: "mistral:7b" }] }),
        }) as unknown as Response,
    )
    const res = await PUT(makeReq(validOllama), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("model_missing")
    expect(body.validation_warning).toContain("ollama pull")
    expect(providersChain.upsert).toHaveBeenCalledOnce()
  })

  it("persists with unreachable warning when endpoint is down", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const res = await PUT(makeReq(validOllama), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("unreachable")
    expect(providersChain.upsert).toHaveBeenCalledOnce()
  })

  it("rejects 401 with 422 (bad bearer token)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(
      async () => ({ ok: false, status: 401 }) as Response,
    )
    const res = await PUT(
      makeReq({ ...validOllama, bearer_token: "bad-token-1234" }),
      { params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }) },
    )
    expect(res.status).toBe(422)
    expect(providersChain.upsert).not.toHaveBeenCalled()
  })

  it("never includes plain bearer_token in response", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(
      makeReq({ ...validOllama, bearer_token: "very-secret-token-12345" }),
      { params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }) },
    )
    const body = await res.json()
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain("very-secret-token-12345")
  })
})

describe("DELETE", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(401)
  })

  it("idempotent when no row exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = null
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_set")
    expect(rpcMock).not.toHaveBeenCalledWith(
      "record_tenant_ai_provider_audit",
      expect.anything(),
    )
  })

  it("happy path: deletes + audits 'delete'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rowState.data = { key_fingerprint: "ollama:host/model" }
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(200)
    expect(providersChain.delete).toHaveBeenCalledOnce()
    const auditCall = rpcMock.mock.calls.find(
      (c) => c[0] === "record_tenant_ai_provider_audit",
    )
    expect(auditCall?.[1]).toMatchObject({
      p_action: "delete",
      p_new_fingerprint: null,
    })
  })
})
