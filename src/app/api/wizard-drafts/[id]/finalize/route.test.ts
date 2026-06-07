import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-5 + PROJ-70-ε — finalize endpoint tests.
//
// Focus of the ε additions: after the project is inserted, an uploaded
// kickoff context-source (draft.data.ki_backlog) is attached to the new
// project via a tenant-gated, project_id-IS-NULL UPDATE — best-effort.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

const draftReadChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const projectInsertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

// context_sources UPDATE … eq … eq … is(…) — terminal `is` resolves.
const contextUpdateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn(),
}

const draftDeleteChain = {
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
}

const fromCalls: string[] = []
let draftTouchCount = 0
const fromMock = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === "project_wizard_drafts") {
    // 1st touch = read (.select…maybeSingle), 2nd touch = delete.
    draftTouchCount += 1
    return draftTouchCount === 1 ? draftReadChain : draftDeleteChain
  }
  if (table === "projects") return projectInsertChain
  if (table === "context_sources") return contextUpdateChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const DRAFT_ID = "33333333-3333-4333-8333-333333333333"
const TENANT_ID = "44444444-4444-4444-8444-444444444444"
const PROJECT_ID = "55555555-5555-4555-8555-555555555555"
const CONTEXT_SOURCE_ID = "66666666-6666-4666-8666-666666666666"

function makeRequest() {
  return new Request(
    `http://localhost/api/wizard-drafts/${DRAFT_ID}/finalize`,
    { method: "POST" },
  )
}

function ctx() {
  return { params: Promise.resolve({ id: DRAFT_ID }) }
}

function seedHappyPath(draftData: Record<string, unknown>) {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  draftReadChain.maybeSingle.mockResolvedValue({
    data: { id: DRAFT_ID, tenant_id: TENANT_ID, data: draftData },
    error: null,
  })
  projectInsertChain.single.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID, name: "X" },
    error: null,
  })
  rpcMock.mockResolvedValue({ error: null })
  contextUpdateChain.is.mockResolvedValue({ data: null, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  fromCalls.length = 0
  draftTouchCount = 0
  draftReadChain.select.mockReturnValue(draftReadChain)
  draftReadChain.eq.mockReturnValue(draftReadChain)
  projectInsertChain.insert.mockReturnValue(projectInsertChain)
  projectInsertChain.select.mockReturnValue(projectInsertChain)
  contextUpdateChain.update.mockReturnValue(contextUpdateChain)
  contextUpdateChain.eq.mockReturnValue(contextUpdateChain)
  draftDeleteChain.delete.mockReturnValue(draftDeleteChain)
  draftDeleteChain.eq.mockReturnValue(draftDeleteChain)
  // The drafts delete is the terminal `.eq("id", …)` — resolve it.
  draftDeleteChain.eq.mockResolvedValue({ data: null, error: null })
})

describe("POST finalize — auth + validation", () => {
  it("401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(401)
  })

  it("400 when id is not a UUID", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })
})

describe("POST finalize — PROJ-70-ε context-source attach (AC-ε4)", () => {
  it("attaches the uploaded context-source to the new project", async () => {
    seedHappyPath({
      name: "ERP Rollout",
      project_type: "software",
      responsible_user_id: USER_ID,
      ki_backlog: {
        enabled: true,
        context_source_id: CONTEXT_SOURCE_ID,
        filename: "kickoff.eml",
      },
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)

    // context_sources UPDATE was issued with the new project id, gated by
    // tenant_id + project_id IS NULL.
    expect(fromCalls).toContain("context_sources")
    expect(contextUpdateChain.update).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
    })
    expect(contextUpdateChain.eq).toHaveBeenCalledWith("id", CONTEXT_SOURCE_ID)
    expect(contextUpdateChain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
    expect(contextUpdateChain.is).toHaveBeenCalledWith("project_id", null)
  })

  it("does NOT attach when ki_backlog is disabled or absent", async () => {
    seedHappyPath({
      name: "No KI Project",
      project_type: "software",
      responsible_user_id: USER_ID,
      ki_backlog: { enabled: false, context_source_id: null, filename: null },
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(fromCalls).not.toContain("context_sources")
    expect(contextUpdateChain.update).not.toHaveBeenCalled()
  })

  it("does NOT attach when ki_backlog block is entirely missing", async () => {
    seedHappyPath({
      name: "Legacy Project",
      project_type: "general",
      responsible_user_id: USER_ID,
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(contextUpdateChain.update).not.toHaveBeenCalled()
  })

  it("still returns 201 when the attach UPDATE fails (best-effort)", async () => {
    seedHappyPath({
      name: "Resilient Project",
      project_type: "software",
      responsible_user_id: USER_ID,
      ki_backlog: {
        enabled: true,
        context_source_id: CONTEXT_SOURCE_ID,
        filename: "kickoff.msg",
      },
    })
    contextUpdateChain.is.mockResolvedValue({
      data: null,
      error: { message: "rls denied" },
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { project: { id: string } }
    expect(body.project.id).toBe(PROJECT_ID)
  })
})
