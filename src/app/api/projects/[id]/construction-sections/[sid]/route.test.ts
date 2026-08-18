import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-α route, tests added in PROJ-45-β (AC-45βH-7).
//
// The section child route shipped in α without tests. β changes its DELETE
// branch: a defect holds its section with no ON DELETE clause (lock L16), so the
// block arrives as 23503 and used to fall through to a 500 with raw database text.
//
// The subtle part is WHERE the blockers are looked up. `parent_id` cascades, so
// deleting a parent takes the whole subtree with it and a defect on a GRANDCHILD
// is what blocks the root. A flat `.eq("section_id", sid)` would report "no
// blockers" for exactly the case that failed, which is why the route calls the
// recursive RPC — and why the test asserts the RPC, not a table query.

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
const SID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const CHILD = "99999999-9999-4999-8999-999999999999"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

interface Recorded {
  tables: string[]
  eq: Array<[string, unknown]>
  rpc: Array<[string, unknown]>
}
let rec: Recorded

function supa(
  tableResult: { data: unknown; error: unknown },
  rpcResult: { data: unknown; error: unknown } = { data: [], error: null }
) {
  return {
    from: vi.fn((table: string) => {
      rec.tables.push(table)
      const c: Record<string, unknown> = {}
      const settle = async () => tableResult
      c.select = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.delete = vi.fn(() => c)
      c.eq = vi.fn((col: string, val: unknown) => {
        rec.eq.push([col, val])
        return c
      })
      c.maybeSingle = settle
      c.single = settle
      // The delete chain ends on `.eq(...)`, so the chain itself is thenable.
      c.then = (resolve: (v: unknown) => void) => resolve(tableResult)
      return c
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rec.rpc.push([fn, args])
      return rpcResult
    }),
  }
}

function ctx(id: string = PROJECT, sid: string = SID) {
  return { params: Promise.resolve({ id, sid }) }
}
function del() {
  return DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
}

beforeEach(() => {
  rec = { tables: [], eq: [], rpc: [] }
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa({ data: null, error: null }),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("DELETE /api/projects/[id]/construction-sections/[sid]", () => {
  it("rejects a malformed id before touching auth", async () => {
    const res = await DELETE(
      new Request("http://t/", { method: "DELETE" }),
      ctx(PROJECT, "nope")
    )
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect((await del()).status).toBe(401)
  })

  it("requires the edit action", async () => {
    await del()
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
  })

  it("uses a write intent on the module gate", async () => {
    await del()
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
    expect((await del()).status).toBe(403)
  })

  it("deletes the subtree on the happy path without pre-counting defects", async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(rec.rpc).toEqual([])
  })

  it("answers 409 and NAMES the blocking defects instead of a raw 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        {
          data: null,
          error: {
            code: "23503",
            message: 'violates foreign key "construction_defects_section_id_fkey"',
          },
        },
        {
          data: [
            { id: "d1", defect_number: 4, title: "Riss in der Wand", section_id: SID },
            { id: "d2", defect_number: 5, title: "Fuge undicht", section_id: CHILD },
          ],
          error: null,
        }
      ),
    })
    const res = await del()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe("defects_present")
    expect(body.error.message).toContain("#4 Riss in der Wand")
    expect(body.error.message).toContain("#5 Fuge undicht")
    expect(body.error.message).not.toContain("foreign key")
  })

  it("looks the blockers up through the recursive RPC, not a flat section filter", async () => {
    // A defect on a GRANDCHILD blocks the root, so a flat `.eq("section_id", …)`
    // would find nothing and the message would be silently wrong.
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: { code: "23503", message: "fk" } },
        {
          data: [
            { id: "d2", defect_number: 5, title: "Fuge undicht", section_id: CHILD },
          ],
          error: null,
        }
      ),
    })
    const res = await del()
    expect(res.status).toBe(409)
    expect(rec.rpc).toEqual([
      ["construction_section_blocking_defects", { p_section_id: SID }],
    ])
    // No second table query — the subtree walk lives in the RPC.
    expect(rec.tables).toEqual(["construction_sections"])
    // And the named blocker is the one on the descendant.
    expect((await res.json()).error.message).toContain("#5 Fuge undicht")
  })

  it("still answers 409 when the blockers cannot be named", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: { code: "23503", message: "fk" } },
        { data: null, error: { code: "XX000", message: "boom" } }
      ),
    })
    const res = await del()
    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toContain("Mängel")
  })

  it("names at most ten blockers", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: { code: "23503", message: "fk" } },
        {
          data: Array.from({ length: 25 }, (_, i) => ({
            id: `d${i}`,
            defect_number: i + 1,
            title: `M${i + 1}`,
            section_id: SID,
          })),
          error: null,
        }
      ),
    })
    const res = await del()
    const message = (await res.json()).error.message as string
    expect(message.split(",").length).toBe(10)
  })

  it("keeps mapping a permission refusal to 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "42501", message: "no" } }),
    })
    expect((await del()).status).toBe(403)
  })

  it("keeps mapping every other failure to 500 delete_failed", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "XX000", message: "boom" } }),
    })
    const res = await del()
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("delete_failed")
  })
})

describe("PATCH /api/projects/[id]/construction-sections/[sid]", () => {
  function patch(body: unknown) {
    return PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
      ctx()
    )
  }

  it("rejects an empty patch", async () => {
    expect((await patch({})).status).toBe(422)
  })

  it("refuses a node becoming its own parent", async () => {
    const res = await patch({ parent_id: SID })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_parent")
  })

  it("maps a deeper cycle rejected by the trigger to 422", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "cycle" } }),
    })
    const res = await patch({ parent_id: CHILD })
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("cycle_rejected")
  })

  it("answers 404 when the section does not exist in this project", async () => {
    expect((await patch({ label: "OG" })).status).toBe(404)
  })
})
