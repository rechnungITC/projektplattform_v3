import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-β — status transition route tests. The state machine, the mandatory
// reason and the four-eyes gate are database properties; here we prove the route
// validates the action vocabulary, forwards verbatim, and — crucially — that the
// four-eyes refusal reaches the caller as an explainable 403 rather than a bare
// "not allowed" that would read as a permission bug to a lead who holds the role.

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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DEFECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

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
          throw new Error("status changes must go through the RPC")
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
  return new Request("http://t/", { method: "POST", body: JSON.stringify(body) })
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
  withRpc({ data: { id: DEFECT, status: "in_bearbeitung" }, error: null })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("POST /api/projects/[id]/construction-defects/[did]/status", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await POST(req({ action: "in_arbeit" }), ctx("nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("rejects a malformed defect id before touching auth", async () => {
    const res = await POST(req({ action: "in_arbeit" }), ctx(PROJECT, "nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
    })
    expect((await POST(req({ action: "in_arbeit" }), ctx())).status).toBe(401)
  })

  it("forwards a project-access denial unchanged", async () => {
    accessMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: {} }), { status: 404 }),
    })
    expect((await POST(req({ action: "in_arbeit" }), ctx())).status).toBe(404)
  })

  it("gates at view, leaving the admin|lead rule to the RPC alone", async () => {
    await POST(req({ action: "in_arbeit" }), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "view")
  })

  it("uses a write intent on the module gate (403, not 404)", async () => {
    await POST(req({ action: "in_arbeit" }), ctx())
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
    expect((await POST(req({ action: "in_arbeit" }), ctx())).status).toBe(403)
  })

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("http://t/", { method: "POST", body: "{ nope" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("rejects an unknown action", async () => {
    expect((await POST(req({ action: "abnehmen" }), ctx())).status).toBe(422)
  })

  it("rejects a missing action", async () => {
    expect((await POST(req({ reason: "weil" }), ctx())).status).toBe(422)
  })

  it("accepts every action of the vocabulary", async () => {
    for (const action of [
      "in_arbeit",
      "fertigmelden",
      "pruefen",
      "zurueckweisen",
      "verwerfen",
      "wieder_aufnehmen",
    ]) {
      const res = await POST(req({ action, reason: "Begründung" }), ctx())
      expect(res.status, action).toBe(200)
      expect(lastRpc?.args.p_action).toBe(action)
    }
  })

  it("forwards the action and the reason to the RPC", async () => {
    await POST(req({ action: "zurueckweisen", reason: "Nicht behoben" }), ctx())
    expect(lastRpc?.fn).toBe("transition_construction_defect_status")
    expect(lastRpc?.args).toEqual({
      p_defect_id: DEFECT,
      p_action: "zurueckweisen",
      p_reason: "Nicht behoben",
    })
  })

  it("sends a null reason when none is given, letting the DB enforce the requirement", async () => {
    // The route does NOT pre-judge which actions need a reason — the database is
    // the single authority (and enforces it twice: function plus CHECK).
    await POST(req({ action: "verwerfen" }), ctx())
    expect(lastRpc?.args.p_reason).toBeNull()
  })

  it("never passes an actor argument — the RPC reads auth.uid() itself", async () => {
    await POST(req({ action: "pruefen" }), ctx())
    const keys = Object.keys(lastRpc?.args ?? {})
    expect(keys.filter((k) => /actor|caller|user_id/.test(k))).toEqual([])
  })

  it("surfaces the four-eyes refusal as 403 WITH its explanation", async () => {
    withRpc({
      data: null,
      error: {
        code: "42501",
        message: "four-eyes: the reporter cannot approve their own completion",
      },
    })
    const res = await POST(req({ action: "pruefen" }), ctx())
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toContain("four-eyes")
  })

  it("maps a disallowed transition to 422, not 500", async () => {
    withRpc({
      data: null,
      error: { code: "23514", message: "action pruefen not allowed from status offen" },
    })
    const res = await POST(req({ action: "pruefen" }), ctx())
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("constraint_violation")
  })

  it("maps a missing reason to 422", async () => {
    withRpc({
      data: null,
      error: { code: "23514", message: "a reason is required for verwerfen" },
    })
    expect((await POST(req({ action: "verwerfen" }), ctx())).status).toBe(422)
  })

  it("maps an unknown action rejected by the RPC to 422", async () => {
    withRpc({ data: null, error: { code: "22023", message: "unknown action" } })
    const res = await POST(req({ action: "in_arbeit" }), ctx())
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_value")
  })

  it("maps a missing defect to 404", async () => {
    withRpc({ data: null, error: { code: "P0002", message: "not found" } })
    expect((await POST(req({ action: "in_arbeit" }), ctx())).status).toBe(404)
  })

  it("maps anything else to 500 transition_failed", async () => {
    withRpc({ data: null, error: { code: "XX000", message: "boom" } })
    const res = await POST(req({ action: "in_arbeit" }), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("transition_failed")
  })

  it("404s when the defect belongs to another project and never calls the RPC", async () => {
    // Same reasoning as the PATCH route: the status transition must not be
    // reachable through a foreign project's address.
    ownedRow = { data: null, error: null }
    const res = await POST(req({ action: "fertigmelden" }), ctx())
    expect(res.status).toBe(404)
    expect(lastRpc).toBeUndefined()
  })
})
