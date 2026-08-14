/**
 * PROJ-80-α.2c — Zugangstor des Aufräumlaufs.
 *
 * Ein Cron-Endpunkt ohne Sitzung ist per Definition offen erreichbar; das
 * Bearer-Geheimnis ist die einzige Schranke. Sie wird hier gegen die drei
 * Wege geprüft, auf denen sie in der Vergangenheit gebrochen wurde: fehlendes
 * Serverkonfigurat, fehlender Kopf, falscher Wert.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error(
      "Der Aufräumlauf darf ohne gültiges Geheimnis keinen DB-Client bauen.",
    )
  },
}))

const { GET } = await import("./route")

const ORIGINAL = process.env.CRON_SECRET
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL
})

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/document-summaries", {
    headers: auth ? { authorization: auth } : {},
  })
}

describe("PROJ-80 Aufräumlauf — Zugangstor", () => {
  it("500 ohne serverseitiges Geheimnis", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req("Bearer irgendwas"))
    expect(res.status).toBe(500)
  })

  it("401 ohne Authorization-Kopf", async () => {
    process.env.CRON_SECRET = "geheim"
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it("401 bei falschem Geheimnis", async () => {
    process.env.CRON_SECRET = "geheim"
    const res = await GET(req("Bearer falsch"))
    expect(res.status).toBe(401)
  })

  it("verrät im Fehlerfall nichts über den Bestand", async () => {
    process.env.CRON_SECRET = "geheim"
    const res = await GET(req("Bearer falsch"))
    const body = await res.text()
    expect(body).not.toMatch(/document_extractions|tenant|summary/i)
  })
})
