// @vitest-environment node
//
// PROJ-45-ε / AC-45ε.15 + AC-45ε.19 — Fotozähler je Anker.

import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, moduleMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  moduleMock: vi.fn(),
}))

vi.mock("../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})
vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: moduleMock,
}))

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

const rpcCalls: string[] = []
function client(result: { data?: unknown; error?: unknown }) {
  return {
    from: vi.fn(),
    rpc: vi.fn(async (fn: string) => {
      rpcCalls.push(fn)
      return { data: result.data ?? null, error: result.error ?? null }
    }),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  rpcCalls.length = 0
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  moduleMock.mockResolvedValue(null)
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
})

describe("GET /construction-photos/counts", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: client({}) })
    expect((await GET(new Request("http://t/c"), ctx())).status).toBe(401)
    expect(rpcCalls).toHaveLength(0)
  })

  it("liest die Zähler über die INVOKER-Auswertung, nicht über eigene Summen", async () => {
    const counts = { project_id: PROJECT, total: 3, by_section: { s1: 3 } }
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client({ data: counts }) })
    const res = await GET(new Request("http://t/c"), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ counts })
    // Genau eine Quelle: die Auswertung. Keine zweite Zählung in der Route.
    expect(rpcCalls).toEqual(["construction_photo_counts"])
  })

  it("Modul aus: antwortet, als gäbe es die Fläche nicht (AC-45ε.18)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client({}) })
    moduleMock.mockResolvedValue(new Response(null, { status: 404 }) as never)
    expect((await GET(new Request("http://t/c"), ctx())).status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  it("403 wenn die Auswertung die Mitgliedschaft abweist", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ error: { code: "42501", message: "kein Mitglied" } }),
    })
    expect((await GET(new Request("http://t/c"), ctx())).status).toBe(403)
  })
})
