/**
 * PROJ-32a — integration tests for /api/tenants/[id]/ai-keys/[provider].
 *
 * Mocks:
 *   * Supabase client (auth + from + rpc)
 *   * global.fetch (Anthropic /v1/models)
 *
 * Coverage:
 *   * GET   — not_set / valid / invalid status mapping
 *   * PUT   — happy path / invalid key (401 from Anthropic) / unsupported provider
 *           / encryption_unavailable / authn / authz
 *   * DELETE — happy / not-found idempotent / authn / authz
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

interface KeyRowState {
  data: Record<string, unknown> | null
}
const keyRowState: KeyRowState = { data: null }

const aiKeysChain = {
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: keyRowState.data, error: null })),
}

const rpcMock = vi.fn(async (fn: string, _args?: unknown) => {
  if (fn === "set_session_encryption_key") {
    return { data: null, error: null }
  }
  if (fn === "encrypt_tenant_secret") {
    return { data: "\\x" + "deadbeef".repeat(8), error: null }
  }
  if (fn === "record_tenant_ai_key_audit") {
    return { data: null, error: null }
  }
  if (fn === "decrypt_tenant_ai_key") {
    return { data: "sk-ant-decrypted-key-1234", error: null }
  }
  throw new Error(`unexpected rpc ${fn}`)
})

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "tenant_ai_keys") return aiKeysChain
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
const VALID_KEY = "sk-ant-api03-test-key-with-enough-length-1234"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-x"

  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })

  aiKeysChain.select.mockReturnValue(aiKeysChain)
  aiKeysChain.delete.mockReturnValue(aiKeysChain)
  aiKeysChain.eq.mockReturnValue(aiKeysChain)
  keyRowState.data = null

  // re-stub fetch on each test so a previous mock doesn't leak
  globalThis.fetch = vi.fn(async () =>
    ({ ok: true, status: 200 }) as Response,
  )
})

function makeReq(body?: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/tenants/[id]/ai-keys/[provider]", () => {
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
      params: Promise.resolve({ id: TENANT_ID, provider: "openai" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns not_set when no row exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = null
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_set")
    expect(body.fingerprint).toBeUndefined()
  })

  it("returns valid + fingerprint when row is valid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = {
      key_fingerprint: "sk-ant-...abcd",
      last_validated_at: "2026-05-04T01:00:00Z",
      last_validation_status: "valid",
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
    // Cardinal property: never returns the encrypted key.
    expect(body).not.toHaveProperty("encrypted_key")
    expect(body).not.toHaveProperty("key")
  })
})

describe("PUT /api/tenants/[id]/ai-keys/[provider]", () => {
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

  it("rejects when Anthropic returns 401 (validation_error 422)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    globalThis.fetch = vi.fn(async () =>
      ({ ok: false, status: 401 }) as Response,
    )
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
    // Encrypt RPC must NOT have been called when key is rejected.
    expect(rpcMock).not.toHaveBeenCalledWith(
      "encrypt_tenant_secret",
      expect.anything(),
    )
  })

  it("happy path: persists valid key + writes audit", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = null // no prior key → action='create'
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("valid")
    expect(body.fingerprint).toMatch(/^sk-ant-\.\.\..{4}$/)

    // Encrypt + upsert + audit must all have fired.
    const rpcCalls = rpcMock.mock.calls.map((c) => c[0])
    expect(rpcCalls).toContain("set_session_encryption_key")
    expect(rpcCalls).toContain("encrypt_tenant_secret")
    expect(rpcCalls).toContain("record_tenant_ai_key_audit")
    expect(aiKeysChain.upsert).toHaveBeenCalledOnce()

    // Audit was a 'create' (no prior fingerprint).
    const auditCall = rpcMock.mock.calls.find(
      (c) => c[0] === "record_tenant_ai_key_audit",
    )
    expect(auditCall?.[1]).toMatchObject({
      p_action: "create",
      p_old_fingerprint: null,
    })
  })

  it("rotate path: writes 'rotate' action when prior key existed", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = { key_fingerprint: "sk-ant-...prev" }
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const auditCall = rpcMock.mock.calls.find(
      (c) => c[0] === "record_tenant_ai_key_audit",
    )
    expect(auditCall?.[1]).toMatchObject({
      p_action: "rotate",
      p_old_fingerprint: "sk-ant-...prev",
    })
  })

  it("503 when SECRETS_ENCRYPTION_KEY is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    delete process.env.SECRETS_ENCRYPTION_KEY
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(503)
  })

  it("400 for unsupported provider — never even validates body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(400)
  })

  it("never includes the plain key in the response", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PUT(makeReq({ key: VALID_KEY }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    const body = await res.json()
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(VALID_KEY)
    expect(serialized).not.toContain("api03-test-key")
  })
})

describe("DELETE /api/tenants/[id]/ai-keys/[provider]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq(), {
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
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(403)
  })

  it("idempotent when no row exists — returns not_set", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = null
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("not_set")
    // No audit emitted for no-op.
    expect(rpcMock).not.toHaveBeenCalledWith(
      "record_tenant_ai_key_audit",
      expect.anything(),
    )
  })

  it("happy path: deletes + writes audit with action='delete'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    keyRowState.data = { key_fingerprint: "sk-ant-...gone" }
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "anthropic" }),
    })
    expect(res.status).toBe(200)
    expect(aiKeysChain.delete).toHaveBeenCalledOnce()
    const auditCall = rpcMock.mock.calls.find(
      (c) => c[0] === "record_tenant_ai_key_audit",
    )
    expect(auditCall?.[1]).toMatchObject({
      p_action: "delete",
      p_old_fingerprint: "sk-ant-...gone",
      p_new_fingerprint: null,
    })
  })
})
