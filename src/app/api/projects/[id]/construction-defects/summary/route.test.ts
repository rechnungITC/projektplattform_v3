import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-β — defect summary route tests.
//
// The counters come from `construction_defect_summary`, which is SECURITY
// INVOKER. The route therefore has one non-obvious duty: call it with the
// SESSION-bound client. A service-role call would compute the aggregate outside
// the caller's RLS and leak the existence of hidden defects through the totals —
// the aggregate-leak class from CLAUDE.md. The harness proves the client the
// route uses is the one it was handed by the auth helper.

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
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

const SUMMARY = {
  project_id: PROJECT,
  totals: {
    total: 3,
    open: 1,
    in_progress: 1,
    awaiting_review: 1,
    reviewed: 0,
    dismissed: 0,
    overdue: 2,
  },
  by_trade: [
    {
      project_trade_id: "eeeeeeee-5555-4555-8555-eeeeeeeeeeee",
      trade_label: "Rohbau",
      total: 3,
      overdue: 2,
      awaiting_review: 1,
    },
  ],
}

let rpcMock: ReturnType<typeof vi.fn>

function supa(result: { data: unknown; error: unknown }) {
  rpcMock = vi.fn(async () => result)
  return { from: vi.fn(), rpc: rpcMock }
}

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa({ data: SUMMARY, error: null }),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-defects/summary", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await GET(new Request("http://t/"), ctx("nope"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: null, error: null }),
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

  it("returns the totals and the per-trade counters", async () => {
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.totals.overdue).toBe(2)
    expect(body.summary.by_trade[0].trade_label).toBe("Rohbau")
  })

  it("calls the INVOKER summary on the session-bound client, not a second one", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith("construction_defect_summary", {
      p_project_id: PROJECT,
    })
  })

  it("returns null rather than inventing an empty shape when the RPC yields nothing", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: null }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).summary).toBeNull()
  })

  it("maps an RPC failure to 500 summary_failed", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "XX000", message: "boom" } }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("summary_failed")
  })
})
