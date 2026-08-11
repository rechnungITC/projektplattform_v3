import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-130-γ2 — Verwaltung der Revisions-Leseberechtigung.
const { getUserMock, rpcMock, fromMock, results } = vi.hoisted(() => {
  const results: Record<string, { data: unknown; error: unknown }> = {}
  const chainFor = (result: { data: unknown; error: unknown }) => {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order", "limit"]) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain.maybeSingle = vi.fn().mockResolvedValue(result)
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
    return chain
  }
  return {
    getUserMock: vi.fn(),
    rpcMock: vi.fn(),
    results,
    fromMock: vi.fn((table: string) =>
      chainFor(results[table] ?? { data: [], error: null })
    ),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { DELETE, GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TARGET = "dddddddd-4444-4444-8444-dddddddddddd"
const TENANT = "11111111-1111-4111-8111-111111111111"

const params = Promise.resolve({ id: TENANT })

function post(body: unknown) {
  return new Request("http://localhost/api/tenants/x/audit-readers", {
    method: "POST",
    body: JSON.stringify(body),
  })
}
function del(body: unknown) {
  return new Request("http://localhost/api/tenants/x/audit-readers", {
    method: "DELETE",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(results)) delete results[k]
  getUserMock.mockResolvedValue({ data: { user: { id: ME } }, error: null })
  results.tenant_memberships = { data: { role: "admin" }, error: null }
  rpcMock.mockResolvedValue({ data: "grant-1", error: null })
})

describe("POST /api/tenants/[id]/audit-readers", () => {
  it("401 ohne Session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(post({ user_id: TARGET }), { params })
    expect(res.status).toBe(401)
  })

  it("403 für Nicht-Admins — die Freigabe ist Admin-Vorbehalt", async () => {
    results.tenant_memberships = { data: { role: "member" }, error: null }
    const res = await POST(post({ user_id: TARGET }), { params })
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("400 bei fehlender oder ungültiger user_id", async () => {
    expect((await POST(post({}), { params })).status).toBe(400)
    expect((await POST(post({ user_id: "nope" }), { params })).status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("201 und reicht Befristung + Notiz an die RPC durch", async () => {
    const res = await POST(
      post({
        user_id: TARGET,
        valid_until: "2027-01-01T00:00:00Z",
        note: "Externe Prüfung",
      }),
      { params }
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ grant_id: "grant-1" })
    expect(rpcMock).toHaveBeenCalledWith("grant_audit_reader", {
      p_tenant_id: TENANT,
      p_user_id: TARGET,
      p_valid_until: "2027-01-01T00:00:00Z",
      p_note: "Externe Prüfung",
    })
  })

  it("mappt den 42501 der RPC auf 403, nicht auf 400", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "nur Admins" },
    })
    const res = await POST(post({ user_id: TARGET }), { params })
    expect(res.status).toBe(403)
  })
})

describe("DELETE /api/tenants/[id]/audit-readers", () => {
  it("403 für Nicht-Admins", async () => {
    results.tenant_memberships = { data: { role: "member" }, error: null }
    expect((await DELETE(del({ user_id: TARGET }), { params })).status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("meldet, ob wirklich etwas widerrufen wurde", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await DELETE(del({ user_id: TARGET }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true })

    rpcMock.mockResolvedValue({ data: false, error: null })
    const res2 = await DELETE(del({ user_id: TARGET }), { params })
    expect(await res2.json()).toEqual({ revoked: false })
  })
})

describe("GET /api/tenants/[id]/audit-readers", () => {
  it("401 ohne Session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(new Request("http://x"), { params })).status).toBe(401)
  })

  it("liest die Freigaben — die Sichtbarkeit regelt RLS, nicht die Route", async () => {
    results.audit_reader_grants = {
      data: [{ id: "g1", user_id: TARGET, valid_until: null }],
      error: null,
    }
    const res = await GET(new Request("http://x"), { params })
    expect(res.status).toBe(200)
    expect((await res.json()).grants).toHaveLength(1)
  })
})
