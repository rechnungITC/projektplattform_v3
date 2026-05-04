import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-5 — wizard-drafts collection endpoint tests.
// Covers GET (list) and POST (create) happy paths plus validation/auth gates.

const getUserMock = vi.fn()

const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

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

let nextOp: "insert" | "list" = "insert"
const fromMock = vi.fn(() =>
  nextOp === "insert" ? insertChain : listChain
)

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/wizard-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeGet(qs: string): Request {
  return new Request(`http://localhost/api/wizard-drafts?${qs}`, {
    method: "GET",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  nextOp = "insert"
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)
  listChain.select.mockReturnValue(listChain)
  listChain.eq.mockReturnValue(listChain)
  listChain.order.mockReturnValue(listChain)
  listChain.limit.mockReturnValue(listChain)
  listChain.__result = { data: [], error: null }
})

describe("POST /api/wizard-drafts", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePost({ tenant_id: TENANT_ID, data: { name: "x" } })
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when tenant_id is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ data: {} }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 when body is not JSON", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const req = new Request("http://localhost/api/wizard-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("creates a draft and denormalizes name/type/method into columns", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const created = {
      id: "draft-1",
      tenant_id: TENANT_ID,
      created_by: USER_ID,
      name: "My ERP",
      project_type: "erp",
      project_method: "scrum",
      data: {},
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
    }
    insertChain.single.mockResolvedValue({ data: created, error: null })

    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        data: {
          name: "  My ERP  ",
          project_type: "erp",
          project_method: "scrum",
          type_specific_data: { target_systems: "SAP" },
        },
      })
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ draft: created })
    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.created_by).toBe(USER_ID)
    expect(arg.name).toBe("My ERP")
    expect(arg.project_type).toBe("erp")
    expect(arg.project_method).toBe("scrum")
  })

  it("returns 403 when RLS denies the insert", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    })
    const res = await POST(
      makePost({ tenant_id: TENANT_ID, data: { name: "X" } })
    )
    expect(res.status).toBe(403)
  })
})

describe("GET /api/wizard-drafts", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet(`tenant_id=${TENANT_ID}`))
    expect(res.status).toBe(401)
  })

  it("returns 400 when tenant_id is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(makeGet(""))
    expect(res.status).toBe(400)
  })

  it("returns the drafts list scoped to the tenant", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "d1",
          tenant_id: TENANT_ID,
          created_by: USER_ID,
          name: "First",
          project_type: "software",
          project_method: null,
          data: {},
          created_at: "2026-04-28T01:00:00Z",
          updated_at: "2026-04-28T02:00:00Z",
        },
      ],
      error: null,
    }
    const res = await GET(makeGet(`tenant_id=${TENANT_ID}`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { drafts: unknown[] }
    expect(body.drafts).toHaveLength(1)
    expect(listChain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/wizard-drafts — schema/DB-payload drift", () => {
  it("forwards every wizardDataSchema key to the data JSONB column", async () => {
    const { wizardDataSchema } = await import("./_schema")
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const RESPONSIBLE_USER_ID = "77777777-7777-4777-8777-777777777777"

    const wizardData = {
      name: "Drift Project",
      description: "Drift-Test description",
      project_number: "DR-001",
      planned_start_date: "2026-05-01",
      planned_end_date: "2026-12-31",
      responsible_user_id: RESPONSIBLE_USER_ID,
      project_type: "software" as const,
      project_method: "scrum" as const,
      type_specific_data: { tech_stack: "Next.js" },
    }

    const dataKeys = Object.keys(wizardDataSchema.shape)
    for (const key of dataKeys) {
      expect(wizardData, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    insertChain.single.mockResolvedValue({
      data: { id: "drift-1", tenant_id: TENANT_ID, data: wizardData },
      error: null,
    })

    const res = await POST(
      makePost({ tenant_id: TENANT_ID, data: wizardData })
    )
    expect(res.status).toBe(201)

    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "insert was not called").toBeTruthy()

    // The route stores the full WizardData blob in the `data` JSONB column.
    // Every wizardDataSchema key must reach that blob.
    const dataBlob = arg.data as Record<string, unknown>
    for (const key of dataKeys) {
      const expected = (wizardData as Record<string, unknown>)[key]
      expect(
        dataBlob[key],
        `field '${key}' was dropped from data JSONB column`
      ).toEqual(expected)
    }

    // Denormalized columns (PROJ-5 indexed-search support):
    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.created_by).toBe(USER_ID)
    expect(arg.name).toBe("Drift Project")
    expect(arg.project_type).toBe("software")
    expect(arg.project_method).toBe("scrum")
  })
})
