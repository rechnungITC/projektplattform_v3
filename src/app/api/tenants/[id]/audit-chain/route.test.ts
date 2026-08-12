/**
 * PROJ-130-ε — Verifikationslauf über die HTTP-Fläche.
 *
 * Der Berechtigungs-Tiefennachweis liegt im Live-Pentest
 * (`tests/sql/PROJ-130-epsilon-chain-anchors-pentest.sql`, A–K 11/11): dort ist
 * bewiesen, dass ein gewöhnliches Mitglied 42501 bekommt und erst eine
 * γ2-Freigabe prüfen darf. Hier wird geprüft, dass die Route dieses Urteil
 * korrekt übersetzt — insbesondere 42501 → 403 und nicht 500 — und dass sie das
 * Urteil der Kette nicht verwässert.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserMock, rpcMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  })),
}))

import { GET } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TENANT = "11111111-1111-4111-8111-111111111111"
const req = new Request("http://localhost/api/tenants/x/audit-chain")

function signedIn() {
  getUserMock.mockResolvedValue({ data: { user: { id: ME } }, error: null })
}

describe("GET /api/tenants/[id]/audit-chain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("weist eine ungültige Mandanten-ID ab, ohne zu prüfen", async () => {
    const res = await GET(req, { params: Promise.resolve({ id: "keine-uuid" }) })
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("verlangt eine Anmeldung", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(req, { params: Promise.resolve({ id: TENANT }) })
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("übersetzt das Gate der RPC (42501) in 403, nicht in 500", async () => {
    signedIn()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } })
    const res = await GET(req, { params: Promise.resolve({ id: TENANT }) })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: { code: "forbidden" } })
  })

  it("meldet eine unversehrte Kette als intakt und ohne Funde", async () => {
    signedIn()
    rpcMock.mockResolvedValue({
      data: [
        { source: "audit_log", window_start: "2026-08-10T00:00:00Z", entry_count_sealed: 5, entry_count_now: 5, digest_ok: true, link_ok: true },
        { source: "audit_log", window_start: "2026-08-11T00:00:00Z", entry_count_sealed: 0, entry_count_now: 0, digest_ok: true, link_ok: true },
      ],
      error: null,
    })
    const res = await GET(req, { params: Promise.resolve({ id: TENANT }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      windows_checked: 2,
      intact: true,
      findings: [],
      last_window_start: "2026-08-11T00:00:00Z",
      sources: [
        {
          source: "audit_log",
          windows_checked: 2,
          intact: true,
          last_window_start: "2026-08-11T00:00:00Z",
        },
      ],
    })
  })

  it("meldet einen gebrochenen Prüfwert als Fund — inhaltliche Fälschung", async () => {
    signedIn()
    rpcMock.mockResolvedValue({
      data: [
        { source: "audit_log", window_start: "2026-08-10T00:00:00Z", entry_count_sealed: 5, entry_count_now: 5, digest_ok: false, link_ok: true },
      ],
      error: null,
    })
    const body = await (await GET(req, { params: Promise.resolve({ id: TENANT }) })).json()
    expect(body.intact).toBe(false)
    expect(body.findings).toHaveLength(1)
  })

  it("meldet auch einen gebrochenen Ketten-Link als Fund — nachgezogener Anker", async () => {
    signedIn()
    rpcMock.mockResolvedValue({
      data: [
        { source: "audit_log", window_start: "2026-08-10T00:00:00Z", entry_count_sealed: 5, entry_count_now: 5, digest_ok: true, link_ok: false },
      ],
      error: null,
    })
    const body = await (await GET(req, { params: Promise.resolve({ id: TENANT }) })).json()
    expect(body.intact).toBe(false)
    expect(body.findings[0].link_ok).toBe(false)
  })

  it("kommt mit einer noch leeren Kette zurecht", async () => {
    signedIn()
    rpcMock.mockResolvedValue({ data: [], error: null })
    const body = await (await GET(req, { params: Promise.resolve({ id: TENANT }) })).json()
    expect(body).toEqual({
      windows_checked: 0,
      intact: true,
      findings: [],
      last_window_start: null,
      sources: [],
    })
  })

  // PROJ-Y-130n: der eigentliche Zugewinn — ein zusammengefasstes Urteil würde
  // verschweigen, WELCHES Protokoll betroffen ist.
  it("beurteilt die beiden Ketten getrennt", async () => {
    signedIn()
    rpcMock.mockResolvedValue({
      data: [
        { source: "audit_log", window_start: "2026-08-10T00:00:00Z", entry_count_sealed: 5, entry_count_now: 5, digest_ok: true, link_ok: true },
        { source: "confidential_read", window_start: "2026-08-10T00:00:00Z", entry_count_sealed: 2, entry_count_now: 3, digest_ok: false, link_ok: true },
      ],
      error: null,
    })
    const body = await (await GET(req, { params: Promise.resolve({ id: TENANT }) })).json()
    expect(body.intact).toBe(false)
    expect(body.sources).toEqual([
      { source: "audit_log", windows_checked: 1, intact: true, last_window_start: "2026-08-10T00:00:00Z" },
      { source: "confidential_read", windows_checked: 1, intact: false, last_window_start: "2026-08-10T00:00:00Z" },
    ])
    expect(body.findings).toHaveLength(1)
    expect(body.findings[0].source).toBe("confidential_read")
  })
})
