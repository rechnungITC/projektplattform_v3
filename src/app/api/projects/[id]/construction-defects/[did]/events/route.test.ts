import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-β — defect history route tests.
//
// The load-bearing assertion is the ownership check: a VALID defect id from
// another project must answer 404 instead of serving its history under this
// project's URL. RLS already hides foreign rows, but the route must not depend on
// that alone — a defect the caller can legitimately read in project A must not be
// readable through project B's path.

const { getAuthMock, accessMock, moduleMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  moduleMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
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
const DEFECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

interface Recorded {
  tables: string[]
  eq: Array<[string, unknown]>
  order: Array<[string, unknown]>
  select: string[]
}
let rec: Recorded

/**
 * Two `from()` calls happen in order: the ownership lookup, then the events.
 * The queue lets each answer differently so the ownership branch is testable.
 */
function supa(
  ownership: { data: unknown; error: unknown },
  events: { data: unknown; error: unknown }
) {
  const results = [ownership, events]
  return {
    from: vi.fn((table: string) => {
      rec.tables.push(table)
      const result = results.shift() ?? { data: null, error: null }
      const c: Record<string, unknown> = {}
      c.select = vi.fn((cols: string) => {
        rec.select.push(cols)
        return c
      })
      c.eq = vi.fn((col: string, val: unknown) => {
        rec.eq.push([col, val])
        return c
      })
      c.order = vi.fn((col: string, opts: unknown) => {
        rec.order.push([col, opts])
        return c
      })
      c.maybeSingle = vi.fn(async () => result)
      c.limit = vi.fn(async () => result)
      return c
    }),
    rpc: vi.fn(),
  }
}

function ctx(id: string = PROJECT, did: string = DEFECT) {
  return { params: Promise.resolve({ id, did }) }
}
const OWNED = { data: { id: DEFECT }, error: null }

beforeEach(() => {
  rec = { tables: [], eq: [], order: [], select: [] }
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa(OWNED, { data: [], error: null }),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-defects/[did]/events", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await GET(new Request("http://t/"), ctx("nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("rejects a malformed defect id before touching auth", async () => {
    const res = await GET(new Request("http://t/"), ctx(PROJECT, "nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa(OWNED, { data: [], error: null }),
    })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("forwards a project-access denial unchanged", async () => {
    accessMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: {} }), { status: 404 }),
    })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })

  it("reads with the view action", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "view")
  })

  it("answers as if the surface did not exist when the module is off", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 })
    )
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })

  it("uses a read intent on the module gate", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(moduleMock).toHaveBeenCalledWith(expect.anything(), TENANT, "construction")
  })

  it("verifies the defect belongs to THIS project before reading its history", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(rec.tables[0]).toBe("construction_defects")
    expect(rec.eq).toEqual(
      expect.arrayContaining([
        ["id", DEFECT],
        ["project_id", PROJECT],
      ])
    )
  })

  it("answers 404 for a defect that belongs to another project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }, { data: [], error: null }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(404)
    // The history query must not have run at all.
    expect(rec.tables).toEqual(["construction_defects"])
  })

  it("returns the history oldest first", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(OWNED, {
        data: [
          { id: "e1", event_type: "angelegt" },
          { id: "e2", event_type: "fertiggemeldet" },
        ],
        error: null,
      }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).events).toHaveLength(2)
    expect(rec.tables[1]).toBe("construction_defect_events")
    expect(rec.order).toEqual([["created_at", { ascending: true }]])
  })

  it("selects explicit event columns, never a wildcard", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(rec.select[1]).not.toContain("*")
    expect(rec.select[1]).toContain("event_type")
    expect(rec.select[1]).toContain("status_before")
    expect(rec.select[1]).toContain("reason")
  })

  it("maps an ownership lookup failure to 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: { code: "XX000", message: "boom" } },
        { data: [], error: null }
      ),
    })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(500)
  })

  it("maps a history read failure to 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(OWNED, {
        data: null,
        error: { code: "XX000", message: "boom" },
      }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("list_failed")
  })
})
