import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------
//
// Two query chains share the tenant_memberships table:
//   - membership-check (for the admin-of-tenant check)  -> uses .select().eq().eq().maybeSingle()
//   - mutation chain (for PATCH update / DELETE)        -> uses .update/.delete().eq().eq().select().maybeSingle()
//
// Disambiguate by which method is called first: .select() vs .update() vs .delete().

const getUserMock = vi.fn()

const membershipCheckChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const mutationChain = {
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

let nextChain: "check" | "mutate" = "check"

const fromMock = vi.fn(() => {
  if (nextChain === "check") {
    nextChain = "mutate"
    return membershipCheckChain
  }
  return mutationChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { DELETE, PATCH } from "./route"

// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-1111-1111-111111111111"
const CALLER_ID = "22222222-2222-2222-2222-222222222222"
const TARGET_ID = "33333333-3333-3333-3333-333333333333"

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/tenants/x/members/y", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeContext() {
  return {
    params: Promise.resolve({ id: TENANT_ID, userId: TARGET_ID }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  nextChain = "check"
  membershipCheckChain.select.mockReturnValue(membershipCheckChain)
  membershipCheckChain.eq.mockReturnValue(membershipCheckChain)
  mutationChain.update.mockReturnValue(mutationChain)
  mutationChain.delete.mockReturnValue(mutationChain)
  mutationChain.eq.mockReturnValue(mutationChain)
  mutationChain.select.mockReturnValue(mutationChain)
})

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

describe("PATCH /api/tenants/[id]/members/[userId]", () => {
  it("happy path: admin changes target's role, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    const updated = {
      id: "m1",
      tenant_id: TENANT_ID,
      user_id: TARGET_ID,
      role: "viewer",
      created_at: "now",
    }
    mutationChain.maybeSingle.mockResolvedValue({ data: updated, error: null })

    const res = await PATCH(makeRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ membership: updated })
    expect(mutationChain.update).toHaveBeenCalledWith({ role: "viewer" })
  })

  it("returns 400 on invalid role value", async () => {
    const res = await PATCH(makeRequest({ role: "owner" }), makeContext())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ role: "member" }), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })

    const res = await PATCH(makeRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(403)
    expect(mutationChain.update).not.toHaveBeenCalled()
  })

  it("maps last-admin trigger error to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    mutationChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "Tenant must have at least one admin" },
    })

    const res = await PATCH(makeRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("last_admin")
    expect(body.error.message).toContain("at least one admin")
  })

  it("returns 404 when target membership does not exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    mutationChain.maybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await PATCH(makeRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(404)
  })
})

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

describe("DELETE /api/tenants/[id]/members/[userId]", () => {
  function makeDeleteRequest(): Request {
    return new Request("http://localhost/api/tenants/x/members/y", {
      method: "DELETE",
    })
  }

  it("happy path: admin removes member, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    mutationChain.maybeSingle.mockResolvedValue({
      data: { id: "m1" },
      error: null,
    })

    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mutationChain.delete).toHaveBeenCalled()
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    })

    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(403)
  })

  it("maps last-admin trigger error to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    mutationChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "Tenant must have at least one admin" },
    })

    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("last_admin")
  })

  it("returns 404 when target membership does not exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: CALLER_ID } } })
    membershipCheckChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    mutationChain.maybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(404)
  })
})
