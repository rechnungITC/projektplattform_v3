import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-97a — GET /api/projects/[id]/roles (responsibility view).
const getUserMock = vi.fn()

interface Chain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

const queue: { table: string; chain: Chain }[] = []
function enqueue(table: string, chain: Chain) {
  queue.push({ table, chain })
}
const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}') — queue empty`)
  if (next.table !== table)
    throw new Error(`Expected from('${next.table}') but got from('${table}')`)
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function queueViewAccess() {
  const proj = {} as Chain
  proj.select = vi.fn().mockReturnValue(proj)
  proj.eq = vi.fn().mockReturnValue(proj)
  proj.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  enqueue("projects", proj)
}
function queueStakeholders(rows: unknown[]) {
  const chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue({ data: rows, error: null })
  enqueue("stakeholders", chain)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/roles", () => {
  it("400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await GET(new Request("http://t/"), ctx("nope"))
    expect(res.status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(401)
  })

  it("groups stakeholders into the M&A role catalog with external marker", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    queueStakeholders([
      { id: "s1", name: "Anna", origin: "internal", role_key: "deal_lead" },
      { id: "s2", name: "Kanzlei X", origin: "external", role_key: "legal_counsel" },
      { id: "s3", name: "Legacy", origin: "internal", role_key: "made_up_role" },
    ])
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      roles: { key: string }[]
      assignments: {
        role_key: string
        stakeholders: { id: string; origin: string }[]
      }[]
    }
    expect(body.roles).toHaveLength(11)
    const dealLead = body.assignments.find((a) => a.role_key === "deal_lead")
    expect(dealLead?.stakeholders.map((s) => s.id)).toEqual(["s1"])
    const legal = body.assignments.find((a) => a.role_key === "legal_counsel")
    expect(legal?.stakeholders[0]?.origin).toBe("external")
    // unknown role_key falls into the "other" bucket
    const other = body.assignments.find((a) => a.role_key === "__other")
    expect(other?.stakeholders.map((s) => s.id)).toEqual(["s3"])
  })
})
