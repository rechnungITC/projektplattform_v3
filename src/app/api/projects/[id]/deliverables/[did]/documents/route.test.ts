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

import { DELETE, GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DID = "dddddddd-4444-4444-8444-dddddddddddd"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

// maybeSingle => deliverable lookup; single => inserted doc; awaiting => list/delete.
function supa(opts: {
  deliverable?: { data: unknown; error: unknown }
  inserted?: { data: unknown; error: unknown }
  listOrDelete?: { data: unknown; error: unknown }
}) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) =>
      resolve(opts.listOrDelete ?? { data: [], error: null }),
  }
  for (const m of ["select", "eq", "order", "insert", "delete"]) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => opts.deliverable ?? { data: null, error: null })
  chain.single = vi.fn(async () => opts.inserted ?? { data: null, error: null })
  return { from: vi.fn(() => chain) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, did: DID }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe(".../deliverables/[did]/documents", () => {
  it("GET 401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("GET lists (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ listOrDelete: { data: [{ id: DOC }], error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).documents).toHaveLength(1)
  })

  it("POST 400 on bad url", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      new Request("http://t", { method: "POST", body: JSON.stringify({ title: "X", url: "not-a-url" }) }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("POST 404 when deliverable missing", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ deliverable: { data: null, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      new Request("http://t", { method: "POST", body: JSON.stringify({ title: "LOI", url: "https://vdr/loi" }) }),
      ctx()
    )
    expect(res.status).toBe(404)
  })

  it("POST 201 creates a doc link", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        deliverable: { data: { id: DID, tenant_id: "t1" }, error: null },
        inserted: { data: { id: DOC, title: "LOI" }, error: null },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      new Request("http://t", { method: "POST", body: JSON.stringify({ title: "LOI", url: "https://vdr/loi" }) }),
      ctx()
    )
    expect(res.status).toBe(201)
    expect((await res.json()).document.id).toBe(DOC)
  })

  it("DELETE 400 without document_id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), ctx())
    expect(res.status).toBe(400)
  })

  it("DELETE 200 with document_id", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ listOrDelete: { data: null, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(
      new Request(`http://t?document_id=${DOC}`, { method: "DELETE" }),
      ctx()
    )
    expect(res.status).toBe(200)
  })
})
