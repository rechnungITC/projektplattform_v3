/**
 * PROJ-Y-45p — der Speicherzähler-Sweep im nächtlichen DMS-Lauf.
 *
 * Getrennte Datei, weil der Bestandstest daneben den Admin-Client absichtlich
 * WERFEN lässt (er prüft nur das Bearer-Tor) — mit diesem Mock wäre kein
 * Erfolgsfall fahrbar.
 *
 * Geprüft wird die Zusicherung, die im Betrieb zählt: der Sweep hängt an keinem
 * KI-Anbieter und darf von einem Quintessenz-Fehler nicht mitgerissen werden,
 * und umgekehrt darf ein Sweep-Fehler die geschriebenen Quintessenzen nicht als
 * Fehlschlag ausgeben. Ein Fehler wird BENANNT, nicht verschluckt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpcMock = vi.fn()
const summaryMock = vi.fn()
/** Kandidaten, die der Lauf für die Quintessenz-Runde findet. */
let candidates: Array<{ document_id: string; tenant_id: string }> = []

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve({ data: candidates, error: null }),
        // Weder eine Quintessenz-Zeile noch ein Ersteller: der Lauf überspringt
        // den Kandidaten. Für diese Tests genügt das — hier geht es um den Sweep.
        maybeSingle: () =>
          Promise.resolve({
            data: table === "documents" ? { created_by: null } : null,
            error: null,
          }),
      }
      return chain
    },
    rpc: (name: string) => rpcMock(name),
  }),
}))

vi.mock("@/lib/dms/summary-runner", () => ({
  runDocumentSummary: (...args: unknown[]) => summaryMock(...args),
}))

const { GET } = await import("./route")

const ORIGINAL = process.env.CRON_SECRET
beforeEach(() => {
  process.env.CRON_SECRET = "geheim"
  candidates = []
  rpcMock.mockReset()
  summaryMock.mockReset()
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

function req(): Request {
  return new Request("http://localhost/api/cron/document-summaries", {
    headers: { authorization: "Bearer geheim" },
  })
}

describe("PROJ-Y-45p — Speicherzähler-Sweep im nächtlichen Lauf", () => {
  it("ruft den Sweep und gibt seine Zahlen aus", async () => {
    rpcMock.mockResolvedValue({
      data: [{ tenants_swept: 3, corrected: 1 }],
      error: null,
    })
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("dms_sweep_storage_quotas")
    expect(body.quota_sweep).toEqual({ tenants_swept: 3, corrected: 1 })
  })

  it("läuft auch ohne einen einzigen Quintessenz-Kandidaten", async () => {
    // Der tragende Fall: der Sweep darf NICHT in der Kandidaten-Schleife hängen.
    // Ohne Kandidaten läuft die Schleife nicht — der Sweep muss trotzdem laufen.
    candidates = []
    rpcMock.mockResolvedValue({
      data: [{ tenants_swept: 2, corrected: 0 }],
      error: null,
    })
    const res = await GET(req())
    const body = await res.json()

    expect(body.scanned).toBe(0)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(body.quota_sweep).toEqual({ tenants_swept: 2, corrected: 0 })
  })

  it("benennt einen Sweep-Fehler, ohne den Lauf als Fehlschlag auszugeben", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "kaputt" } })
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quota_sweep).toEqual({ error: "kaputt" })
  })

  it("meldet ein leeres Ergebnis als Fehler statt es zu verschlucken", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const res = await GET(req())
    const body = await res.json()

    expect(body.quota_sweep).toEqual({ error: "no_result" })
  })
})
