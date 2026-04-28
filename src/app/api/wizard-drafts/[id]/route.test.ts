import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-5 — single-draft endpoint tests (GET, PATCH, DELETE).

const getUserMock = vi.fn()

const readChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const updateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const deleteChain: {
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: {
    data: unknown
    error: { code?: string; message: string } | null
    count: number | null
  }
} = {
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  __result: { data: null, error: null, count: 1 },
  then: (resolve) => resolve(deleteChain.__result),
}

let nextOp: "read" | "update" | "delete" = "read"
const fromMock = vi.fn(() => {
  if (nextOp === "read") return readChain
  if (nextOp === "update") return updateChain
  return deleteChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { DELETE, GET, PATCH } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const DRAFT_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  nextOp = "read"
  readChain.select.mockReturnValue(readChain)
  readChain.eq.mockReturnValue(readChain)
  updateChain.update.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)
  deleteChain.delete.mockReturnValue(deleteChain)
  deleteChain.eq.mockReturnValue(deleteChain)
  deleteChain.__result = { data: null, error: null, count: 1 }
})

describe("GET /api/wizard-drafts/[id]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`), {
      params: Promise.resolve({ id: DRAFT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 when id is not a UUID", async () => {
    const res = await GET(new Request("http://localhost/api/wizard-drafts/x"), {
      params: Promise.resolve({ id: "x" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when RLS hides the draft", async () => {
    nextOp = "read"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    readChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`), {
      params: Promise.resolve({ id: DRAFT_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with the draft when present", async () => {
    nextOp = "read"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const draft = {
      id: DRAFT_ID,
      tenant_id: "t1",
      created_by: USER_ID,
      name: "X",
      project_type: "general",
      project_method: null,
      data: {},
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
    }
    readChain.maybeSingle.mockResolvedValue({ data: draft, error: null })
    const res = await GET(new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`), {
      params: Promise.resolve({ id: DRAFT_ID }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ draft })
  })
})

describe("PATCH /api/wizard-drafts/[id]", () => {
  it("returns 400 when body is invalid JSON", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const req = new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: DRAFT_ID }) })
    expect(res.status).toBe(400)
  })

  it("returns 200 and persists denormalized name", async () => {
    nextOp = "update"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = {
      id: DRAFT_ID,
      tenant_id: "t1",
      created_by: USER_ID,
      name: "Renamed",
      project_type: "erp",
      project_method: "scrum",
      data: {},
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:01Z",
    }
    updateChain.single.mockResolvedValue({ data: updated, error: null })
    const req = new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          name: "Renamed",
          project_type: "erp",
          project_method: "scrum",
        },
      }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: DRAFT_ID }) })
    expect(res.status).toBe(200)
    const arg = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.name).toBe("Renamed")
    expect(arg.project_type).toBe("erp")
    expect(arg.project_method).toBe("scrum")
  })
})

describe("DELETE /api/wizard-drafts/[id]", () => {
  it("returns 204 when deleted", async () => {
    nextOp = "delete"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    deleteChain.__result = { data: null, error: null, count: 1 }
    const res = await DELETE(
      new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: DRAFT_ID }) }
    )
    expect(res.status).toBe(204)
  })

  it("returns 404 when nothing was deleted", async () => {
    nextOp = "delete"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    deleteChain.__result = { data: null, error: null, count: 0 }
    const res = await DELETE(
      new Request(`http://localhost/api/wizard-drafts/${DRAFT_ID}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: DRAFT_ID }) }
    )
    expect(res.status).toBe(404)
  })
})
