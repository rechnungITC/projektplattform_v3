import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-18 — GET /api/compliance-tags

const getUserMock = vi.fn()

const tagsChain: {
  select: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(tagsChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "compliance_tags") return tagsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  tagsChain.select.mockReturnValue(tagsChain)
  tagsChain.order.mockReturnValue(tagsChain)
  tagsChain.limit.mockReturnValue(tagsChain)
  tagsChain.__result = { data: [], error: null }
})

describe("GET /api/compliance-tags", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns the tag list when signed in", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
    })
    tagsChain.__result = {
      data: [
        {
          id: "tag-1",
          tenant_id: "tenant-1",
          key: "iso-9001",
          display_name: "ISO 9001",
          description: null,
          is_active: true,
          default_child_kinds: ["task"],
          template_keys: ["iso-9001-form"],
          is_platform_default: true,
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:00Z",
        },
      ],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tags: unknown[] }
    expect(body.tags).toHaveLength(1)
  })

  it("returns 500 when the underlying query errors", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
    })
    tagsChain.__result = { data: null, error: { message: "boom" } }
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
