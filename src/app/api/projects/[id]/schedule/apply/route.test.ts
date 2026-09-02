import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PROJ-155-β.2 — `POST …/schedule/apply`.
 *
 * Der Prüfstand verteilt nach **Tabellenname** und nutzt setzbare
 * Ergebnisobjekte statt `mockResolvedValueOnce` — `vi.clearAllMocks()` leert die
 * `Once`-Warteschlange nicht, weshalb ein früh abbrechender Fall dem nächsten
 * eine Antwort hinterlässt (Fund F-Y143n.1).
 *
 * Der tragende Fall ist AC-20: Phase **und** ihre Kind-Meilensteine müssen in
 * EINEM RPC-Aufruf landen. Der heutige Pfad macht daraus N einzelne PATCHes mit
 * verschluckten Fehlern.
 */

type Result = { data: unknown; error: unknown }

const getUserMock = vi.fn()
const rpcMock = vi.fn()
const requireAccessMock = vi.fn()

let phaseResult: Result = { data: null, error: null }
let milestonesResult: Result = { data: [], error: null }
let workItemsResult: Result = { data: [], error: null }
let dependenciesResult: Result = { data: [], error: null }

function chain(get: () => Result) {
  const c: Record<string, unknown> = {}
  const self = () => c
  c.select = vi.fn(self)
  c.eq = vi.fn(self)
  c.maybeSingle = vi.fn(async () => get())
  c.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return c
}

const fromMock = vi.fn((table: string) => {
  if (table === "phases") return chain(() => phaseResult)
  if (table === "milestones") return chain(() => milestonesResult)
  if (table === "work_items") return chain(() => workItemsResult)
  if (table === "dependencies") return chain(() => dependenciesResult)
  throw new Error(`unerwartete Tabelle ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

vi.mock("@/app/api/_lib/route-helpers", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, requireProjectAccess: requireAccessMock }
})

const { POST } = await import("./route")

const PROJECT = "11111111-1111-4111-8111-111111111111"
const WP_A = "44444444-4444-4444-8444-444444444444"
const WP_B = "55555555-5555-4555-8555-555555555555"
const PHASE = "66666666-6666-4666-8666-666666666666"
const MS_1 = "77777777-7777-4777-8777-777777777777"
const MS_2 = "88888888-8888-4888-8888-888888888888"

function ctx(projectId = PROJECT) {
  return { params: Promise.resolve({ id: projectId }) }
}

function req(body: unknown) {
  return new Request("http://test/x", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** Die Liste der Verschiebungen, die die Route an die RPC gegeben hat. */
function sentShifts(): { kind: string; id: string }[] {
  const call = rpcMock.mock.calls.at(-1)
  return (call?.[1] as { p_shifts: { kind: string; id: string }[] }).p_shifts
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
  requireAccessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
  rpcMock.mockResolvedValue({
    data: { work_items: 1, phases: 0, milestones: 0, total: 1 },
    error: null,
  })
  phaseResult = { data: null, error: null }
  milestonesResult = { data: [], error: null }
  workItemsResult = { data: [], error: null }
  dependenciesResult = { data: [], error: null }
})

describe("POST schedule/apply — Tore", () => {
  it("ohne Sitzung 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }), ctx())
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("ohne Bearbeitungsrecht wird die Absage des Helfers durchgereicht", async () => {
    const forbidden = new Response(null, { status: 403 })
    requireAccessMock.mockResolvedValue({ error: forbidden })
    const res = await POST(req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }), ctx())
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("kaputte Projekt-Kennung 400, ohne die Sitzung zu bemuehen", async () => {
    const res = await POST(req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }), ctx("nicht-uuid"))
    expect(res.status).toBe(400)
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it("kein JSON 400", async () => {
    const res = await POST(req("{kaputt"), ctx())
    expect(res.status).toBe(400)
  })
})

describe("POST schedule/apply — Eingabepruefung", () => {
  it("work_item ohne Termine 400", async () => {
    const res = await POST(req({ kind: "work_item", id: WP_A }), ctx())
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("milestone ohne Zieldatum 400", async () => {
    const res = await POST(req({ kind: "milestone", id: MS_1 }), ctx())
    expect(res.status).toBe(400)
  })

  it("Ende vor Anfang 400", async () => {
    const res = await POST(req({ kind: "work_item", id: WP_A, start: "2026-06-10", end: "2026-06-01" }), ctx())
    expect(res.status).toBe(400)
  })

  it("unbekannte Art 400", async () => {
    const res = await POST(req({ kind: "gewerk", id: WP_A, start: "2026-06-01", end: "2026-06-02" }), ctx())
    expect(res.status).toBe(400)
  })
})

describe("POST schedule/apply — AC-20: Phase und Meilensteine in EINEM Aufruf", () => {
  it("die Kind-Meilensteine reisen in derselben RPC mit", async () => {
    phaseResult = { data: { planned_start: "2026-06-01" }, error: null }
    milestonesResult = {
      data: [
        { id: MS_1, target_date: "2026-06-05" },
        { id: MS_2, target_date: "2026-06-08" },
      ],
      error: null,
    }
    const res = await POST(
      req({ kind: "phase", id: PHASE, start: "2026-06-04", end: "2026-06-13" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    // EIN Aufruf, nicht drei.
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const shifts = sentShifts()
    expect(shifts).toHaveLength(3)
    expect(shifts[0]).toMatchObject({ kind: "phase", id: PHASE })
    // +3 Tage, weil die Phase vom 01. auf den 04. wandert.
    expect(shifts).toContainEqual({ kind: "milestone", id: MS_1, target: "2026-06-08" })
    expect(shifts).toContainEqual({ kind: "milestone", id: MS_2, target: "2026-06-11" })
  })

  it("ohne Verschiebung (Resize) reisen keine Meilensteine mit", async () => {
    phaseResult = { data: { planned_start: "2026-06-01" }, error: null }
    milestonesResult = { data: [{ id: MS_1, target_date: "2026-06-05" }], error: null }
    // Start bleibt, nur das Ende wandert -> Verschiebung 0.
    const res = await POST(
      req({ kind: "phase", id: PHASE, start: "2026-06-01", end: "2026-06-20" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(sentShifts()).toHaveLength(1)
  })

  it("ein Meilenstein ohne Zieldatum wird uebersprungen, nicht erfunden", async () => {
    phaseResult = { data: { planned_start: "2026-06-01" }, error: null }
    milestonesResult = {
      data: [
        { id: MS_1, target_date: null },
        { id: MS_2, target_date: "2026-06-08" },
      ],
      error: null,
    }
    const res = await POST(
      req({ kind: "phase", id: PHASE, start: "2026-06-04", end: "2026-06-13" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    const shifts = sentShifts()
    expect(shifts.map((s) => s.id)).toEqual([PHASE, MS_2])
  })
})

describe("POST schedule/apply — die Kaskade", () => {
  it("Nachfolger werden mitgeschickt", async () => {
    workItemsResult = {
      data: [
        { id: WP_A, planned_start: "2026-06-01", planned_end: "2026-06-10" },
        { id: WP_B, planned_start: "2026-06-11", planned_end: "2026-06-20" },
      ],
      error: null,
    }
    dependenciesResult = {
      data: [{ from_id: WP_A, to_id: WP_B, constraint_type: "FS", lag_days: 0 }],
      error: null,
    }
    const res = await POST(
      req({ kind: "work_item", id: WP_A, start: "2026-06-06", end: "2026-06-15" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    const shifts = sentShifts()
    expect(shifts).toHaveLength(2)
    expect(shifts).toContainEqual({
      kind: "work_item",
      id: WP_B,
      start: "2026-06-16",
      end: "2026-06-25",
    })
  })

  it("ohne Kanten wird nur der gezogene Knoten geschickt", async () => {
    workItemsResult = {
      data: [{ id: WP_A, planned_start: "2026-06-01", planned_end: "2026-06-10" }],
      error: null,
    }
    const res = await POST(
      req({ kind: "work_item", id: WP_A, start: "2026-06-06", end: "2026-06-15" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(sentShifts()).toHaveLength(1)
  })

  it("eine veraltete Vorschau wird als Abweichung gemeldet", async () => {
    workItemsResult = {
      data: [
        { id: WP_A, planned_start: "2026-06-01", planned_end: "2026-06-10" },
        { id: WP_B, planned_start: "2026-06-11", planned_end: "2026-06-20" },
      ],
      error: null,
    }
    dependenciesResult = {
      data: [{ from_id: WP_A, to_id: WP_B, constraint_type: "FS", lag_days: 0 }],
      error: null,
    }
    const res = await POST(
      req({
        kind: "work_item",
        id: WP_A,
        start: "2026-06-06",
        end: "2026-06-15",
        // Der Browser dachte, niemand muesse mit.
        expected_shift_ids: [],
      }),
      ctx(),
    )
    const body = await res.json()
    expect(body.diverged_from_preview).toBe(true)
  })

  it("eine stimmige Vorschau meldet keine Abweichung", async () => {
    workItemsResult = {
      data: [
        { id: WP_A, planned_start: "2026-06-01", planned_end: "2026-06-10" },
        { id: WP_B, planned_start: "2026-06-11", planned_end: "2026-06-20" },
      ],
      error: null,
    }
    dependenciesResult = {
      data: [{ from_id: WP_A, to_id: WP_B, constraint_type: "FS", lag_days: 0 }],
      error: null,
    }
    const res = await POST(
      req({
        kind: "work_item",
        id: WP_A,
        start: "2026-06-06",
        end: "2026-06-15",
        expected_shift_ids: [WP_B],
      }),
      ctx(),
    )
    const body = await res.json()
    expect(body.diverged_from_preview).toBe(false)
  })
})

describe("POST schedule/apply — Fehler der RPC", () => {
  it("P0002 wird 409 mit der Zusage, dass nichts geaendert wurde", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "not writable" } })
    const res = await POST(
      req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }),
      ctx(),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe("shift_target_not_writable")
    expect(body.error.message).toContain("kein Termin geändert")
  })

  it("42501 wird 403", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    const res = await POST(
      req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("22023 wird 422", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "22023", message: "bad" } })
    const res = await POST(
      req({ kind: "work_item", id: WP_A, start: "2026-06-01", end: "2026-06-02" }),
      ctx(),
    )
    expect(res.status).toBe(422)
  })
})
