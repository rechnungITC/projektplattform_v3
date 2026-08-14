import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-α — construction section tree route tests.
// Harness mirrors the PROJ-104 deliverables tests: auth and project access are
// stubbed so the assertions target THIS route's gating, validation and error
// mapping. Tree integrity itself (cycles, orphans, sibling labels) is a
// database property and is proven in tests/sql/PROJ-45-*-pentest.sql.

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

let lastInsert: Record<string, unknown> | undefined

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order"]) c[m] = vi.fn(() => c)
  c.insert = vi.fn((payload: Record<string, unknown>) => {
    lastInsert = payload
    return c
  })
  for (const t of ["limit", "single", "maybeSingle"]) c[t] = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function postReq(body: unknown) {
  return new Request("http://t/construction-sections", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  lastInsert = undefined
  getAuthMock.mockReset()
  accessMock.mockReset()
  getAuthMock.mockResolvedValue({
    userId: ME,
    supabase: supa({ data: [], error: null }),
  })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-sections", () => {
  it("rejects a malformed project id before touching auth", async () => {
    const res = await GET(new Request("http://t/"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("forwards a project-access denial unchanged", async () => {
    const denial = new Response(JSON.stringify({ error: {} }), { status: 404 })
    accessMock.mockResolvedValue({ error: denial })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })

  it("returns the flat tree for a member", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "s1", label: "Haus A", parent_id: null }], error: null }),
    })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).sections).toHaveLength(1)
  })

  it("reads with the view action, not an edit action", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(accessMock).toHaveBeenCalledWith(
      expect.anything(),
      PROJECT,
      ME,
      "view"
    )
  })

  it("answers as if the surface did not exist when the construction module is off", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 })
    )
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })
})

describe("POST /api/projects/[id]/construction-sections", () => {
  it("requires the edit action", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "s1" }, error: null }),
    })
    await POST(postReq({ label: "Haus A" }), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
  })

  it("rejects an empty label", async () => {
    expect((await POST(postReq({ label: "" }), ctx())).status).toBe(422)
  })

  it("rejects a non-uuid parent", async () => {
    const res = await POST(postReq({ label: "OG", parent_id: "nope" }), ctx())
    expect(res.status).toBe(422)
  })

  it("rejects a malformed body", async () => {
    const res = await POST(
      new Request("http://t/", { method: "POST", body: "{ nope" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("stamps project, tenant and author onto the row", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "s1" }, error: null }),
    })
    const res = await POST(postReq({ label: "Haus A" }), ctx())
    expect(res.status).toBe(201)
    expect(lastInsert).toMatchObject({
      label: "Haus A",
      project_id: PROJECT,
      tenant_id: TENANT,
      created_by: ME,
    })
  })

  it("maps a duplicate sibling label to 409, not 500", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23505", message: "dup" } }),
    })
    expect((await POST(postReq({ label: "2. OG" }), ctx())).status).toBe(409)
  })

  it("maps a guard violation (cross-project parent) to 422", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "guard" } }),
    })
    expect((await POST(postReq({ label: "OG" }), ctx())).status).toBe(422)
  })
})
