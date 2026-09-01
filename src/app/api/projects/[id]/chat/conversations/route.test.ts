/**
 * PROJ-151-α — Routentests für Unterhaltungen.
 *
 * Geprüft wird die REIHENFOLGE der Tore, nicht nur ihr Vorhandensein: Auth vor
 * Projektzugriff vor Modul-Tor. Ein vorgezogenes Modul-Tor würde je Modulzustand
 * unterschiedlich antworten und damit die Existenz der Fläche verraten.
 */

import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getAuthenticatedUserId = vi.fn()
const requireProjectAccess = vi.fn()
const requireModuleActive = vi.fn()

vi.mock("@/app/api/_lib/route-helpers", () => ({
  getAuthenticatedUserId: () => getAuthenticatedUserId(),
  requireProjectAccess: (...a: unknown[]) => requireProjectAccess(...a),
  apiError: (code: string, msg: string, status: number) =>
    NextResponse.json({ error: code, message: msg }, { status }),
}))
vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: (...a: unknown[]) => requireModuleActive(...a),
}))

import { GET, POST } from "./route"

const PROJECT = "11111111-1111-4111-8111-111111111111"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

function supabaseStub(rows: unknown[] = []) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ data: rows, error: null }) }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: rows[0] ?? null, error: null }) }) }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireModuleActive.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/chat/conversations", () => {
  it("weist ohne Anmeldung mit 401 ab", async () => {
    getAuthenticatedUserId.mockResolvedValue({ userId: null, supabase: supabaseStub() })
    const res = await GET(new Request("http://x"), ctx())
    expect(res.status).toBe(401)
    // Das Modul-Tor darf gar nicht erst befragt worden sein.
    expect(requireModuleActive).not.toHaveBeenCalled()
  })

  it("weist eine ungültige Projekt-Id mit 400 ab, bevor irgendetwas geladen wird", async () => {
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: "kein-uuid" }),
    })
    expect(res.status).toBe(400)
    expect(getAuthenticatedUserId).not.toHaveBeenCalled()
  })

  it("reicht die Absage des Projektzugriffs unverändert durch", async () => {
    getAuthenticatedUserId.mockResolvedValue({ userId: "u1", supabase: supabaseStub() })
    requireProjectAccess.mockResolvedValue({
      error: NextResponse.json({ error: "not_found" }, { status: 404 }),
    })
    const res = await GET(new Request("http://x"), ctx())
    expect(res.status).toBe(404)
    expect(requireModuleActive).not.toHaveBeenCalled()
  })

  it("antwortet 404, wenn das Modul aus ist — nicht 403 (Lese-Absicht verrät nichts)", async () => {
    getAuthenticatedUserId.mockResolvedValue({ userId: "u1", supabase: supabaseStub() })
    requireProjectAccess.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    requireModuleActive.mockResolvedValue(
      NextResponse.json({ error: "not_found" }, { status: 404 }),
    )
    const res = await GET(new Request("http://x"), ctx())
    expect(res.status).toBe(404)
  })

  it("liefert die Unterhaltungen, wenn alle Tore offen sind", async () => {
    getAuthenticatedUserId.mockResolvedValue({
      userId: "u1",
      supabase: supabaseStub([{ id: "c1", title: "Test" }]),
    })
    requireProjectAccess.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://x"), ctx())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      conversations: [{ id: "c1" }],
    })
  })
})

describe("POST /api/projects/[id]/chat/conversations", () => {
  beforeEach(() => {
    getAuthenticatedUserId.mockResolvedValue({
      userId: "u1",
      supabase: supabaseStub([{ id: "c1", title: "Neu" }]),
    })
    requireProjectAccess.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
  })

  it("weist einen leeren Titel mit 422 ab", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "  " }) }),
      ctx(),
    )
    expect(res.status).toBe(422)
  })

  it("weist einen fehlenden Rumpf mit 422 ab", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), ctx())
    expect(res.status).toBe(422)
  })

  it("fragt das Modul-Tor mit Schreib-Absicht", async () => {
    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "Neu" }) }),
      ctx(),
    )
    expect(requireModuleActive).toHaveBeenCalledWith(
      expect.anything(), "t1", "ai_chat", { intent: "write" },
    )
  })

  it("legt an und antwortet 201", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ title: "Neu" }) }),
      ctx(),
    )
    expect(res.status).toBe(201)
  })
})
