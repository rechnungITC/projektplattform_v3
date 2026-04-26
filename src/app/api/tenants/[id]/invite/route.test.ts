import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

const getUserMock = vi.fn()
const inviteUserByEmailMock = vi.fn()

// User-context (SSR) supabase client. Backed by a chainable membership query.
const membershipQueryMock = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const fromMock = vi.fn().mockReturnValue(membershipQueryMock)

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: inviteUserByEmailMock,
      },
    },
  })),
}))

import { POST } from "./route"

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-1111-1111-111111111111"
const ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222"

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/tenants/x/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeContext() {
  return { params: Promise.resolve({ id: TENANT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  membershipQueryMock.select.mockReturnValue(membershipQueryMock)
  membershipQueryMock.eq.mockReturnValue(membershipQueryMock)
})

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("POST /api/tenants/[id]/invite", () => {
  it("happy path: validates, checks admin, sends invite, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } })
    membershipQueryMock.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    inviteUserByEmailMock.mockResolvedValue({ data: {}, error: null })

    const res = await POST(
      makeRequest({ email: "new@firma.de", role: "member" }),
      makeContext()
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(inviteUserByEmailMock).toHaveBeenCalledWith("new@firma.de", {
      data: {
        invited_to_tenant: TENANT_ID,
        invited_role: "member",
      },
    })
  })

  it("returns 400 on validation error (missing role)", async () => {
    const res = await POST(
      makeRequest({ email: "x@y.de" }),
      makeContext()
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 on invalid email", async () => {
    const res = await POST(
      makeRequest({ email: "not-an-email", role: "member" }),
      makeContext()
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost/", {
      method: "POST",
      body: "{not json",
    })
    const res = await POST(req, makeContext())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  it("returns 401 when no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res = await POST(
      makeRequest({ email: "a@b.de", role: "member" }),
      makeContext()
    )
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("unauthorized")
  })

  it("returns 403 when caller is a non-admin member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } })
    membershipQueryMock.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })

    const res = await POST(
      makeRequest({ email: "a@b.de", role: "member" }),
      makeContext()
    )
    expect(res.status).toBe(403)
    expect(inviteUserByEmailMock).not.toHaveBeenCalled()
  })

  it("returns 403 when caller has no membership at all", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } })
    membershipQueryMock.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })

    const res = await POST(
      makeRequest({ email: "a@b.de", role: "member" }),
      makeContext()
    )
    expect(res.status).toBe(403)
  })

  it("surfaces invite errors as 4xx/5xx", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_USER_ID } } })
    membershipQueryMock.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    inviteUserByEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Email already registered", status: 422 },
    })

    const res = await POST(
      makeRequest({ email: "dup@x.de", role: "member" }),
      makeContext()
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invite_failed")
    expect(body.error.message).toContain("already registered")
  })
})
