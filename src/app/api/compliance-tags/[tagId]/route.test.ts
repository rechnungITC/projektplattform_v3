import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-18 — PATCH /api/compliance-tags/[tagId]

const getUserMock = vi.fn()

const tagChain: {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  __mode: "read" | "update"
  __readResult: { data: unknown | null; error: { message: string } | null }
  __updateResult: { data: unknown | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  __mode: "read",
  __readResult: { data: null, error: null },
  __updateResult: { data: null, error: null },
}

const fromMock = vi.fn((table: string) => {
  if (table === "compliance_tags") return tagChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PATCH } from "./route"

const TAG_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/compliance-tags/tag", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  tagChain.__mode = "read"
  tagChain.__readResult = { data: null, error: null }
  tagChain.__updateResult = { data: null, error: null }
  tagChain.select.mockImplementation(() => tagChain)
  tagChain.update.mockImplementation(() => {
    tagChain.__mode = "update"
    return tagChain
  })
  tagChain.eq.mockReturnValue(tagChain)
  tagChain.maybeSingle.mockImplementation(() =>
    Promise.resolve(
      tagChain.__mode === "update"
        ? tagChain.__updateResult
        : tagChain.__readResult,
    ),
  )
})

describe("PATCH /api/compliance-tags/[tagId]", () => {
  it("blocks display_name updates on platform-default tags", async () => {
    tagChain.__readResult = {
      data: { id: TAG_ID, is_platform_default: true },
      error: null,
    }

    const res = await PATCH(makeReq({ display_name: "Renamed" }), {
      params: Promise.resolve({ tagId: TAG_ID }),
    })

    expect(res.status).toBe(422)
    expect(tagChain.update).not.toHaveBeenCalled()
    const body = (await res.json()) as {
      error: { code: string; field?: string }
    }
    expect(body.error.code).toBe("platform_default_rename_forbidden")
    expect(body.error.field).toBe("display_name")
  })

  it("allows non-name updates on platform-default tags", async () => {
    tagChain.__updateResult = {
      data: {
        id: TAG_ID,
        display_name: "ISO 9001",
        description: "Updated",
        is_platform_default: true,
        is_active: false,
      },
      error: null,
    }

    const res = await PATCH(
      makeReq({ description: "Updated", is_active: false }),
      { params: Promise.resolve({ tagId: TAG_ID }) },
    )

    expect(res.status).toBe(200)
    expect(tagChain.update).toHaveBeenCalledWith({
      description: "Updated",
      is_active: false,
    })
  })

  it("allows display_name updates on tenant-owned tags", async () => {
    tagChain.__readResult = {
      data: { id: TAG_ID, is_platform_default: false },
      error: null,
    }
    tagChain.__updateResult = {
      data: { id: TAG_ID, display_name: "Tenant Label" },
      error: null,
    }

    const res = await PATCH(makeReq({ display_name: "Tenant Label" }), {
      params: Promise.resolve({ tagId: TAG_ID }),
    })

    expect(res.status).toBe(200)
    expect(tagChain.update).toHaveBeenCalledWith({
      display_name: "Tenant Label",
    })
  })
})
