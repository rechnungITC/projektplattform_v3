/**
 * PROJ-93 — integration tests for the DPA attest/revoke route
 * /api/tenants/[id]/ai-providers/[provider]/dpa.
 *
 * Coverage: authn (401), authz (403), provider guard (400 for non-azure),
 * body validation (400), attest happy path, revoke happy path, RPC error
 * mapping (no_azure_provider → 409).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const rpcMock = vi.fn(async (_fn: string, _args?: unknown) => ({
  data: null,
  error: null as { message: string } | null,
}))

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { DELETE, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeReq(body?: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function azureParams() {
  return { params: Promise.resolve({ id: TENANT_ID, provider: "azure" }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  rpcMock.mockResolvedValue({ data: null, error: null })
})

describe("POST .../dpa (attest)", () => {
  it("401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ reference: "DPA-2026-001" }), azureParams())
    expect(res.status).toBe(401)
  })

  it("403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await POST(makeReq({ reference: "DPA-2026-001" }), azureParams())
    expect(res.status).toBe(403)
  })

  it("400 for a non-azure provider (DPA is azure-only)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ reference: "DPA-2026-001" }), {
      params: Promise.resolve({ id: TENANT_ID, provider: "openai" }),
    })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("400 for a missing/short reference", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ reference: "x" }), azureParams())
    expect(res.status).toBe(400)
  })

  it("attests via the RPC on the happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makeReq({ reference: "DPA-2026-001" }), azureParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("attested")
    expect(rpcMock).toHaveBeenCalledWith("attest_tenant_ai_provider_dpa", {
      p_tenant_id: TENANT_ID,
      p_reference: "DPA-2026-001",
    })
  })

  it("maps no_azure_provider RPC error → 409", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "no_azure_provider: configure an Azure provider" },
    })
    const res = await POST(makeReq({ reference: "DPA-2026-001" }), azureParams())
    expect(res.status).toBe(409)
  })
})

describe("DELETE .../dpa (revoke)", () => {
  it("401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq(), azureParams())
    expect(res.status).toBe(401)
  })

  it("403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await DELETE(makeReq(), azureParams())
    expect(res.status).toBe(403)
  })

  it("400 for a non-azure provider", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, provider: "ollama" }),
    })
    expect(res.status).toBe(400)
  })

  it("revokes via the RPC on the happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await DELETE(makeReq(), azureParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("revoked")
    expect(rpcMock).toHaveBeenCalledWith("revoke_tenant_ai_provider_dpa", {
      p_tenant_id: TENANT_ID,
    })
  })
})
