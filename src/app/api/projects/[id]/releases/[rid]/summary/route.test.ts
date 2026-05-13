import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

function queryChain(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

const releaseChain = queryChain({
  data: null,
  error: null,
})
const explicitWorkItemsChain = queryChain({
  data: [],
  error: null,
})
const childWorkItemsChain = queryChain({
  data: [],
  error: null,
})
const parentStoryChain = queryChain({
  data: [],
  error: null,
})
const sprintsChain = queryChain({ data: [], error: null })
const phasesChain = queryChain({ data: [], error: null })
const milestonesChain = queryChain({ data: [], error: null })

let workItemsCall = 0

const fromMock = vi.fn((table: string) => {
  if (table === "releases") return releaseChain
  if (table === "sprints") return sprintsChain
  if (table === "phases") return phasesChain
  if (table === "milestones") return milestonesChain
  if (table === "work_items") {
    const chains = [explicitWorkItemsChain, childWorkItemsChain, parentStoryChain]
    return chains[workItemsCall++] ?? parentStoryChain
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("../../_helpers", () => ({
  requireReleaseProject: vi.fn(async () => ({
    project: {
      id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      project_method: "scrum",
    },
  })),
  validateUuid: vi.fn(() => null),
}))

import { GET } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const RELEASE_ID = "44444444-4444-4444-8444-444444444444"
const STORY_ID = "55555555-5555-4555-8555-555555555555"
const CHILD_ID = "66666666-6666-4666-8666-666666666666"
const DIRECT_TASK_ID = "77777777-7777-4777-8777-777777777777"
const PARENT_STORY_ID = "88888888-8888-4888-8888-888888888888"

function item(overrides: Record<string, unknown>) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    kind: "story",
    parent_id: null,
    phase_id: null,
    milestone_id: null,
    sprint_id: null,
    release_id: RELEASE_ID,
    title: "Item",
    status: "todo",
    priority: "medium",
    attributes: {},
    planned_start: null,
    planned_end: null,
    ...overrides,
  }
}

function makeContext() {
  return {
    params: Promise.resolve({ id: PROJECT_ID, rid: RELEASE_ID }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  workItemsCall = 0
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  releaseChain.maybeSingle.mockResolvedValue({
    data: {
      id: RELEASE_ID,
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      name: "R1",
      description: null,
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      status: "active",
      target_milestone_id: null,
      created_by: USER_ID,
      created_at: "2026-05-13T12:00:00Z",
      updated_at: "2026-05-13T12:00:00Z",
    },
    error: null,
  })
  explicitWorkItemsChain.limit.mockResolvedValue({ data: [], error: null })
  childWorkItemsChain.limit.mockResolvedValue({ data: [], error: null })
  parentStoryChain.limit.mockResolvedValue({ data: [], error: null })
  sprintsChain.limit.mockResolvedValue({ data: [], error: null })
  phasesChain.limit.mockResolvedValue({ data: [], error: null })
  milestonesChain.limit.mockResolvedValue({ data: [], error: null })
})

describe("GET /api/projects/[id]/releases/[rid]/summary", () => {
  it("loads release scope before applying the 500 item cap", async () => {
    explicitWorkItemsChain.limit.mockResolvedValue({
      data: [
        item({
          id: STORY_ID,
          title: "Release Story",
          planned_start: "2026-06-02",
          planned_end: "2026-06-05",
        }),
        item({
          id: DIRECT_TASK_ID,
          kind: "task",
          parent_id: PARENT_STORY_ID,
          title: "Direct release task",
        }),
      ],
      error: null,
    })
    childWorkItemsChain.limit.mockResolvedValue({
      data: [
        item({
          id: CHILD_ID,
          kind: "task",
          parent_id: STORY_ID,
          release_id: null,
          title: "Inherited child task",
        }),
      ],
      error: null,
    })
    parentStoryChain.limit.mockResolvedValue({
      data: [
        item({
          id: PARENT_STORY_ID,
          release_id: null,
          title: "Parent story for fallback",
          planned_start: "2026-06-10",
          planned_end: "2026-06-12",
        }),
      ],
      error: null,
    })

    const res = await GET(new Request("http://localhost/summary"), makeContext())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(explicitWorkItemsChain.eq).toHaveBeenCalledWith(
      "release_id",
      RELEASE_ID
    )
    expect(childWorkItemsChain.in).toHaveBeenCalledWith("parent_id", [STORY_ID])
    expect(parentStoryChain.in).toHaveBeenCalledWith("id", [PARENT_STORY_ID])
    expect(body.truncated).toBe(false)
    expect(body.summary.items.map((row: { id: string }) => row.id)).toEqual([
      STORY_ID,
      DIRECT_TASK_ID,
      CHILD_ID,
    ])
    expect(
      body.summary.items.find((row: { id: string }) => row.id === DIRECT_TASK_ID)
    ).toMatchObject({
      timeline_start: "2026-06-10",
      timeline_end: "2026-06-12",
      date_source: "parent_story",
    })
  })

  it("marks the response truncated when explicit release scope exceeds 500", async () => {
    explicitWorkItemsChain.limit.mockResolvedValue({
      data: Array.from({ length: 501 }, (_, index) =>
        item({
          id: `00000000-0000-4000-8000-${index
            .toString()
            .padStart(12, "0")}`,
          kind: "bug",
          title: `Bug ${index}`,
        })
      ),
      error: null,
    })

    const res = await GET(new Request("http://localhost/summary"), makeContext())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.truncated).toBe(true)
    expect(body.summary.items).toHaveLength(500)
    expect(childWorkItemsChain.limit).not.toHaveBeenCalled()
  })
})
