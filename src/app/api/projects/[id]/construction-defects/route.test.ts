import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-β — defect list/create route tests.
// Harness mirrors construction-sections/route.test.ts: auth, project access and
// the module gate are stubbed so the assertions target THIS route's gating,
// filtering, validation and error mapping. The role rules themselves live in the
// SECURITY DEFINER RPCs and are proven in tests/sql/PROJ-45-beta-*-pentest.sql.

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

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TRADE = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const SECTION = "ffffffff-6666-4666-8666-ffffffffffff"

interface Calls {
  eq: Array<[string, unknown]>
  in: Array<[string, unknown]>
  lt: Array<[string, unknown]>
  or: string[]
  order: Array<[string, unknown]>
  select: string[]
}
let calls: Calls
let lastRpc: { fn: string; args: Record<string, unknown> } | undefined

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn((cols: string) => {
    calls.select.push(cols)
    return c
  })
  c.eq = vi.fn((col: string, val: unknown) => {
    calls.eq.push([col, val])
    return c
  })
  c.in = vi.fn((col: string, val: unknown) => {
    calls.in.push([col, val])
    return c
  })
  c.lt = vi.fn((col: string, val: unknown) => {
    calls.lt.push([col, val])
    return c
  })
  c.or = vi.fn((expr: string) => {
    calls.or.push(expr)
    return c
  })
  c.order = vi.fn((col: string, opts: unknown) => {
    calls.order.push([col, opts])
    return c
  })
  c.limit = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  c.single = vi.fn(async () => result)
  return c
}

function supa(
  result: { data: unknown; error: unknown },
  rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
) {
  return {
    from: vi.fn(() => chain(result)),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args }
      return rpcResult
    }),
  }
}

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function getReq(query = "") {
  return new Request(`http://t/construction-defects${query}`)
}
function postReq(body: unknown) {
  return new Request("http://t/construction-defects", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  calls = { eq: [], in: [], lt: [], or: [], order: [], select: [] }
  lastRpc = undefined
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa({ data: [], error: null }),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-defects", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await GET(getReq(), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: [], error: null }),
    })
    expect((await GET(getReq(), ctx())).status).toBe(401)
  })

  it("forwards a project-access denial unchanged", async () => {
    const denial = new Response(JSON.stringify({ error: {} }), { status: 404 })
    accessMock.mockResolvedValue({ error: denial })
    expect((await GET(getReq(), ctx())).status).toBe(404)
  })

  it("reads with the view action, not an edit action", async () => {
    await GET(getReq(), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "view")
  })

  it("answers as if the surface did not exist when the module is off", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 })
    )
    expect((await GET(getReq(), ctx())).status).toBe(404)
  })

  it("uses a read intent on the module gate", async () => {
    await GET(getReq(), ctx())
    // No options object at all -> requireModuleActive's own default is "read".
    expect(moduleMock).toHaveBeenCalledWith(expect.anything(), TENANT, "construction")
  })

  it("returns the defect list for a member", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: [{ id: "d1", defect_number: 1, title: "Riss" }],
        error: null,
      }),
    })
    const res = await GET(getReq(), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).defects).toHaveLength(1)
  })

  it("selects explicit columns, never a wildcard", async () => {
    await GET(getReq(), ctx())
    expect(calls.select[0]).not.toContain("*")
    expect(calls.select[0]).toContain("defect_number")
    expect(calls.select[0]).toContain("reported_done_by")
    // Catalog label is joined two levels deep, never copied down (lock L7).
    expect(calls.select[0]).toContain("trade:construction_trades(id, key, label)")
  })

  it("orders by defect number ascending", async () => {
    await GET(getReq(), ctx())
    expect(calls.order).toEqual([["defect_number", { ascending: true }]])
  })

  it("scopes to the project and applies the trade filter", async () => {
    await GET(getReq(`?trade_id=${TRADE}`), ctx())
    expect(calls.eq).toEqual(
      expect.arrayContaining([
        ["project_id", PROJECT],
        ["trade_id", TRADE],
      ])
    )
  })

  it("applies the section, status and severity filters", async () => {
    await GET(
      getReq(`?section_id=${SECTION}&status=in_bearbeitung&severity=gravierend`),
      ctx()
    )
    expect(calls.eq).toEqual(
      expect.arrayContaining([
        ["section_id", SECTION],
        ["status", "in_bearbeitung"],
        ["severity", "gravierend"],
      ])
    )
  })

  it("ignores filter values that are not part of the vocabulary", async () => {
    await GET(getReq("?status=nonsense&severity=katastrophal&trade_id=nope"), ctx())
    const cols = calls.eq.map(([col]) => col)
    expect(cols).toEqual(["project_id"])
  })

  it("filters overdue rows on both axes: lapsed deadline AND non-terminal status", async () => {
    await GET(getReq("?overdue=true"), ctx())
    expect(calls.lt[0][0]).toBe("due_date")
    expect(calls.lt[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // `erledigt` is excluded on purpose: the review is pending there.
    expect(calls.in).toEqual([["status", ["offen", "in_bearbeitung"]]])
  })

  it("treats a null deadline as not overdue when asked for the complement", async () => {
    await GET(getReq("?overdue=false"), ctx())
    expect(calls.or[0]).toContain("due_date.is.null")
    expect(calls.lt).toHaveLength(0)
  })

  it("maps a list failure to 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "XX000", message: "boom" } }),
    })
    expect((await GET(getReq(), ctx())).status).toBe(500)
  })
})

describe("POST /api/projects/[id]/construction-defects", () => {
  const body = { title: "Riss in der Wand", trade_id: TRADE }

  it("gates at the view action, because viewers may report defects (lock L15)", async () => {
    await POST(postReq(body), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "view")
    expect(accessMock).not.toHaveBeenCalledWith(
      expect.anything(),
      PROJECT,
      ME,
      "edit"
    )
  })

  it("uses a write intent on the module gate (403, not 404)", async () => {
    await POST(postReq(body), ctx())
    expect(moduleMock).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      "construction",
      { intent: "write" }
    )
  })

  it("forwards a module denial", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "module_disabled" } }), {
        status: 403,
      })
    )
    expect((await POST(postReq(body), ctx())).status).toBe(403)
  })

  it("rejects a malformed project id before touching auth", async () => {
    const res = await POST(postReq(body), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(401)
  })

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("http://t/", { method: "POST", body: "{ nope" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("rejects an empty title", async () => {
    expect((await POST(postReq({ ...body, title: "" }), ctx())).status).toBe(422)
  })

  it("rejects a missing trade, which is mandatory (lock L13)", async () => {
    expect((await POST(postReq({ title: "Riss" }), ctx())).status).toBe(422)
  })

  it("rejects an unknown severity", async () => {
    const res = await POST(postReq({ ...body, severity: "katastrophal" }), ctx())
    expect(res.status).toBe(422)
  })

  it("rejects a deadline that is not YYYY-MM-DD", async () => {
    const res = await POST(postReq({ ...body, due_date: "18.08.2026" }), ctx())
    expect(res.status).toBe(422)
  })

  it("creates through the RPC and answers 201", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: { id: "d1", defect_number: 7 }, error: null }
      ),
    })
    const res = await POST(postReq(body), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).defect).toMatchObject({ defect_number: 7 })
    expect(lastRpc?.fn).toBe("create_construction_defect")
    expect(lastRpc?.args).toMatchObject({
      p_project_id: PROJECT,
      p_title: "Riss in der Wand",
      p_trade_id: TRADE,
      p_severity: "gering",
    })
  })

  it("passes a null vendor when none is given, so the RPC pre-fills from the trade", async () => {
    await POST(postReq(body), ctx())
    expect(lastRpc?.args.p_vendor_id).toBeNull()
  })

  it("never passes an actor argument — the RPC reads auth.uid() itself", async () => {
    await POST(postReq(body), ctx())
    const keys = Object.keys(lastRpc?.args ?? {})
    expect(keys.filter((k) => /actor|user_id|caller/.test(k))).toEqual([])
  })

  it("maps a role refusal to 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "42501", message: "insufficient role" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(403)
  })

  it("maps a cross-project trade guard violation to 422", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "23514", message: "trade does not belong" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(422)
  })

  it("maps an unknown enum value from the RPC to 422", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "22023", message: "unknown severity" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(422)
  })

  it("maps a dangling reference to 422", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "23503", message: "fk" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(422)
  })

  it("maps a duplicate to 409", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "dup" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(409)
  })

  it("maps a missing project to 404", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "P0002", message: "project not found" } }
      ),
    })
    expect((await POST(postReq(body), ctx())).status).toBe(404)
  })

  it("maps anything else to 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        { data: null, error: null },
        { data: null, error: { code: "XX000", message: "boom" } }
      ),
    })
    const res = await POST(postReq(body), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("create_failed")
  })
})
