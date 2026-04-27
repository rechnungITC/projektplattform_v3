import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  return chain
}

const queue: { table: string; chain: QueryChain }[] = []
const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}')`)
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeContext() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

function setupAccess(opts: {
  projectExists?: boolean
  type?: string
  method?: string | null
}) {
  // requireProjectAccess: from("projects")
  const projectChain = newQueryChain()
  projectChain.maybeSingle.mockResolvedValue({
    data:
      opts.projectExists === false
        ? null
        : { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  queue.push({ table: "projects", chain: projectChain })
  if (opts.projectExists === false) return

  // For action 'view', the helper returns early — no extra membership lookups.
  // Then the route's own from("projects") fetch for type/method.
  const detailChain = newQueryChain()
  detailChain.maybeSingle.mockResolvedValue({
    data: { project_type: opts.type ?? "erp", project_method: opts.method ?? null },
    error: null,
  })
  queue.push({ table: "projects", chain: detailChain })
}

beforeEach(() => {
  vi.clearAllMocks()
  queue.length = 0
})

describe("GET /api/projects/[id]/rules", () => {
  it("401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://x"), makeContext())
    expect(res.status).toBe(401)
  })

  it("404 when project lookup yields null (RLS-hidden)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccess({ projectExists: false })
    const res = await GET(new Request("http://x"), makeContext())
    expect(res.status).toBe(404)
  })

  it("happy path: returns the engine output for (erp, scrum)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccess({ type: "erp", method: "scrum" })

    const res = await GET(new Request("http://x"), makeContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      project_id: string
      type: string
      method: string | null
      rules: { active_modules: string[]; starter_kinds: string[] }
    }
    expect(body.project_id).toBe(PROJECT_ID)
    expect(body.type).toBe("erp")
    expect(body.method).toBe("scrum")
    expect(body.rules.starter_kinds).toContain("story")
  })

  it("starter_kinds empty when stored method is null", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccess({ type: "general", method: null })

    const res = await GET(new Request("http://x"), makeContext())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      method: string | null
      rules: { starter_kinds: string[] }
    }
    expect(body.method).toBeNull()
    expect(body.rules.starter_kinds).toEqual([])
  })
})
