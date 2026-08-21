import { beforeEach, describe, expect, it, vi } from "vitest"

import { createModuleGateHarness } from "@/test/module-gate-harness"

// PROJ-45-δ — Tests des CSV-Exports der Terminsignale.
//
// Wie beim Schwester-Test ist NUR der Supabase-Client gemockt; Sitzung,
// Projektzugriff und Modul-Tor fahren echt (AC-45δH-12).
//
// Tragend sind zwei Zusicherungen, die man beim Rendern übersieht: die
// Formel-Neutralisierung (ein Gewerkname darf in Excel keine Formel werden) und
// die LEERE Zelle bei fehlendem Fortschritt — 0 % zu schreiben wäre eine
// Falschaussage (AC-45δ.10).

const harness = createModuleGateHarness()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => harness.client),
}))

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const OWNER = "cccccccc-3333-4333-8333-cccccccccccc"

const SIGNALS = {
  project_id: PROJECT,
  as_of: "2026-08-20",
  window_days: 14,
  summary: {
    overdue_defects: 1,
    defects_without_due_date: 0,
    defects_awaiting_review: 0,
    blocked_trades: 1,
    trades_total: 1,
    sections_total: 2,
  },
  trades: [
    {
      project_trade_id: "11111111-1111-4111-8111-111111111111",
      trade_id: "22222222-2222-4222-8222-222222222222",
      // Führendes Minus: in Excel eine Formel, wenn nicht neutralisiert.
      trade_label: "-Rohbau, Nord",
      manual_status: "rot",
      responsible_user_id: OWNER,
      is_blocked: true,
      blocker_reasons: ["overdue_defects", "acceptance_refused"],
      overdue_defects: 1,
      defects_without_due_date: 0,
      defects_awaiting_review: 0,
      acceptances_refused: 1,
      acceptances_overdue_scheduled: 0,
      acceptances_with_open_reservations: 0,
    },
  ],
  sections: [
    {
      section_id: "33333333-3333-4333-8333-333333333333",
      parent_id: null,
      label: "Haus A",
      sort_order: 1,
      subtree_depth: 1,
      // PROJ-Y-45l: bewusst der GEKAPPTE Fall, damit die neue Spalte beide
      // Werte zeigt (Haus B unten ist der Normalfall). Ohne einen gekappten
      // Datensatz wuerde die Spalte nur "nein" ausgeben und der Test belegte
      // nicht, dass sie ueberhaupt vom Feld abhaengt.
      subtree_truncated: true,
      progress_source: "work_items",
      source_count: 4,
      linked_count: 5,
      progress_percent: 50,
      overdue_items: 1,
      phase_linked_count: 0,
    },
    {
      section_id: "44444444-4444-4444-8444-444444444444",
      parent_id: null,
      label: "Haus B",
      sort_order: 2,
      subtree_depth: 0,
      subtree_truncated: false,
      // Nichts verknüpft -> KEIN Fortschritt (AC-45δ.10).
      progress_source: null,
      source_count: 0,
      linked_count: 0,
      progress_percent: null,
      overdue_items: 0,
      phase_linked_count: 0,
    },
  ],
  deadlines: [
    {
      kind: "mangel",
      ref_id: "55555555-5555-4555-8555-555555555555",
      ref_number: 7,
      label: "Fuge undicht",
      due_on: "2026-08-18",
      is_elapsed: true,
      project_trade_id: "11111111-1111-4111-8111-111111111111",
      trade_label: "-Rohbau, Nord",
      section_id: "33333333-3333-4333-8333-333333333333",
      section_label: "Haus A",
    },
  ],
  overdue_defects: [
    {
      defect_id: "55555555-5555-4555-8555-555555555555",
      ref_number: 7,
      title: 'Riss im "Sturz"',
      severity: "hoch",
      status: "offen",
      due_date: "2026-08-18",
      days_overdue: 2,
      project_trade_id: "11111111-1111-4111-8111-111111111111",
      trade_label: "-Rohbau, Nord",
      section_id: "33333333-3333-4333-8333-333333333333",
      section_label: "Haus A",
      responsible_user_id: OWNER,
    },
  ],
}

function projectFound(found: boolean) {
  harness.table("projects").maybeSingle = vi.fn(async () => ({
    data: found ? { id: PROJECT, tenant_id: TENANT } : null,
    error: null,
  }))
}

function call(query = "", id: string = PROJECT) {
  return GET(new Request(`http://t/${query}`), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  harness.reset()
  projectFound(true)
  harness.client.rpc.mockResolvedValue({ data: SIGNALS, error: null })
  harness.table("profiles").result = {
    data: [{ id: OWNER, display_name: "Bauleitung Nord", email: null }],
    error: null,
  }
})

describe("gates", () => {
  it("refuses a malformed project id before touching the database", async () => {
    const res = await call("", "not-a-uuid")
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_id")
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("refuses without a session", async () => {
    harness.userId = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("passes the project-access refusal through unchanged", async () => {
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
    expect((await res.json()).error.message).toBe("Resource not found.")
    expect(harness.settingsLookups).toEqual([TENANT])
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("refuses an unknown section with a speaking code", async () => {
    const res = await call("?section=erfunden")
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_section")
    // Ein Tippfehler bekommt keine plausible, aber falsche Datei.
    expect(harness.client.rpc).not.toHaveBeenCalled()
  })

  it("maps an evaluation failure to 500", async () => {
    harness.client.rpc.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    })
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("export_failed")
  })
})

describe("CSV rendering", () => {
  it("defaults to the trades section", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv.split("\n")[0]).toBe(
      "gewerk,manuelle_ampel,verantwortlich,blockiert,blocker_gruende," +
        "maengel_ueberfaellig,maengel_ohne_frist,maengel_wartet_auf_pruefung," +
        "abnahmen_verweigert,abnahmen_termin_ueberfaellig,abnahmen_offene_vorbehalte"
    )
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("X-Export-Scope")).toBe(
      "construction-schedule-signals-visible-to-caller"
    )
    expect(res.headers.get("Content-Disposition")).toContain(
      `terminsignale-${PROJECT.slice(0, 8)}-trades-`
    )
  })

  it("uses the SAME evaluation as the surface, not a second query", async () => {
    await call("?section=deadlines")
    expect(harness.client.rpc).toHaveBeenCalledTimes(1)
    expect(harness.client.rpc).toHaveBeenCalledWith(
      "construction_schedule_signals",
      { p_project_id: PROJECT }
    )
  })

  it("neutralises a leading minus and quotes the comma", async () => {
    const csv = await (await call("?section=trades")).text()
    // Führendes Minus wird mit ' entschärft, das Komma erzwingt Anführung.
    expect(csv.split("\n")[1]).toContain(`"'-Rohbau, Nord"`)
  })

  it("resolves the responsible user to a display name", async () => {
    const csv = await (await call("?section=trades")).text()
    expect(csv).toContain("Bauleitung Nord")
    expect(csv).not.toContain(OWNER)
  })

  it("falls back to the id when no profile is readable", async () => {
    harness.table("profiles").result = { data: [], error: null }
    const csv = await (await call("?section=trades")).text()
    expect(csv).toContain(OWNER)
  })

  it("writes the blocker reasons and the blocked flag in words", async () => {
    const row = (await (await call("?section=trades")).text()).split("\n")[1]
    expect(row).toContain("ja")
    expect(row).toContain("overdue_defects acceptance_refused")
  })

  it("leaves the progress cells EMPTY when nothing is linked", async () => {
    const lines = (await (await call("?section=sections")).text()).split("\n")
    expect(lines[0]).toContain("fortschritt_prozent")
    // PROJ-Y-45l: die Kappung steht auch in der CSV — sie hier weglassen hiesse,
    // die stille Unterberichtung nur aus der Oberfläche zu entfernen.
    expect(lines[0]).toContain("teilbaum_gekappt")
    // Haus A: Quelle und 50 vorhanden, Teilbaum gekappt.
    expect(lines[1]).toBe("Haus A,1,ja,work_items,50,4,5,1,0")
    // Haus B: zwei leere Zellen statt 0 % — sonst wäre der Export eine
    // Falschaussage (AC-45δ.10) — und nicht gekappt.
    expect(lines[2]).toBe("Haus B,0,nein,,,0,0,0,0")
  })

  it("renders the deadlines section with the elapsed flag", async () => {
    const lines = (await (await call("?section=deadlines")).text()).split("\n")
    expect(lines[0]).toBe(
      "art,nummer,bezeichnung,frist,verstrichen,gewerk,abschnitt"
    )
    expect(lines[1]).toBe(
      'mangel,7,Fuge undicht,2026-08-18,ja,"\'-Rohbau, Nord",Haus A'
    )
  })

  it("renders the overdue-defects section and doubles inner quotes", async () => {
    const lines = (
      await (await call("?section=overdue_defects")).text()
    ).split("\n")
    expect(lines[0]).toBe(
      "nummer,titel,schwere,status,frist,tage_ueber_frist,gewerk,abschnitt,verantwortlich"
    )
    expect(lines[1]).toContain('"Riss im ""Sturz"""')
    expect(lines[1]).toContain("Bauleitung Nord")
  })

  it("names the section in the filename", async () => {
    const res = await call("?section=overdue_defects")
    expect(res.headers.get("Content-Disposition")).toContain(
      `terminsignale-${PROJECT.slice(0, 8)}-overdue_defects-`
    )
  })

  it("emits a header-only file for an empty evaluation", async () => {
    harness.client.rpc.mockResolvedValue({ data: null, error: null })
    const csv = await (await call("?section=trades")).text()
    expect(csv.split("\n")).toHaveLength(2)
    expect(csv.endsWith("\n")).toBe(true)
  })
})
