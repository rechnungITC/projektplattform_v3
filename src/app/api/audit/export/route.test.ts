import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PROJ-130-γ2/γ4 — wer den Audit-Export erreichen darf, und wer ihn
 * unredigiert erreichen darf.
 *
 * Der zentrale Fall ist der dritte: ein Auditor (oder befristeter externer
 * Prüfer) DARF exportieren — das ist der Kern seines Auftrags — aber niemals
 * mit abgeschalteter Class-3-Redaktion. Sonst wäre die Redaktion über einen
 * befristeten Zugang aushebelbar.
 */
const { getUserMock, rpcMock, fromMock, results, insertMock } = vi.hoisted(
  () => {
    const results: Record<string, { data: unknown; error: unknown }> = {}
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const chainFor = (result: { data: unknown; error: unknown }) => {
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "order", "gte", "lte", "limit"]) {
        chain[m] = vi.fn().mockReturnValue(chain)
      }
      chain.maybeSingle = vi.fn().mockResolvedValue(result)
      chain.insert = insertMock
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    }
    return {
      getUserMock: vi.fn(),
      rpcMock: vi.fn(),
      insertMock,
      results,
      fromMock: vi.fn((table: string) =>
        chainFor(results[table] ?? { data: [], error: null })
      ),
    }
  }
)

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))
vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: vi.fn(async () => null),
}))

import { GET } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TENANT = "11111111-1111-4111-8111-111111111111"

function url(extra = "") {
  return new Request(
    `http://localhost/api/audit/export?tenant_id=${TENANT}&format=json${extra}`
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(results)) delete results[k]
  getUserMock.mockResolvedValue({ data: { user: { id: ME } }, error: null })
  results.audit_log_entries = { data: [], error: null }
  results.retention_export_log = { data: null, error: null }
  rpcMock.mockResolvedValue({ data: false, error: null })
})

describe("GET /api/audit/export — Zugang", () => {
  it("401 ohne Session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(url())).status).toBe(401)
  })

  it("403 ohne Admin-Rolle und ohne Revisions-Freigabe", async () => {
    results.tenant_memberships = { data: { role: "member" }, error: null }
    rpcMock.mockResolvedValue({ data: false, error: null })
    expect((await GET(url())).status).toBe(403)
  })

  it("lässt einen Auditor ohne Mandanten-Mitgliedschaft exportieren", async () => {
    results.tenant_memberships = { data: null, error: null }
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await GET(url())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("has_audit_reader_grant", {
      p_tenant_id: TENANT,
    })
  })

  it("verweigert dem Auditor den unredigierten Export (γ4)", async () => {
    results.tenant_memberships = { data: null, error: null }
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await GET(url("&redaction_off=true"))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.field).toBe("redaction_off")
    // Nichts gelesen und nichts protokolliert — die Absage kommt vor der Abfrage.
    expect(insertMock).not.toHaveBeenCalled()
  })

  it("erlaubt dem Admin den unredigierten Export", async () => {
    results.tenant_memberships = { data: { role: "admin" }, error: null }
    const res = await GET(url("&redaction_off=true"))
    expect(res.status).toBe(200)
    // Der Admin-Pfad kommt ohne die Freigabe-RPC aus — die Prüfung endet bei
    // der Rolle. (Die Ausnahme-RPC aus PROJ-Y-130h läuft trotzdem, sie gehört
    // zur Antwort und nicht zur Autorisierung.)
    expect(rpcMock).not.toHaveBeenCalledWith(
      "has_audit_reader_grant",
      expect.anything()
    )
  })

  it("weist einen bewusst unvollständigen Trail aus (PROJ-Y-130h)", async () => {
    results.tenant_memberships = { data: { role: "admin" }, error: null }
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve({
        data: fn === "tenant_audit_lifecycle_exempt" ? true : false,
        error: null,
      })
    )
    const res = await GET(url())
    expect(res.status).toBe(200)
    expect((await res.json()).lifecycle_exempt).toBe(true)
  })

  it("stellt den CSV-Hinweis nur im Ausnahmefall voran", async () => {
    results.tenant_memberships = { data: { role: "admin" }, error: null }
    const csvUrl = () =>
      new Request(
        `http://localhost/api/audit/export?tenant_id=${TENANT}&format=csv`
      )

    // Regelfall: der Export bleibt byte-identisch, damit keine Parser brechen.
    rpcMock.mockResolvedValue({ data: false, error: null })
    const clean = await (await GET(csvUrl())).text()
    expect(clean.startsWith("#")).toBe(false)

    // Ausnahmefall: der Hinweis steht in der Datei, nicht nur in der UI.
    rpcMock.mockResolvedValue({ data: true, error: null })
    const flagged = await (await GET(csvUrl())).text()
    expect(flagged.startsWith("# Hinweis:")).toBe(true)
  })
})
