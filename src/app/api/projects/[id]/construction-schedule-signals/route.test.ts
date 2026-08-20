import { beforeEach, describe, expect, it, vi } from "vitest"

import { createModuleGateHarness } from "@/test/module-gate-harness"

// PROJ-45-δ — Tests der Terminsignal-Auswertung.
//
// Anders als die α/β/γ-Route-Tests wird hier NICHTS von den Toren wegmockt:
// gemockt ist allein der Supabase-Client (`@/lib/supabase/server`), also fahren
// `getAuthenticatedUserId`, `requireProjectAccess` UND `requireModuleActive`
// echt. Das ist der Punkt von AC-45δH-12: α musste das Modul-Tor damals in alle
// sieben Routen nachziehen, weil die Navigations-Registry es voraussetzt — mit
// einem `moduleMock.mockResolvedValue(null)` hätte man das neue Tor nur
// weggemockt und der Test wäre auch ohne Tor grün.
//
// Was ein Mock hier NICHT beweisen kann und auch nicht behauptet: dass die
// Auswertung selbst unter fremder RLS nichts verrät. Das ist Sache des
// Live-Pentests (Aggregat-Leck-Probe).

const harness = createModuleGateHarness()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => harness.client),
}))

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"

const SIGNALS = {
  project_id: PROJECT,
  as_of: "2026-08-20",
  window_days: 14,
  summary: {
    overdue_defects: 2,
    defects_without_due_date: 1,
    defects_awaiting_review: 3,
    blocked_trades: 1,
    trades_total: 4,
    sections_total: 5,
  },
  trades: [],
  sections: [],
  deadlines: [],
  overdue_defects: [],
}

/** Lässt `requireProjectAccess` das Projekt finden — oder eben nicht. */
function projectFound(found: boolean) {
  harness.table("projects").maybeSingle = vi.fn(async () => ({
    data: found ? { id: PROJECT, tenant_id: TENANT } : null,
    error: null,
  }))
}

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}

function call(id: string = PROJECT) {
  return GET(new Request("http://t/"), ctx(id))
}

beforeEach(() => {
  harness.reset()
  projectFound(true)
  harness.client.rpc.mockResolvedValue({ data: SIGNALS, error: null })
})

describe("GET /api/projects/[id]/construction-schedule-signals", () => {
  it("returns the evaluation for the project", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signals: SIGNALS })
    expect(harness.client.rpc).toHaveBeenCalledWith(
      "construction_schedule_signals",
      { p_project_id: PROJECT }
    )
  })

  it("refuses a malformed project id before touching the database", async () => {
    const res = await call("not-a-uuid")
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_id")
    expect(harness.client.rpc).not.toHaveBeenCalled()
    expect(harness.settingsLookups).toEqual([])
  })

  it("refuses without a session", async () => {
    harness.userId = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("passes the project-access refusal through unchanged", async () => {
    // RLS verbirgt fremde Projekte -> null -> 404, und zwar BEVOR das Modul-Tor
    // überhaupt befragt wird: die leere Nachschlagliste belegt die Reihenfolge.
    projectFound(false)
    const res = await call()
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("Project not found.")
    expect(harness.settingsLookups).toEqual([])
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("answers 404 with the construction module off (AC-45δH-12)", async () => {
    harness.activeModules = harness.activeModules!.filter(
      (m) => m !== "construction"
    )
    const res = await call()
    expect(res.status).toBe(404)
    // Lese-Absicht: die Fläche verrät ihre Existenz nicht — dieselbe Antwort
    // wie für ein fremdes Projekt, aber aus dem Modul-Tor, nachgewiesen am
    // Wortlaut und daran, dass das Tor den RICHTIGEN Mandanten befragt hat.
    expect((await res.json()).error.message).toBe("Resource not found.")
    expect(harness.settingsLookups).toEqual([TENANT])
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("still answers with the module on — the gate is not a blanket deny", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(harness.settingsLookups).toEqual([TENANT])
  })

  it("maps an evaluation failure to 500", async () => {
    harness.client.rpc.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    })
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("signals_failed")
  })

  it("returns null instead of undefined for an empty evaluation", async () => {
    harness.client.rpc.mockResolvedValue({ data: null, error: null })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signals: null })
  })
})
