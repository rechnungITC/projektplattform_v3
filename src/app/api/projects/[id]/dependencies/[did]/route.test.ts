import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PROJ-155-β.1 — PATCH (neu) und DELETE (gehärtet) am Kanten-Endpunkt.
 *
 * Der Prüfstand verteilt nach **Tabellenname**, nicht nach Aufrufreihenfolge,
 * und arbeitet mit setzbaren Ergebnisobjekten statt `mockResolvedValueOnce`.
 * Beides ist Absicht: `vi.clearAllMocks()` leert die `Once`-Warteschlange
 * **nicht**, weshalb ein früh abbrechender Fall dem nächsten eine Antwort
 * hinterlässt — genau der Fund F-Y143n.1, der dort einen Bestandstest nur
 * zufällig sicher machte.
 */

const getUserMock = vi.fn()

type Result = { data: unknown; error: unknown }

let dependencySelectResult: Result = { data: null, error: null }
let phasesResult: Result = { data: [], error: null }
let workItemsResult: Result = { data: [], error: null }
let updateResult: Result = { data: null, error: null }
let deleteResult: Result = { error: null, data: null }

const updateSpy = vi.fn()
const deleteSpy = vi.fn()

function listChain(get: () => Result) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(self)
  chain.limit = vi.fn(self)
  chain.maybeSingle = vi.fn(async () => get())
  chain.then = (
    resolve: (v: Result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(get()).then(resolve, reject)
  return chain
}

const dependenciesChain: Record<string, unknown> = {}
{
  const self = () => dependenciesChain
  dependenciesChain.select = vi.fn(self)
  dependenciesChain.eq = vi.fn(self)
  dependenciesChain.maybeSingle = vi.fn(async () =>
    // Nach einem `update()` liefert dieselbe Kette das Update-Ergebnis; davor
    // das gelesene Kanten-Objekt. Der Schalter ist der Aufruf von `update`,
    // nicht die Reihenfolge — sonst hinge der Prüfstand an der Implementierung.
    updateSpy.mock.calls.length > 0 ? updateResult : dependencySelectResult,
  )
  dependenciesChain.update = vi.fn((patch: unknown) => {
    updateSpy(patch)
    return dependenciesChain
  })
  dependenciesChain.delete = vi.fn(() => {
    deleteSpy()
    return dependenciesChain
  })
  dependenciesChain.then = (
    resolve: (v: Result) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(deleteResult).then(resolve, reject)
}

const fromMock = vi.fn((table: string) => {
  if (table === "dependencies") return dependenciesChain
  if (table === "phases") return listChain(() => phasesResult)
  if (table === "work_items") return listChain(() => workItemsResult)
  throw new Error(`unerwartete Tabelle ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

const { PATCH, DELETE } = await import("./route")

const PROJECT = "11111111-1111-4111-8111-111111111111"
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222"
const DEP = "33333333-3333-4333-8333-333333333333"
const WP_A = "44444444-4444-4444-8444-444444444444"
const WP_B = "55555555-5555-4555-8555-555555555555"

const EDGE = {
  id: DEP,
  from_type: "work_package",
  from_id: WP_A,
  to_type: "work_package",
  to_id: WP_B,
}

function ctx(projectId = PROJECT, did = DEP) {
  return { params: Promise.resolve({ id: projectId, did }) }
}

function req(body: unknown) {
  return new Request("http://test/x", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** Kante liegt im Projekt: die Arbeitspaket-Abfrage findet einen Endpunkt. */
function edgeInProject() {
  dependencySelectResult = { data: EDGE, error: null }
  workItemsResult = { data: [{ id: WP_A }], error: null }
  phasesResult = { data: [], error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
  dependencySelectResult = { data: null, error: null }
  phasesResult = { data: [], error: null }
  workItemsResult = { data: [], error: null }
  updateResult = { data: null, error: null }
  deleteResult = { error: null, data: null }
})

describe("PATCH — Eingabeprüfung", () => {
  it("weist eine ungültige Projekt-Kennung ab", async () => {
    const res = await PATCH(req({ constraint_type: "SS" }), ctx("keine-uuid"))
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("weist eine ungültige Kanten-Kennung ab", async () => {
    const res = await PATCH(req({ constraint_type: "SS" }), ctx(PROJECT, "x"))
    expect(res.status).toBe(400)
  })

  it("weist einen leeren Rumpf ab statt still nichts zu tun", async () => {
    const res = await PATCH(req({}), ctx())
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain("Nichts zu ändern")
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("weist einen unbekannten Kantentyp ab", async () => {
    const res = await PATCH(req({ constraint_type: "XX" }), ctx())
    expect(res.status).toBe(400)
  })

  it("weist einen Abstand ausserhalb der Spanne ab", async () => {
    const res = await PATCH(req({ lag_days: 99_999 }), ctx())
    expect(res.status).toBe(400)
  })

  it("erlaubt einen negativen Abstand — Überlappung ist fachlich gewollt", async () => {
    edgeInProject()
    updateResult = { data: { ...EDGE, lag_days: -3 }, error: null }
    const res = await PATCH(req({ lag_days: -3 }), ctx())
    expect(res.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledWith({ lag_days: -3 })
  })

  it("ist nicht angemeldet → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(401)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("PATCH — Projektzugehörigkeit", () => {
  it("meldet 404, wenn die Kante nicht existiert oder verborgen ist", async () => {
    dependencySelectResult = { data: null, error: null }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(404)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("meldet 404 für eine Kante eines FREMDEN Projekts — und schreibt nicht", async () => {
    // Der Kern der Härtung: die Kante ist im Mandanten sichtbar (RLS lässt
    // sie durch), gehört aber nicht zu diesem Projekt. Ohne die Prüfung wäre
    // die Projekt-Kennung in der Adresse Dekoration.
    dependencySelectResult = { data: EDGE, error: null }
    phasesResult = { data: [], error: null }
    workItemsResult = { data: [], error: null }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx(OTHER_PROJECT))
    expect(res.status).toBe(404)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("erkennt eine Kante, deren Endpunkt eine Phase dieses Projekts ist", async () => {
    dependencySelectResult = {
      data: { ...EDGE, from_type: "phase", to_type: "phase" },
      error: null,
    }
    phasesResult = { data: [{ id: WP_A }], error: null }
    updateResult = { data: { id: DEP }, error: null }
    const res = await PATCH(req({ constraint_type: "FF" }), ctx())
    expect(res.status).toBe(200)
  })

  it("erkennt eine Kante, die am Projekt selbst hängt, ohne Zusatzabfrage", async () => {
    dependencySelectResult = {
      data: { ...EDGE, from_type: "project", from_id: PROJECT },
      error: null,
    }
    updateResult = { data: { id: DEP }, error: null }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(200)
    // Weder Phasen noch Arbeitspakete mussten befragt werden.
    expect(fromMock).not.toHaveBeenCalledWith("phases")
    expect(fromMock).not.toHaveBeenCalledWith("work_items")
  })
})

describe("PATCH — Schreiben", () => {
  it("schreibt nur den Kantentyp, wenn nur er gesendet wurde", async () => {
    edgeInProject()
    updateResult = { data: { ...EDGE, constraint_type: "SS" }, error: null }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledWith({ constraint_type: "SS" })
  })

  it("schreibt beide Felder, wenn beide gesendet wurden", async () => {
    edgeInProject()
    updateResult = { data: { id: DEP }, error: null }
    await PATCH(req({ constraint_type: "SF", lag_days: 5 }), ctx())
    expect(updateSpy).toHaveBeenCalledWith({
      constraint_type: "SF",
      lag_days: 5,
    })
  })

  it("bildet den doppelten Eintrag auf 422 ab statt auf rohen Indexnamen", async () => {
    edgeInProject()
    updateResult = { data: null, error: { code: "23505", message: "duplicate key" } }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("duplicate_dependency")
    expect(body.error.message).toContain("bereits eine Abhängigkeit")
  })

  it("bildet einen Kreis auf deutschen Klartext ab", async () => {
    edgeInProject()
    updateResult = {
      data: null,
      error: { code: "23514", message: "dependency cycle detected" },
    }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("cycle_detected")
    expect(body.error.message).toContain("Kreis")
    // Der rohe Datenbanktext darf nicht durchschlagen.
    expect(body.error.message).not.toContain("cycle detected")
  })

  it("meldet 403 statt eines wirkungslosen 200, wenn das UPDATE nichts trifft", async () => {
    edgeInProject()
    updateResult = { data: null, error: null }
    const res = await PATCH(req({ constraint_type: "SS" }), ctx())
    expect(res.status).toBe(403)
  })
})

describe("DELETE — dieselbe Härtung", () => {
  it("löscht eine Kante des Projekts", async () => {
    edgeInProject()
    const res = await DELETE(new Request("http://test/x"), ctx())
    expect(res.status).toBe(204)
    expect(deleteSpy).toHaveBeenCalled()
  })

  it("löscht NICHT über die Adresse eines fremden Projekts", async () => {
    // Vor PROJ-155-β.1 gelang genau das: die Route löschte allein nach
    // Kanten-Kennung. Kein Mandantenleck, aber Wirkung am falschen Ort.
    dependencySelectResult = { data: EDGE, error: null }
    phasesResult = { data: [], error: null }
    workItemsResult = { data: [], error: null }
    const res = await DELETE(new Request("http://test/x"), ctx(OTHER_PROJECT))
    expect(res.status).toBe(404)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("weist eine ungültige Kennung ab, bevor irgendetwas geladen wird", async () => {
    const res = await DELETE(new Request("http://test/x"), ctx(PROJECT, "nope"))
    expect(res.status).toBe(400)
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})
