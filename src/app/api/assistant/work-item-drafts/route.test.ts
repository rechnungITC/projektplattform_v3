import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-144 — Liste der offenen Sprach-Entwürfe (Overlay, Lock L7).
// Geprüft wird vor allem, dass die Abfrage auf den Aufrufer eingeschränkt ist:
// Entwürfe sind nutzer-privat (AC-144.18). Der eigentliche Schutz ist die
// RLS-Regel der Tabelle; dieser Filter ist die zweite Reihe.

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  getAuthenticatedUserId: vi.fn(),
  resolveActiveTenantId: vi.fn(),
  requireTenantMember: vi.fn(),
  requireModuleActive: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: mocks.getAuthenticatedUserId,
    requireTenantMember: mocks.requireTenantMember,
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantId,
}))

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: mocks.requireModuleActive,
}))

import { GET } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"

let eqCalls: Array<[string, unknown]> = []
let rows: unknown[] = []

beforeEach(() => {
  vi.clearAllMocks()
  eqCalls = []
  rows = []
  mocks.getAuthenticatedUserId.mockResolvedValue({
    userId: USER_ID,
    supabase: mocks.supabase,
  })
  mocks.resolveActiveTenantId.mockResolvedValue(TENANT_ID)
  mocks.requireTenantMember.mockResolvedValue(null)
  mocks.requireModuleActive.mockResolvedValue(null)
  mocks.supabase.from.mockImplementation(() => chain())
})

describe("GET /api/assistant/work-item-drafts", () => {
  it("antwortet 401 ohne Anmeldung", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({
      userId: null,
      supabase: mocks.supabase,
    })
    expect((await GET()).status).toBe(401)
  })

  it("antwortet 403 ohne aktiven Mandanten", async () => {
    mocks.resolveActiveTenantId.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
  })

  it("schränkt auf eigenen Nutzer, Mandanten und offene Entwürfe ein", async () => {
    await GET()
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["tenant_id", TENANT_ID],
        ["user_id", USER_ID],
        ["status", "open"],
      ]),
    )
  })

  it("liefert den Projektnamen und markiert eine abweichende Art", async () => {
    rows = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        title: "Schnittstelle abnehmen",
        description: null,
        target_kind: "work_package",
        requested_kind: "story",
        project_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-08-11T10:00:00Z",
        projects: { name: "Bau Nord" },
      },
      {
        id: "44444444-4444-4444-8444-444444444445",
        title: "Rechnungsimport testen",
        description: "Rest",
        target_kind: "story",
        requested_kind: "story",
        project_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-08-11T09:00:00Z",
        projects: [{ name: "ERP-Rollout" }],
      },
    ]

    const body = await (await GET()).json()
    expect(body.drafts).toHaveLength(2)
    expect(body.drafts[0]).toMatchObject({
      project_name: "Bau Nord",
      kind_was_mapped: true,
    })
    // Auch die Array-Form der eingebetteten Relation wird gelesen.
    expect(body.drafts[1]).toMatchObject({
      project_name: "ERP-Rollout",
      kind_was_mapped: false,
    })
  })
})

function chain() {
  const api: Record<string, unknown> = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value])
      return api
    }),
    order: vi.fn(() => api),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  }
  return api
}
