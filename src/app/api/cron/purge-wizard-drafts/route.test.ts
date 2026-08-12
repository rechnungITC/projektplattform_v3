import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-144 (Lock L8) — dieser Lauf räumt jetzt zwei Entwurfsarten auf:
// Projekt-Entwürfe nach 90 Tagen, Sprach-Entwürfe für Work-Items nach 14.
// Getestet wird die Frist-Trennung und dass der Bearer-Schutz weiter greift —
// ohne ihn könnte jeder mit der URL fremde Entwürfe massenhaft löschen.

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { GET } from "./route"

const SECRET = "test-cron-secret"

let deletions: Array<{ table: string; cutoff: string }> = []

beforeEach(() => {
  vi.clearAllMocks()
  deletions = []
  vi.stubEnv("CRON_SECRET", SECRET)
  mocks.createAdminClient.mockReturnValue({
    from: (table: string) => chain(table),
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/purge-wizard-drafts", () => {
  it("weist einen Aufruf ohne Geheimnis mit 401 ab", async () => {
    const res = await GET(new Request("http://localhost/api/cron/purge-wizard-drafts"))
    expect(res.status).toBe(401)
    expect(deletions).toHaveLength(0)
  })

  it("weist ein falsches Geheimnis mit 401 ab", async () => {
    const res = await GET(authedRequest("wrong"))
    expect(res.status).toBe(401)
    expect(deletions).toHaveLength(0)
  })

  it("räumt beide Entwurfsarten mit getrennten Fristen auf", async () => {
    const res = await GET(authedRequest(SECRET))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    expect(deletions.map((d) => d.table)).toEqual([
      "project_wizard_drafts",
      "assistant_work_item_drafts",
    ])

    const ageInDays = (iso: string) =>
      Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)

    expect(ageInDays(deletions[0]!.cutoff)).toBe(90)
    expect(ageInDays(deletions[1]!.cutoff)).toBe(14)
    expect(ageInDays(body.work_item_draft_cutoff)).toBe(14)
  })

  it("meldet einen Fehler beim Aufräumen der Sprach-Entwürfe als 500", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) =>
        table === "assistant_work_item_drafts"
          ? chain(table, { message: "delete exploded" })
          : chain(table),
    })

    const res = await GET(authedRequest(SECRET))
    expect(res.status).toBe(500)
  })
})

function authedRequest(secret: string): Request {
  return new Request("http://localhost/api/cron/purge-wizard-drafts", {
    headers: { authorization: `Bearer ${secret}` },
  })
}

function chain(table: string, error: unknown = null) {
  const api: Record<string, unknown> = {
    delete: vi.fn(() => api),
    lt: vi.fn((_column: string, cutoff: string) => {
      deletions.push({ table, cutoff })
      return api
    }),
    select: vi.fn(async () => ({ data: [], error, count: 0 })),
  }
  return api
}
