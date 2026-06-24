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

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function objChain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.maybeSingle = vi.fn(async () => result)
  return c
}
function supa(opts: {
  obj?: { data: unknown; error: unknown }
  rpc?: { data: unknown; error: unknown }
}) {
  return {
    from: vi.fn(() => objChain(opts.obj ?? { data: null, error: null })),
    rpc: vi.fn(async () => opts.rpc ?? { data: [], error: null }),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function get(qs = "") {
  return GET(new Request(`http://t/access-explain${qs}`), ctx())
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/access-explain", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await get()).status).toBe(401)
  })

  it("400 on invalid explicit level", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await get("?level=top-secret")).status).toBe(400)
  })

  it("explicit level skips object resolution and calls ma_access_explain", async () => {
    const supabase = supa({
      rpc: {
        data: [
          { user_id: "u1", is_member: true, is_external_advisor: false, mandate_ok: true, nda_ok: false, cleared_level: "confidential", has_access: true, reason: "cleared" },
          { user_id: "u2", is_member: true, is_external_advisor: true, mandate_ok: false, nda_ok: false, cleared_level: null, has_access: false, reason: "mandate_inactive" },
        ],
        error: null,
      },
    })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await get("?level=confidential")
    expect(res.status).toBe(200)
    const json = (await res.json()) as { confidentiality_level: string; entries: unknown[] }
    expect(json.confidentiality_level).toBe("confidential")
    expect(json.entries).toHaveLength(2)
    expect(supabase.rpc).toHaveBeenCalledWith("ma_access_explain", {
      p_project_id: PROJECT,
      p_level: "confidential",
    })
    // explicit level => no object lookup
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("resolves the object level when no explicit level given", async () => {
    const supabase = supa({
      obj: { data: { confidentiality_level: "strict" }, error: null },
      rpc: { data: [], error: null },
    })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).confidentiality_level).toBe("strict")
    expect(supabase.rpc).toHaveBeenCalledWith("ma_access_explain", {
      p_project_id: PROJECT,
      p_level: "strict",
    })
  })

  it("403 maps RPC 42501 (non-manager)", async () => {
    const supabase = supa({ rpc: { data: null, error: { code: "42501", message: "no" } } })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await get("?level=strict")).status).toBe(403)
  })
})
