import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

type ChainResult = { data: unknown; error: { code?: string; message: string } | null }

function makeChain(result: ChainResult) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: ChainResult) => void) => resolve(result),
  }
  return chain
}

const tableQueues = new Map<string, ReturnType<typeof makeChain>[]>()
const fromMock = vi.fn((table: string) => {
  const queue = tableQueues.get(table)
  const chain = queue?.shift()
  if (!chain) throw new Error(`unexpected table call ${table}`)
  return chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TARGET_PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "33333333-3333-4333-8333-333333333333"
const USER_ID = "44444444-4444-4444-8444-444444444444"
const SOURCE_ID = "55555555-5555-4555-8555-555555555555"
const TARGET_ID = "66666666-6666-4666-8666-666666666666"
const LINK_ID = "77777777-7777-4777-8777-777777777777"

function queue(table: string, ...chains: ReturnType<typeof makeChain>[]) {
  tableQueues.set(table, chains)
}

function req(body: unknown) {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/work-item-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function ctx() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  tableQueues.clear()
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("POST /api/projects/[id]/work-item-links — PROJ-27", () => {
  it("requires project edit access before reading work items", async () => {
    queue(
      "projects",
      makeChain({ data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null }),
    )
    queue(
      "tenant_memberships",
      makeChain({ data: { role: "member" }, error: null }),
    )
    queue(
      "project_memberships",
      makeChain({ data: { role: "viewer" }, error: null }),
    )

    const res = await POST(
      req({
        from_work_item_id: SOURCE_ID,
        to_work_item_id: TARGET_ID,
        link_type: "relates",
      }),
      ctx(),
    )

    expect(res.status).toBe(403)
    expect(fromMock).toHaveBeenCalledTimes(3)
  })

  it("creates cross-project reverse links as pending canonical rows", async () => {
    const inserted = {
      id: LINK_ID,
      tenant_id: TENANT_ID,
      from_work_item_id: TARGET_ID,
      to_work_item_id: SOURCE_ID,
      from_project_id: TARGET_PROJECT_ID,
      to_project_id: PROJECT_ID,
      link_type: "precedes",
      lag_days: 2,
      approval_state: "pending",
      approval_project_id: TARGET_PROJECT_ID,
      approved_by: null,
      approved_at: null,
      created_by: USER_ID,
      created_at: "2026-05-11T18:00:00.000Z",
      updated_at: "2026-05-11T18:00:00.000Z",
    }
    const insertChain = makeChain({ data: inserted, error: null })

    queue(
      "projects",
      makeChain({ data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null }),
      makeChain({
        data: {
          id: TARGET_PROJECT_ID,
          tenant_id: TENANT_ID,
          name: "Target",
          parent_project_id: null,
          is_deleted: false,
        },
        error: null,
      }),
      makeChain({
        data: [
          { id: PROJECT_ID, parent_project_id: null },
          { id: TARGET_PROJECT_ID, parent_project_id: null },
        ],
        error: null,
      }),
      makeChain({
        data: [
          { id: PROJECT_ID, name: "Source" },
          { id: TARGET_PROJECT_ID, name: "Target" },
        ],
        error: null,
      }),
    )
    queue(
      "tenant_memberships",
      makeChain({ data: { role: "member" }, error: null }),
      makeChain({ data: { role: "member" }, error: null }),
    )
    queue(
      "project_memberships",
      makeChain({ data: { role: "editor" }, error: null }),
      makeChain({ data: [{ project_id: PROJECT_ID }], error: null }),
    )
    queue(
      "work_items",
      makeChain({
        data: {
          id: SOURCE_ID,
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          kind: "story",
          title: "Source story",
          status: "todo",
          is_deleted: false,
        },
        error: null,
      }),
      makeChain({
        data: {
          id: TARGET_ID,
          tenant_id: TENANT_ID,
          project_id: TARGET_PROJECT_ID,
          kind: "story",
          title: "Target story",
          status: "todo",
          is_deleted: false,
        },
        error: null,
      }),
      makeChain({
        data: [
          {
            id: SOURCE_ID,
            title: "Source story",
            kind: "story",
            status: "todo",
            project_id: PROJECT_ID,
          },
        ],
        error: null,
      }),
    )
    queue("work_item_links", insertChain)
    queue(
      "profiles",
      makeChain({ data: [{ id: USER_ID, display_name: "Ada", email: "ada@example.test" }], error: null }),
    )

    const res = await POST(
      req({
        from_work_item_id: SOURCE_ID,
        to_work_item_id: TARGET_ID,
        link_type: "follows",
        lag_days: 2,
      }),
      ctx(),
    )

    expect(res.status).toBe(201)
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_work_item_id: TARGET_ID,
        to_work_item_id: SOURCE_ID,
        from_project_id: TARGET_PROJECT_ID,
        to_project_id: PROJECT_ID,
        link_type: "precedes",
        approval_state: "pending",
        approval_project_id: TARGET_PROJECT_ID,
      }),
    )
    const body = await res.json()
    expect(body.approval_state).toBe("pending")
    expect(body.link.link_type).toBe("precedes")
  })
})
