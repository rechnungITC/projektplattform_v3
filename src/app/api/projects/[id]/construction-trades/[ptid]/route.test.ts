import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-α route, tests added in PROJ-45-β (AC-45βH-7).
//
// The child trade route shipped in α without tests. β changes its DELETE branch,
// because a defect now holds the trade with no ON DELETE clause (lock L16): the
// block arrives as 23503 and previously fell through to a 500 carrying raw
// database text. The load-bearing assertions below are that it now answers 409
// and that the message NAMES the blocking defects.

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

import { DELETE, PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const PTID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

interface Recorded {
  tables: string[]
  eq: Array<[string, unknown]>
  limit: number[]
}
let rec: Recorded

/**
 * `results` is consumed in `from()` order. For the blocked delete that is:
 * 1) the delete itself (23503), 2) the lookup that names the blockers.
 */
function supa(results: Array<{ data: unknown; error: unknown }>) {
  const queue = [...results]
  return {
    from: vi.fn((table: string) => {
      rec.tables.push(table)
      const result = queue.shift() ?? { data: null, error: null }
      const c: Record<string, unknown> = {}
      const settle = async () => result
      c.select = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.delete = vi.fn(() => c)
      c.eq = vi.fn((col: string, val: unknown) => {
        rec.eq.push([col, val])
        return c
      })
      c.limit = vi.fn(async (n: number) => {
        rec.limit.push(n)
        return result
      })
      c.maybeSingle = settle
      c.single = settle
      // The delete chain has no terminal call — it ends on `.eq(...)` and is
      // awaited directly — so the chain itself has to be thenable.
      c.then = (resolve: (v: unknown) => void) => resolve(result)
      return c
    }),
    rpc: vi.fn(),
  }
}

function ctx(id: string = PROJECT, ptid: string = PTID) {
  return { params: Promise.resolve({ id, ptid }) }
}

beforeEach(() => {
  rec = { tables: [], eq: [], limit: [] }
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa([{ data: null, error: null }]),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("DELETE /api/projects/[id]/construction-trades/[ptid]", () => {
  it("rejects a malformed id before touching auth", async () => {
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx("nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa([{ data: null, error: null }]),
    })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(401)
  })

  it("requires the edit action", async () => {
    await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
  })

  it("uses a write intent on the module gate", async () => {
    await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(moduleMock).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      "construction",
      { intent: "write" }
    )
  })

  it("forwards a module denial", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: {} }), { status: 403 })
    )
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(403)
  })

  it("removes the assignment on the happy path without pre-counting defects", async () => {
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    // Exactly one table touched: no speculative defect query on success.
    expect(rec.tables).toEqual(["project_construction_trades"])
  })

  it("answers 409 and NAMES the blocking defects instead of a raw 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: null, error: { code: "23503", message: 'violates foreign key "construction_defects_trade_id_fkey"' } },
        {
          data: [
            { defect_number: 4, title: "Riss in der Wand" },
            { defect_number: 9, title: "Fuge undicht" },
          ],
          error: null,
        },
      ]),
    })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe("defects_present")
    expect(body.error.message).toContain("#4 Riss in der Wand")
    expect(body.error.message).toContain("#9 Fuge undicht")
    // And it must not leak the raw constraint text.
    expect(body.error.message).not.toContain("foreign key")
    expect(rec.tables).toEqual([
      "project_construction_trades",
      "construction_defects",
    ])
    expect(rec.limit).toEqual([10])
  })

  it("still answers 409 when the blockers cannot be named", async () => {
    // RLS could hide them, or the lookup could fail — a 500 would be wrong
    // either way: the delete WAS refused for a known, explainable reason.
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: null, error: { code: "23503", message: "fk" } },
        { data: null, error: { code: "XX000", message: "boom" } },
      ]),
    })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toContain("Mängel")
  })

  it("keeps mapping a permission refusal to 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([{ data: null, error: { code: "42501", message: "no" } }]),
    })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(403)
  })

  it("keeps mapping every other failure to 500 delete_failed", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([{ data: null, error: { code: "XX000", message: "boom" } }]),
    })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("delete_failed")
  })
})

describe("PATCH /api/projects/[id]/construction-trades/[ptid]", () => {
  function patch(body: unknown) {
    return PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
      ctx()
    )
  }

  it("rejects an empty patch", async () => {
    expect((await patch({})).status).toBe(422)
  })

  it("rejects an unknown traffic-light value", async () => {
    expect((await patch({ rag_status: "blau" })).status).toBe(422)
  })

  it("answers 404 when the assignment does not exist in this project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([{ data: null, error: null }]),
    })
    expect((await patch({ rag_status: "rot" })).status).toBe(404)
  })
})
