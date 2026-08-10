import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-119 — inner circle, embargo, gated export and access logging.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.in = vi.fn().mockReturnValue(c)
  c.order = vi.fn().mockReturnValue(c)
  c.limit = vi.fn()
  c.maybeSingle = vi.fn()
  return c
}
const queue: QueryChain[] = []
const fromMock = vi.fn(() => {
  const next = queue.shift()
  if (!next) throw new Error("from() queue empty")
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { redactInnerCircleContent } from "../_schema"
import { GET as GET_CONTENT } from "./content/route"
import { GET as GET_EXPORT } from "./export/route"
import { POST as POST_DISSOLVE } from "./dissolve/route"
import { POST as POST_EMBARGO } from "./embargo/route"
import {
  DELETE as DELETE_MEMBER,
  POST as POST_CIRCLE,
  PUT as PUT_MEMBER,
} from "./inner-circle/route"
import { POST as POST_MARK_SENT } from "./mark-sent/route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ENTRY = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const USER = "cccccccc-3333-4333-8333-cccccccccccc"
const ME = "dddddddd-4444-4444-8444-dddddddddddd"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, entryId: ENTRY }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  queue.push(proj)
}
function authed() {
  getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
  queueProjectView()
}
function post(body: unknown) {
  return new Request("http://t/", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

// ── B2 / H7 ────────────────────────────────────────────────────────────────
describe("redactInnerCircleContent (B2/H7)", () => {
  it("strips the body of an inner-circle row but keeps has_message", () => {
    const out = redactInnerCircleContent({
      id: "e1",
      is_inner_circle: true,
      message: "Mitarbeiterbrief",
    })
    expect(out.message).toBeNull()
    expect(out.has_message).toBe(true)
  })

  it("leaves a normal row untouched", () => {
    const out = redactInnerCircleContent({
      id: "e2",
      is_inner_circle: false,
      message: "Pressemitteilung",
    })
    expect(out.message).toBe("Pressemitteilung")
    expect(out.has_message).toBe(true)
  })

  it("reports has_message false for a blank body", () => {
    expect(
      redactInnerCircleContent({ is_inner_circle: true, message: "   " }).has_message
    ).toBe(false)
    expect(
      redactInnerCircleContent({ is_inner_circle: false, message: null }).has_message
    ).toBe(false)
  })
})

// ── content ────────────────────────────────────────────────────────────────
describe("GET …/content", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET_CONTENT(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("returns the body when the RPC allows it", async () => {
    authed()
    rpcMock.mockResolvedValue({
      data: [{ message: "Geheime Botschaft", allowed: true }],
      error: null,
    })
    const res = await GET_CONTENT(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe("Geheime Botschaft")
    expect(rpcMock).toHaveBeenCalledWith("read_communication_content", {
      p_entry_id: ENTRY,
    })
  })

  it("403 without leaking the body when the RPC denies", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: [{ message: null, allowed: false }], error: null })
    const res = await GET_CONTENT(new Request("http://t/"), ctx())
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain("Geheime")
  })
})

// ── inner circle ───────────────────────────────────────────────────────────
describe("…/inner-circle", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await POST_CIRCLE(post({ enabled: true }), ctx())).status).toBe(401)
  })

  it("400 on a non-boolean enabled flag", async () => {
    authed()
    expect((await POST_CIRCLE(post({ enabled: "yes" }), ctx())).status).toBe(400)
  })

  it("toggles the marking via the RPC", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: { id: ENTRY, is_inner_circle: true }, error: null })
    const res = await POST_CIRCLE(post({ enabled: true }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("set_communication_inner_circle", {
      p_entry_id: ENTRY,
      p_enabled: true,
    })
  })

  it("400 when adding a non-uuid member", async () => {
    authed()
    expect((await PUT_MEMBER(post({ user_id: "nope" }), ctx())).status).toBe(400)
  })

  it("adds a member via the RPC", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await PUT_MEMBER(post({ user_id: USER }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("add_communication_inner_circle_member", {
      p_entry_id: ENTRY,
      p_user_id: USER,
    })
  })

  it("400 when removing without a user_id", async () => {
    authed()
    const res = await DELETE_MEMBER(
      new Request("http://t/", { method: "DELETE" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("maps the last-member guard to 422", async () => {
    authed()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "the last inner-circle member cannot be removed" },
    })
    const res = await DELETE_MEMBER(
      new Request(`http://t/?user_id=${USER}`, { method: "DELETE" }),
      ctx()
    )
    expect(res.status).toBe(422)
  })
})

// ── dissolve ───────────────────────────────────────────────────────────────
describe("POST …/dissolve", () => {
  it("400 without a reason", async () => {
    authed()
    expect((await POST_DISSOLVE(post({ reason: "  " }), ctx())).status).toBe(400)
  })

  it("403 when the caller is not a tenant admin", async () => {
    authed()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "only a tenant admin can dissolve an inner circle" },
    })
    expect((await POST_DISSOLVE(post({ reason: "Legal" }), ctx())).status).toBe(403)
  })

  it("dissolves with a reason", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: { id: ENTRY, is_inner_circle: false }, error: null })
    const res = await POST_DISSOLVE(post({ reason: "Rechtsabteilung" }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("dissolve_inner_circle", {
      p_entry_id: ENTRY,
      p_reason: "Rechtsabteilung",
    })
  })
})

// ── embargo ────────────────────────────────────────────────────────────────
describe("POST …/embargo", () => {
  it("400 on a date-only value (a timestamp with offset is required)", async () => {
    authed()
    expect((await POST_EMBARGO(post({ embargo_at: "2026-09-01" }), ctx())).status).toBe(400)
  })

  it("accepts an ISO timestamp with offset", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: { id: ENTRY }, error: null })
    const res = await POST_EMBARGO(post({ embargo_at: "2026-09-01T08:00:00Z" }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("set_communication_embargo", {
      p_entry_id: ENTRY,
      p_embargo_at: "2026-09-01T08:00:00Z",
    })
  })

  it("accepts null to clear the embargo", async () => {
    authed()
    rpcMock.mockResolvedValue({ data: { id: ENTRY }, error: null })
    expect((await POST_EMBARGO(post({ embargo_at: null }), ctx())).status).toBe(200)
  })
})

// ── mark sent / embargo block ──────────────────────────────────────────────
describe("POST …/mark-sent under embargo (AC4)", () => {
  it("maps EM001 to 422 and logs the blocked attempt", async () => {
    authed()
    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: "EM001", message: "embargo until 2026-09-01 has not been reached" },
      })
      .mockResolvedValueOnce({ data: null, error: null })
    const res = await POST_MARK_SENT(new Request("http://t/", { method: "POST" }), ctx())
    expect(res.status).toBe(422)
    expect(rpcMock).toHaveBeenNthCalledWith(2, "log_communication_access", {
      p_entry_id: ENTRY,
      p_action: "embargo_blocked",
      p_outcome: "denied",
    })
  })
})

// ── export matrix (AC2) ────────────────────────────────────────────────────
describe("GET …/export — AC2 matrix", () => {
  function queueEntry(row: Record<string, unknown> | null) {
    const chain = newQueryChain()
    chain.maybeSingle.mockResolvedValue({ data: row, error: null })
    queue.push(chain)
  }

  it("standard: exports CSV without logging", async () => {
    authed()
    queueEntry({
      id: ENTRY,
      target_group_key: "presse",
      message: "Text",
      confidentiality_level: "standard",
      is_inner_circle: false,
      approval_status: "draft",
    })
    const res = await GET_EXPORT(new Request("http://t/?as=csv"), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(await res.text()).toContain("Text")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("confidential: exports AND logs granted", async () => {
    authed()
    queueEntry({
      id: ENTRY,
      target_group_key: "kunden",
      message: "Text",
      confidentiality_level: "confidential",
      is_inner_circle: false,
      approval_status: "draft",
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await GET_EXPORT(new Request("http://t/?as=csv"), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("log_communication_access", {
      p_entry_id: ENTRY,
      p_action: "export",
      p_outcome: "granted",
    })
  })

  it("strict: refuses with 403 and logs denied", async () => {
    authed()
    queueEntry({
      id: ENTRY,
      target_group_key: "beirat",
      message: "Streng geheim",
      confidentiality_level: "strict",
      is_inner_circle: false,
      approval_status: "draft",
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await GET_EXPORT(new Request("http://t/?as=csv"), ctx())
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain("Streng geheim")
    expect(rpcMock).toHaveBeenCalledWith("log_communication_access", {
      p_entry_id: ENTRY,
      p_action: "export",
      p_outcome: "denied",
    })
  })

  it("inner circle: refuses even at confidential level", async () => {
    authed()
    queueEntry({
      id: ENTRY,
      target_group_key: "mitarbeiter",
      message: "Mitarbeiterbrief",
      confidentiality_level: "confidential",
      is_inner_circle: true,
      approval_status: "draft",
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await GET_EXPORT(new Request("http://t/?as=csv"), ctx())
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain("Mitarbeiterbrief")
  })

  it("print view logs print_view rather than export", async () => {
    authed()
    queueEntry({
      id: ENTRY,
      target_group_key: "kunden",
      message: "Text",
      confidentiality_level: "confidential",
      is_inner_circle: false,
      approval_status: "draft",
    })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await GET_EXPORT(new Request("http://t/?as=print"), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("log_communication_access", {
      p_entry_id: ENTRY,
      p_action: "print_view",
      p_outcome: "granted",
    })
  })

  it("hidden entry: 404 and the attempt is still logged", async () => {
    authed()
    queueEntry(null)
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await GET_EXPORT(new Request("http://t/?as=csv"), ctx())
    expect(res.status).toBe(404)
    expect(rpcMock).toHaveBeenCalledWith("log_communication_access", {
      p_entry_id: ENTRY,
      p_action: "export",
      p_outcome: "denied",
    })
  })
})
