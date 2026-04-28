import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-10 — history endpoint tests for /api/audit/[entity_type]/[entity_id]/history.

const getUserMock = vi.fn()

const listChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(listChain.__result),
}

const fromMock = vi.fn(() => listChain)

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const ENTITY_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  listChain.select.mockReturnValue(listChain)
  listChain.eq.mockReturnValue(listChain)
  listChain.order.mockReturnValue(listChain)
  listChain.limit.mockReturnValue(listChain)
  listChain.__result = { data: [], error: null }
})

describe("GET /api/audit/[entity_type]/[entity_id]/history", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request(
        `http://localhost/api/audit/stakeholders/${ENTITY_ID}/history`
      ),
      {
        params: Promise.resolve({
          entity_type: "stakeholders",
          entity_id: ENTITY_ID,
        }),
      }
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on unknown entity_type", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(
      new Request(`http://localhost/api/audit/bogus/${ENTITY_ID}/history`),
      {
        params: Promise.resolve({ entity_type: "bogus", entity_id: ENTITY_ID }),
      }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on bad UUID", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(
      new Request("http://localhost/api/audit/stakeholders/notauuid/history"),
      {
        params: Promise.resolve({
          entity_type: "stakeholders",
          entity_id: "notauuid",
        }),
      }
    )
    expect(res.status).toBe(400)
  })

  it("returns 200 with the entries list (RLS-scoped server-side)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "a1",
          tenant_id: "t1",
          entity_type: "stakeholders",
          entity_id: ENTITY_ID,
          field_name: "name",
          old_value: "Alice",
          new_value: "Bob",
          actor_user_id: USER_ID,
          changed_at: "2026-04-28T01:00:00Z",
          change_reason: null,
        },
      ],
      error: null,
    }
    const res = await GET(
      new Request(
        `http://localhost/api/audit/stakeholders/${ENTITY_ID}/history`
      ),
      {
        params: Promise.resolve({
          entity_type: "stakeholders",
          entity_id: ENTITY_ID,
        }),
      }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: unknown[] }
    expect(body.entries).toHaveLength(1)
    expect(listChain.eq).toHaveBeenCalledWith("entity_type", "stakeholders")
    expect(listChain.eq).toHaveBeenCalledWith("entity_id", ENTITY_ID)
  })
})
