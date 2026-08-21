import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-β — defect PATCH route tests.
//
// Two things matter here beyond the usual gating: the clear-switch contract (an
// omitted value must NOT be read as "empty", and a value plus its own switch is
// ambiguous), and the fact that the route gates at "view" so the stricter-than-
// house role rule lives only in the RPC.

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

import { PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DEFECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const VENDOR = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const SECTION = "ffffffff-6666-4666-8666-ffffffffffff"

let lastRpc: { fn: string; args: Record<string, unknown> } | undefined
let ownedRow: { data: unknown; error: unknown } = {
  data: { id: DEFECT },
  error: null,
}

function supa(rpcResult: { data: unknown; error: unknown }) {
  return {
    // The ownership probe is a READ and is allowed; every WRITE must still go
    // through the RPC, so the mutating verbs keep throwing. `ownedRow` lets a
    // test simulate "defect belongs to another project" by returning null.
    from: vi.fn((table: string) => {
      if (table !== "construction_defects") {
        throw new Error(`unexpected table read: ${table}`)
      }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => ownedRow)
      for (const verb of ["insert", "update", "delete", "upsert"]) {
        chain[verb] = vi.fn(() => {
          throw new Error("PATCH must go through the RPC, not a direct table write")
        })
      }
      return chain
    }),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args }
      return rpcResult
    }),
  }
}

function ctx(id: string = PROJECT, did: string = DEFECT) {
  return { params: Promise.resolve({ id, did }) }
}
function req(body: unknown) {
  return new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) })
}
function withRpc(result: { data: unknown; error: unknown }) {
  getAuthMock.mockResolvedValue({ userId: ME, supabase: supa(result) })
}

beforeEach(() => {
  lastRpc = undefined
  ownedRow = { data: { id: DEFECT }, error: null }
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  withRpc({ data: { id: DEFECT, title: "Riss" }, error: null })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("PATCH /api/projects/[id]/construction-defects/[did]", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await PATCH(req({ title: "x" }), ctx("nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("rejects a malformed defect id before touching auth", async () => {
    const res = await PATCH(req({ title: "x" }), ctx(PROJECT, "nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect((await PATCH(req({ title: "x" }), ctx())).status).toBe(401)
  })

  it("forwards a project-access denial unchanged", async () => {
    accessMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: {} }), { status: 404 }),
    })
    expect((await PATCH(req({ title: "x" }), ctx())).status).toBe(404)
  })

  it("gates at view, leaving the stricter admin|lead rule to the RPC alone", async () => {
    await PATCH(req({ title: "x" }), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "view")
    expect(accessMock).not.toHaveBeenCalledWith(
      expect.anything(),
      PROJECT,
      ME,
      "edit"
    )
  })

  it("uses a write intent on the module gate (403, not 404)", async () => {
    await PATCH(req({ title: "x" }), ctx())
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
    expect((await PATCH(req({ title: "x" }), ctx())).status).toBe(403)
  })

  it("rejects a malformed body", async () => {
    const res = await PATCH(
      new Request("http://t/", { method: "PATCH", body: "{ nope" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("rejects an empty patch", async () => {
    expect((await PATCH(req({}), ctx())).status).toBe(422)
  })

  it("rejects an unknown severity", async () => {
    expect((await PATCH(req({ severity: "schlimm" }), ctx())).status).toBe(422)
  })

  it("rejects a deadline that is not YYYY-MM-DD", async () => {
    expect((await PATCH(req({ due_date: "morgen" }), ctx())).status).toBe(422)
  })

  it("patches through the RPC and returns the row", async () => {
    const res = await PATCH(req({ title: "Riss, breiter" }), ctx())
    expect(res.status).toBe(200)
    expect(lastRpc?.fn).toBe("update_construction_defect")
    expect(lastRpc?.args).toMatchObject({
      p_defect_id: DEFECT,
      p_title: "Riss, breiter",
    })
  })

  it("never passes an actor argument — the RPC reads auth.uid() itself", async () => {
    await PATCH(req({ title: "x" }), ctx())
    const keys = Object.keys(lastRpc?.args ?? {})
    expect(keys.filter((k) => /actor|caller/.test(k))).toEqual([])
  })

  describe("clear-switch contract", () => {
    it("sends every switch as false when nothing is being emptied", async () => {
      await PATCH(req({ title: "x" }), ctx())
      expect(lastRpc?.args).toMatchObject({
        p_clear_description: false,
        p_clear_section: false,
        p_clear_due_date: false,
        p_clear_responsible: false,
        p_clear_vendor: false,
      })
    })

    it("does NOT read an omitted field as an instruction to empty it", async () => {
      // The PROJ-122 defect in reverse: omitting a value must leave it alone.
      await PATCH(req({ title: "x" }), ctx())
      expect(lastRpc?.args.p_due_date).toBeNull()
      expect(lastRpc?.args.p_clear_due_date).toBe(false)
    })

    it("forwards an explicit clear switch", async () => {
      await PATCH(req({ clear_due_date: true, clear_vendor: true }), ctx())
      expect(lastRpc?.args).toMatchObject({
        p_clear_due_date: true,
        p_clear_vendor: true,
        p_due_date: null,
        p_vendor_id: null,
      })
    })

    it("refuses a value together with its own clear switch as ambiguous", async () => {
      for (const body of [
        { description: "text", clear_description: true },
        { section_id: SECTION, clear_section: true },
        { due_date: "2026-09-01", clear_due_date: true },
        { responsible_user_id: ME, clear_responsible: true },
        { vendor_id: VENDOR, clear_vendor: true },
      ]) {
        const res = await PATCH(req(body), ctx())
        expect(res.status, JSON.stringify(body)).toBe(422)
      }
    })

    it("offers no switch for the trade, which stays mandatory", async () => {
      const res = await PATCH(req({ clear_trade: true }), ctx())
      // Unknown key alone -> the "at least one field" refine still bites.
      expect(res.status).toBe(422)
    })
  })

  describe("error mapping", () => {
    const cases: Array<[string, number, string]> = [
      ["42501", 403, "forbidden"],
      ["23514", 422, "constraint_violation"],
      ["22023", 422, "invalid_value"],
      ["23503", 422, "invalid_reference"],
      ["23505", 409, "duplicate_key"],
      ["P0002", 404, "not_found"],
    ]

    for (const [pgCode, status, apiCode] of cases) {
      it(`maps ${pgCode} to ${status} ${apiCode}`, async () => {
        withRpc({ data: null, error: { code: pgCode, message: "m" } })
        const res = await PATCH(req({ title: "x" }), ctx())
        expect(res.status).toBe(status)
        expect((await res.json()).error.code).toBe(apiCode)
      })
    }

    it("maps anything else to 500 update_failed", async () => {
      withRpc({ data: null, error: { code: "XX000", message: "boom" } })
      const res = await PATCH(req({ title: "x" }), ctx())
      expect(res.status).toBe(500)
      expect((await res.json()).error.code).toBe("update_failed")
    })

    it("answers 404 when the RPC returns no row", async () => {
      withRpc({ data: null, error: null })
      expect((await PATCH(req({ title: "x" }), ctx())).status).toBe(404)
    })
  })

  it("404s when the defect belongs to another project and never calls the RPC", async () => {
    // The RPC authorises against the defect's OWN project, so without this probe
    // a mutation would land in project B through project A's URL. Asserting that
    // the RPC was never reached is the point — a 404 alone could also come from
    // the RPC itself, which would mean the write had already been attempted.
    ownedRow = { data: null, error: null }
    const res = await PATCH(req({ title: "Fremd" }), ctx())
    expect(res.status).toBe(404)
    expect(lastRpc).toBeUndefined()
  })
})
