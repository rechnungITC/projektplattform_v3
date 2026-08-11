import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-144 — Bestätigungs-Route. Der wichtigste Fall hier ist nicht der
// Happy-Path, sondern der verlorene Anspruch: geht das bedingte Update leer aus,
// darf KEIN Work-Item entstehen (AC-144.19, Doppelklick-Schutz aus D5).

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  getAuthenticatedUserId: vi.fn(),
  resolveActiveTenantId: vi.fn(),
  requireTenantMember: vi.fn(),
  requireProjectAccess: vi.fn(),
  requireModuleActive: vi.fn(),
  createWorkItemChecked: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: mocks.getAuthenticatedUserId,
    requireTenantMember: mocks.requireTenantMember,
    requireProjectAccess: mocks.requireProjectAccess,
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantId,
}))

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: mocks.requireModuleActive,
}))

vi.mock("@/lib/work-items/create-work-item", () => ({
  createWorkItemChecked: mocks.createWorkItemChecked,
}))

import { POST } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "33333333-3333-4333-8333-333333333333"
const DRAFT_ID = "44444444-4444-4444-8444-444444444444"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"

const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {}
let updates: Array<{ table: string; payload: Record<string, unknown> }> = []
let inserts: Array<{ table: string; payload: Record<string, unknown> }> = []

const openDraft = {
  id: DRAFT_ID,
  project_id: PROJECT_ID,
  target_kind: "story",
  title: "Rechnungsimport testen",
  description: null,
  status: "open",
}

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  inserts = []
  for (const key of Object.keys(queues)) delete queues[key]

  mocks.getAuthenticatedUserId.mockResolvedValue({
    userId: USER_ID,
    supabase: mocks.supabase,
  })
  mocks.resolveActiveTenantId.mockResolvedValue(TENANT_ID)
  mocks.requireTenantMember.mockResolvedValue(null)
  mocks.requireModuleActive.mockResolvedValue(null)
  mocks.requireProjectAccess.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
  mocks.createWorkItemChecked.mockResolvedValue({
    ok: true,
    row: { id: WORK_ITEM_ID, title: "Rechnungsimport testen", kind: "story" },
  })
  mocks.supabase.from.mockImplementation((table: string) => chain(table))
})

describe("POST /api/assistant/work-item-drafts/[draftId]/confirm", () => {
  it("weist eine ungültige Entwurfs-Kennung mit 400 ab", async () => {
    const res = await POST(request(), params("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("antwortet 401 ohne Anmeldung", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({
      userId: null,
      supabase: mocks.supabase,
    })
    const res = await POST(request(), params())
    expect(res.status).toBe(401)
  })

  it("antwortet 403 wenn das Assistant-Modul aus ist", async () => {
    mocks.requireModuleActive.mockResolvedValue(
      Response.json({ error: { code: "module_disabled", message: "off" } }, { status: 403 }),
    )
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
  })

  it("antwortet 404 wenn der Entwurf nicht sichtbar ist", async () => {
    queues.assistant_work_item_drafts = [{ data: null, error: null }]
    const res = await POST(request(), params())
    expect(res.status).toBe(404)
    expect(mocks.createWorkItemChecked).not.toHaveBeenCalled()
  })

  it("antwortet 409 wenn der Entwurf schon bestätigt wurde", async () => {
    queues.assistant_work_item_drafts = [
      { data: { ...openDraft, status: "confirmed" }, error: null },
    ]
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("draft_not_open")
    expect(mocks.createWorkItemChecked).not.toHaveBeenCalled()
  })

  it("gibt die Absage der Rechteprüfung weiter (Rollenwechsel zwischen den Schritten)", async () => {
    queues.assistant_work_item_drafts = [{ data: openDraft, error: null }]
    mocks.requireProjectAccess.mockResolvedValue({
      error: Response.json(
        { error: { code: "forbidden", message: "Editor or lead role required." } },
        { status: 403 },
      ),
    })
    const res = await POST(request(), params())
    expect(res.status).toBe(403)
    expect(mocks.createWorkItemChecked).not.toHaveBeenCalled()
  })

  it("legt bei verlorenem Anspruch KEIN Work-Item an (AC-144.19)", async () => {
    queues.assistant_work_item_drafts = [
      { data: openDraft, error: null },
      // Das bedingte Update greift nicht — ein anderer Klick war schneller.
      { data: null, error: null },
    ]
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    expect(mocks.createWorkItemChecked).not.toHaveBeenCalled()
  })

  it("erzeugt das Work-Item und schließt den Entwurf ab (Happy Path)", async () => {
    queues.assistant_work_item_drafts = [
      { data: openDraft, error: null },
      { data: { id: DRAFT_ID }, error: null },
      { data: null, error: null },
    ]

    const res = await POST(request(), params())
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.work_item.id).toBe(WORK_ITEM_ID)
    expect(body.draft_id).toBe(DRAFT_ID)

    // Die Anlage läuft über den geteilten, geprüften Pfad (D3) …
    expect(mocks.createWorkItemChecked).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        userId: USER_ID,
        input: expect.objectContaining({ kind: "story", title: "Rechnungsimport testen" }),
      }),
    )

    // … erst beansprucht, dann abgeschlossen.
    expect(updates.map((u) => u.payload.status)).toEqual(["claiming", "confirmed"])
    expect(updates[1]?.payload.created_work_item_id).toBe(WORK_ITEM_ID)

    // Der mutierende Schritt ist protokolliert (AC-144.27).
    const auditEntry = inserts.find((i) => i.table === "assistant_action_events")
    expect(auditEntry?.payload).toMatchObject({
      action_key: "work_item_draft.confirm",
      confirmation_state: "confirmed",
      result_status: "success",
    })
  })

  it("übernimmt einen korrigierten Titel in das Work-Item", async () => {
    queues.assistant_work_item_drafts = [
      { data: openDraft, error: null },
      { data: { id: DRAFT_ID }, error: null },
      { data: null, error: null },
    ]

    const res = await POST(
      request({ title: "Rechnungsimport prüfen" }),
      params(),
    )
    expect(res.status).toBe(201)
    expect(mocks.createWorkItemChecked).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ title: "Rechnungsimport prüfen" }),
      }),
    )
    // Die Korrektur wird auch am Entwurf festgehalten.
    expect(updates[0]?.payload.title).toBe("Rechnungsimport prüfen")
  })

  it("gibt den Entwurf frei, wenn die Anlage scheitert", async () => {
    queues.assistant_work_item_drafts = [
      { data: openDraft, error: null },
      { data: { id: DRAFT_ID }, error: null },
      { data: null, error: null },
    ]
    mocks.createWorkItemChecked.mockResolvedValue({
      ok: false,
      failure: {
        code: "method_violation",
        message: "Kind 'story' is not visible in method 'waterfall'.",
        status: 422,
        field: "kind",
      },
    })

    const res = await POST(request(), params())
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("method_violation")
    // claiming → open, damit der Nutzer es erneut versuchen kann.
    expect(updates.map((u) => u.payload.status)).toEqual(["claiming", "open"])
    expect(inserts.find((i) => i.table === "assistant_action_events")).toBeUndefined()
  })

  it("lehnt einen leeren Titel im Body ab", async () => {
    const res = await POST(request({ title: "   " }), params())
    expect(res.status).toBe(400)
  })
})

function params(draftId: string = DRAFT_ID) {
  return { params: Promise.resolve({ draftId }) }
}

function request(body?: unknown): Request {
  return new Request(
    "http://localhost/api/assistant/work-item-drafts/x/confirm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
}

function next(table: string): { data: unknown; error: unknown } {
  const queue = queues[table]
  if (queue && queue.length > 0) return queue.shift()!
  return { data: null, error: null }
}

function chain(table: string) {
  const api: Record<string, unknown> = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    order: vi.fn(() => api),
    limit: vi.fn(() => api),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload })
      return api
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserts.push({ table, payload })
      return api
    }),
    maybeSingle: vi.fn(async () => next(table)),
    single: vi.fn(async () => next(table)),
    // Manche Aufrufe werden ohne `.select()` direkt awaited.
    then: (resolve: (value: unknown) => unknown) => resolve(next(table)),
  }
  return api
}
