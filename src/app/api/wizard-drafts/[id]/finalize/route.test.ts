import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-5 + PROJ-70-ε + PROJ-135 — finalize endpoint tests.
//
// PROJ-70-ε: after the project is inserted, an uploaded kickoff
// context-source (draft.data.ki_backlog) is attached to the new project via
// a tenant-gated, project_id-IS-NULL UPDATE — best-effort.
//
// PROJ-135: when the draft carries answered clarifying Q&A
// (draft.data.clarifying), the same finalize step appends it to the kickoff
// content_excerpt (+ re-stamps privacy_class, mirrors to source_metadata) and
// best-effort re-links the project-less clarifying ki_run to the new project.

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

// context_sources serves BOTH a SELECT (…is().maybeSingle()) and an UPDATE
// (…is() awaited). `is()` returns a terminal that is both thenable (update)
// and exposes maybeSingle (select).
let csUpdateResult: { data: unknown; error: unknown } = { data: null, error: null }
let csSelectResult: { data: unknown; error: unknown } = { data: null, error: null }
const csTerminal = {
  then: (resolve: (v: unknown) => void) => resolve(csUpdateResult),
  maybeSingle: () => Promise.resolve(csSelectResult),
}
const contextSourceChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn(() => csTerminal),
}

// ki_runs UPDATE … eq … eq … eq … is() — terminal `is` resolves.
const kiRunsUpdateChain = {
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
    draftTouchCount += 1
    return draftTouchCount === 1 ? draftReadChain : draftDeleteChain
  }
  if (table === "projects") return projectInsertChain
  if (table === "context_sources") return contextSourceChain
  if (table === "ki_runs") return kiRunsUpdateChain
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
  csUpdateResult = { data: null, error: null }
  csSelectResult = { data: null, error: null }
  kiRunsUpdateChain.is.mockResolvedValue({ data: null, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  fromCalls.length = 0
  draftTouchCount = 0
  draftReadChain.select.mockReturnValue(draftReadChain)
  draftReadChain.eq.mockReturnValue(draftReadChain)
  projectInsertChain.insert.mockReturnValue(projectInsertChain)
  projectInsertChain.select.mockReturnValue(projectInsertChain)
  contextSourceChain.select.mockReturnValue(contextSourceChain)
  contextSourceChain.update.mockReturnValue(contextSourceChain)
  contextSourceChain.eq.mockReturnValue(contextSourceChain)
  contextSourceChain.is.mockImplementation(() => csTerminal)
  kiRunsUpdateChain.update.mockReturnValue(kiRunsUpdateChain)
  kiRunsUpdateChain.eq.mockReturnValue(kiRunsUpdateChain)
  draftDeleteChain.delete.mockReturnValue(draftDeleteChain)
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

    // No clarifying answers → plain attach (only project_id set).
    expect(fromCalls).toContain("context_sources")
    expect(contextSourceChain.update).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
    })
    expect(contextSourceChain.eq).toHaveBeenCalledWith("id", CONTEXT_SOURCE_ID)
    expect(contextSourceChain.eq).toHaveBeenCalledWith("tenant_id", TENANT_ID)
    expect(contextSourceChain.is).toHaveBeenCalledWith("project_id", null)
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
    expect(contextSourceChain.update).not.toHaveBeenCalled()
  })

  it("does NOT attach when ki_backlog block is entirely missing", async () => {
    seedHappyPath({
      name: "Legacy Project",
      project_type: "general",
      responsible_user_id: USER_ID,
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(contextSourceChain.update).not.toHaveBeenCalled()
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
    csUpdateResult = { data: null, error: { message: "rls denied" } }

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { project: { id: string } }
    expect(body.project.id).toBe(PROJECT_ID)
  })
})

describe("POST finalize — PROJ-135 clarifying Q&A persist (AC-135.4/4b/11)", () => {
  function seedWithClarifying(opts: { excerpt: string; privacy_class: number; answer: string }) {
    seedHappyPath({
      name: "ERP Rollout",
      project_type: "software",
      responsible_user_id: USER_ID,
      ki_backlog: {
        enabled: true,
        context_source_id: CONTEXT_SOURCE_ID,
        filename: "kickoff.docx",
      },
      clarifying: {
        answers: [
          { question: "Go-Live-Termin?", answer: opts.answer, gap_tag: "schedule" },
        ],
      },
    })
    csSelectResult = {
      data: {
        content_excerpt: opts.excerpt,
        privacy_class: opts.privacy_class,
        source_metadata: {},
      },
      error: null,
    }
  }

  it("appends the Q&A to content_excerpt + mirrors to source_metadata", async () => {
    seedWithClarifying({
      excerpt: "Das Projekt startet im Q3.",
      privacy_class: 2,
      answer: "Q4 2026",
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)

    const updateArg = contextSourceChain.update.mock.calls.at(-1)?.[0] as {
      project_id: string
      content_excerpt?: string
      privacy_class?: number
      source_metadata?: Record<string, unknown>
    }
    expect(updateArg.project_id).toBe(PROJECT_ID)
    expect(updateArg.content_excerpt).toContain("Das Projekt startet im Q3.")
    expect(updateArg.content_excerpt).toContain("F1 [schedule]: Go-Live-Termin?")
    expect(updateArg.content_excerpt).toContain("A1: Q4 2026")
    // clean answer → privacy_class unchanged.
    expect(updateArg.privacy_class).toBe(2)
    expect(updateArg.source_metadata?.proj135_clarifying_qa).toBeTruthy()
  })

  it("re-stamps privacy_class to 3 when the answer carries PII (AC-135.4b)", async () => {
    seedWithClarifying({
      excerpt: "Sauberer Geschäftstext.",
      privacy_class: 2,
      answer: "Bitte an max.mustermann@acme.example wenden.",
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const updateArg = contextSourceChain.update.mock.calls.at(-1)?.[0] as {
      privacy_class?: number
    }
    expect(updateArg.privacy_class).toBe(3)
  })

  it("best-effort re-links the project-less clarifying ki_run (AC-135.11)", async () => {
    seedWithClarifying({
      excerpt: "Kickoff.",
      privacy_class: 2,
      answer: "Q4",
    })

    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(fromCalls).toContain("ki_runs")
    expect(kiRunsUpdateChain.update).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
    })
    expect(kiRunsUpdateChain.eq).toHaveBeenCalledWith("wizard_draft_id", DRAFT_ID)
    expect(kiRunsUpdateChain.eq).toHaveBeenCalledWith(
      "purpose",
      "clarifying_questions_from_context",
    )
    expect(kiRunsUpdateChain.is).toHaveBeenCalledWith("project_id", null)
  })
})

describe("POST finalize — PROJ-141-γ2 template-apply warning (M-2)", () => {
  const TEMPLATE_ID = "77777777-7777-4777-8777-777777777777"

  function maDraft() {
    return {
      name: "M&A Deal",
      project_type: "ma",
      description: "Acquire target X",
      responsible_user_id: USER_ID,
      ma_foundation: {
        sponsor_user_id: USER_ID,
        template_id: TEMPLATE_ID,
      },
    }
  }

  it("still returns 201 but surfaces a warning when apply_ma_project_template errors", async () => {
    seedHappyPath(maDraft())
    // profile creation succeeds, template apply fails.
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "apply_ma_project_template"
          ? { error: { message: "boom" } }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      warnings: { code: string; message: string }[]
    }
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0].code).toBe("template_apply_failed")
  })

  it("returns 201 with empty warnings when the template applies cleanly", async () => {
    seedHappyPath(maDraft())
    // seedHappyPath already resolves every rpc to { error: null }.
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { warnings: unknown[] }
    expect(body.warnings).toHaveLength(0)
  })

  // PROJ-Y-96e — apply RPC returns warnings[] for skipped rows (waisen-subtasks,
  // missing workstream/phase anchors). Finalize passes each through as its own
  // toast so the admin knows what didn't seed.
  it("passes RPC warnings[] through as separate toast entries", async () => {
    seedHappyPath(maDraft())
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "apply_ma_project_template"
          ? {
              data: {
                template_id: TEMPLATE_ID,
                template_version: 1,
                phase_model: {},
                workstreams_created: 7,
                deliverables_created: 9,
                tasks_created: 23,
                subtasks_created: 2,
                warnings: [
                  {
                    code: "skipped_subtask_parent_missing",
                    task_key: "financial_qoe_prep",
                    parent_task_key: "financial_qoe",
                  },
                  {
                    code: "skipped_task_missing_workstream",
                    task_key: "custom_task",
                    workstream_key: "missing_ws",
                  },
                ],
                raci_created: 0,
                applied_at: "2026-08-06T00:00:00.000Z",
              },
              error: null,
            }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      warnings: { code: string; message: string }[]
    }
    // PROJ-Y-96b/e consolidation: jsonb warnings — codes preserved individually
    // so FE i18n can label the specific skip class.
    expect(body.warnings).toHaveLength(2)
    const codes = body.warnings.map((w) => w.code)
    expect(codes).toContain("skipped_subtask_parent_missing")
    expect(codes).toContain("skipped_task_missing_workstream")
  })
})

describe("POST finalize — PROJ-Y-96b template_result + RACI warnings", () => {
  const TEMPLATE_ID = "88888888-8888-4888-8888-888888888888"

  function maDraft() {
    return {
      name: "M&A Deal",
      project_type: "ma",
      description: "Acquire target X",
      responsible_user_id: USER_ID,
      ma_foundation: {
        sponsor_user_id: USER_ID,
        template_id: TEMPLATE_ID,
      },
    }
  }

  it("attaches the raw RPC template_result to the 201 payload on success", async () => {
    seedHappyPath(maDraft())
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "apply_ma_project_template"
          ? {
              data: {
                template_id: TEMPLATE_ID,
                template_version: 1,
                workstreams_created: 7,
                deliverables_created: 9,
                raci_created: 23,
                tasks_created: 23,
                subtasks_created: 2,
                phase_model: { seeded: 9 },
                applied_at: "2026-08-06T00:00:00.000Z",
              },
              error: null,
            }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      template_result: { raci_created: number; tasks_created: number } | null
      warnings: unknown[]
    }
    expect(body.template_result).toMatchObject({
      raci_created: 23,
      tasks_created: 23,
    })
    expect(body.warnings).toHaveLength(0)
  })

  it("aggregates RPC RACI warnings by (code, role_key) into top-level warnings", async () => {
    seedHappyPath(maDraft())
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "apply_ma_project_template"
          ? {
              data: {
                template_id: TEMPLATE_ID,
                template_version: 1,
                workstreams_created: 7,
                deliverables_created: 9,
                raci_created: 23,
                tasks_created: 0,
                subtasks_created: 0,
                phase_model: { seeded: 9 },
                applied_at: "2026-08-06T00:00:00.000Z",
                warnings: [
                  // 7× deal_lead on workstreams — Buy-Side seed pattern.
                  ...Array.from({ length: 7 }, (_, i) => ({
                    code: "raci_unknown_role_key",
                    target_type: "workstream",
                    target_key: `ws${i}`,
                    role_key: "deal_lead",
                  })),
                  // 9× sponsor on deliverables.
                  ...Array.from({ length: 9 }, (_, i) => ({
                    code: "raci_unknown_role_key",
                    target_type: "deliverable",
                    target_key: `del${i}`,
                    role_key: "sponsor",
                  })),
                  // 1 orphan.
                  {
                    code: "raci_orphan_target",
                    target_type: "workstream",
                    target_key: "nope",
                    role_key: "deal_lead",
                  },
                ],
              },
              error: null,
            }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      template_result: { warnings: unknown[] } | null
      warnings: { code: string; role_key?: string; message: string }[]
    }
    // 17 raw RPC warnings → 3 aggregated top-level warnings
    // (deal_lead-unknown, sponsor-unknown, deal_lead-orphan).
    expect(body.warnings).toHaveLength(3)
    const codes = body.warnings.map((w) => `${w.code}::${w.role_key ?? ""}`)
    expect(codes).toContain("raci_unknown_role_key::deal_lead")
    expect(codes).toContain("raci_unknown_role_key::sponsor")
    expect(codes).toContain("raci_orphan_target::deal_lead")
    // Raw list still available under template_result for drill-down.
    expect((body.template_result?.warnings as unknown[])?.length).toBe(17)
  })

  it("template_result is null on apply failure (regression for γ2 error path)", async () => {
    seedHappyPath(maDraft())
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "apply_ma_project_template"
          ? { error: { message: "boom" } }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      template_result: unknown
      warnings: { code: string }[]
    }
    expect(body.template_result).toBeNull()
    expect(body.warnings.some((w) => w.code === "template_apply_failed")).toBe(
      true,
    )
  })
})

// PROJ-78 — step 4.4: persist the wizard's chosen skill set, best-effort.
describe("POST finalize — PROJ-78 skill assignment (step 4.4)", () => {
  const skillsDraft = (assignments: unknown) => ({
    name: "Deal",
    project_type: "erp",
    skills: { assignments },
  })
  const ONE = [
    {
      skill_id: "11111111-1111-4111-8111-111111111111",
      assignment_source: "auto_method",
    },
  ]

  it("forwards the chosen assignments to assign_project_skills", async () => {
    seedHappyPath(skillsDraft(ONE))
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("assign_project_skills", {
      p_project_id: PROJECT_ID,
      p_assignments: ONE,
    })
  })

  it("does NOT call the RPC when the PM finished with zero skills", async () => {
    seedHappyPath(skillsDraft([]))
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(
      rpcMock.mock.calls.some((c) => c[0] === "assign_project_skills"),
    ).toBe(false)
  })

  it("does NOT call the RPC when the skills block is absent entirely", async () => {
    seedHappyPath({ name: "Deal", project_type: "erp" })
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    expect(
      rpcMock.mock.calls.some((c) => c[0] === "assign_project_skills"),
    ).toBe(false)
  })

  it("drops malformed assignment entries instead of forwarding them", async () => {
    seedHappyPath(skillsDraft([{ nope: true }, ...ONE]))
    await POST(makeRequest(), ctx())
    expect(rpcMock).toHaveBeenCalledWith("assign_project_skills", {
      p_project_id: PROJECT_ID,
      p_assignments: ONE,
    })
  })

  // Best-effort (PROJ-141-γ2 lock): a failed assignment must never cost the
  // user the project — it surfaces as a warning instead.
  it("still returns 201 and warns when assign_project_skills fails", async () => {
    seedHappyPath(skillsDraft(ONE))
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "assign_project_skills"
          ? { error: { message: "boom" } }
          : { error: null },
      ),
    )
    const res = await POST(makeRequest(), ctx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { warnings: { code: string }[] }
    expect(body.warnings.some((w) => w.code === "skill_assign_failed")).toBe(
      true,
    )
  })
})
