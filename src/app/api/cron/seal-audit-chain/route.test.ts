/**
 * PROJ-130-ε — der Siegel-Cron.
 *
 * Drei Zusicherungen, die zählen:
 *  1. Ohne gültiges Cron-Geheimnis passiert NICHTS — insbesondere wird kein
 *     Datenbank-Client gebaut (wer siegeln kann, wählt den Zeitpunkt der
 *     Siegelung; das darf keine fremde Anfrage auslösen).
 *  2. Ein fehlgeschlagener Lauf antwortet mit 500 statt still `ok` zu melden:
 *     ungesiegelte Fenster sind nachträglich nicht mehr manipulationssicher
 *     nachweisbar, das darf nicht unbemerkt bleiben.
 *  3. Der Erfolgsfall zählt Mandanten und Fenster zusammen, damit im Log sichtbar
 *     ist, ob überhaupt gesiegelt wurde.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted, weil vi.mock über die const-Deklarationen gehoben wird.
const { rpc, createAdminClient } = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc, createAdminClient: vi.fn(() => ({ rpc })) }
})

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }))

import { GET } from "./route"

const ORIGINAL = process.env.CRON_SECRET

function makeGet(auth?: string): Request {
  return new Request("http://localhost/api/cron/seal-audit-chain", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  })
}

describe("GET /api/cron/seal-audit-chain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "geheim"
  })
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = ORIGINAL
  })

  it("weist eine Anfrage ohne Geheimnis ab, ohne die Datenbank anzufassen", async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("weist ein falsches Geheimnis ab, ohne die Datenbank anzufassen", async () => {
    const res = await GET(makeGet("Bearer falsch"))
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("meldet 500, wenn CRON_SECRET serverseitig fehlt", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeGet("Bearer geheim"))
    expect(res.status).toBe(500)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("siegelt über die service-role-RPC und summiert die Fenster", async () => {
    rpc.mockResolvedValue({
      data: [
        { sealed_tenant_id: "t1", sealed_windows: 3, last_window_start: "2026-08-11T00:00:00Z" },
        { sealed_tenant_id: "t2", sealed_windows: 1, last_window_start: "2026-08-11T00:00:00Z" },
      ],
      error: null,
    })
    const res = await GET(makeGet("Bearer geheim"))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("seal_audit_chain")
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      tenants_sealed: 2,
      windows_sealed: 4,
    })
  })

  it("scheitert laut, wenn das Siegeln fehlschlägt (kein stilles ok)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    const res = await GET(makeGet("Bearer geheim"))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "seal_failed" },
    })
  })

  it("meldet einen Lauf ohne neue Fenster als ok mit Null", async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeGet("Bearer geheim"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      tenants_sealed: 0,
      windows_sealed: 0,
    })
  })
})
