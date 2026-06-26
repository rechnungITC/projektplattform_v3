import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order"]) c[m] = vi.fn(() => c)
  c.limit = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/dd-questions/export", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/export"), ctx())).status).toBe(401)
  })

  it("forwards access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t/export"), ctx())).status).toBe(403)
  })

  it("returns CSV with header + scope marker + escaped cells", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: [
          { title: "Plain", priority: "high", status: "open" },
          { title: "=SUM(A1)", detail: "has, comma", priority: "low", status: "closed" },
        ],
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/export"), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toContain("eigene-sicht")
    expect(res.headers.get("X-Export-Scope")).toBe("questions-visible-to-caller")
    const text = await res.text()
    expect(text.split("\n")[0]).toContain("title,detail,addressee")
    // formula-injection cell is neutralised + quoted
    expect(text).toContain("\"'=SUM(A1)\"")
    expect(text).toContain('"has, comma"')
  })
})
