import { afterEach, describe, expect, it, vi } from "vitest"

import { CONSTRUCTION_RAG_LABELS } from "@/types/construction"
import type {
  ConstructionDeadlineEntry,
  ConstructionSectionSignal,
} from "@/types/construction-signals"

import {
  constructionScheduleSignalsExportUrl,
  fetchConstructionScheduleSignals,
} from "./api"
import {
  CONSTRUCTION_BLOCKER_REASONS,
  CONSTRUCTION_BLOCKER_REASON_LABELS,
  CONSTRUCTION_MANUAL_STATUS_LABELS,
  deadlinesElapsedFirst,
  describeProgressSource,
  hasCancelledOnlyLinks,
  hasComparableProgress,
  splitDeadlines,
} from "./signals"

/** Abschnittszeile mit den Feldern, die die Quellenangabe wirklich liest. */
function section(
  over: Partial<ConstructionSectionSignal> = {}
): ConstructionSectionSignal {
  return {
    section_id: "11111111-1111-4111-8111-111111111111",
    parent_id: null,
    label: "Bauabschnitt",
    sort_order: 0,
    subtree_depth: 0,
    progress_source: null,
    source_count: 0,
    linked_count: 0,
    progress_percent: null,
    overdue_items: 0,
    phase_linked_count: 0,
    ...over,
  }
}

function deadline(
  over: Partial<ConstructionDeadlineEntry> = {}
): ConstructionDeadlineEntry {
  return {
    kind: "mangel",
    ref_id: "22222222-2222-4222-8222-222222222222",
    ref_number: 1,
    label: "Riss im Putz",
    due_on: "2026-08-20",
    is_elapsed: false,
    project_trade_id: null,
    trade_label: null,
    section_id: null,
    section_label: null,
    ...over,
  }
}

describe("CONSTRUCTION_BLOCKER_REASON_LABELS", () => {
  /**
   * Vollständigkeit gegen die Union erzwingt der TOTALE `Record` beim
   * Kompilieren — ein fünfter Grund ohne Beschriftung baut nicht. Dieser Fall
   * prüft das, was der Typ NICHT sieht: dass keine Beschriftung leer ist, keine
   * bloss den technischen Schlüssel wiederholt und keine zwei Gründe denselben
   * Text tragen (sonst wäre die Angabe im Register nicht unterscheidbar).
   */
  it("beschriftet jeden Grund deutsch, eindeutig und nicht mit seinem Schlüssel", () => {
    expect(CONSTRUCTION_BLOCKER_REASONS.length).toBeGreaterThan(0)

    const seen = new Set<string>()
    for (const reason of CONSTRUCTION_BLOCKER_REASONS) {
      const label = CONSTRUCTION_BLOCKER_REASON_LABELS[reason]
      expect(label.trim()).not.toBe("")
      expect(label).not.toBe(reason)
      expect(label).not.toMatch(/_/)
      expect(seen.has(label)).toBe(false)
      seen.add(label)
    }
    expect(seen.size).toBe(CONSTRUCTION_BLOCKER_REASONS.length)
  })

  it("kennt genau die vier Gründe aus L27", () => {
    // Eingefroren, nicht abgeleitet: eine legitime fünfte Ursache muss diese
    // Zahl bewusst anheben, statt still hineinzurutschen.
    expect(CONSTRUCTION_BLOCKER_REASONS).toHaveLength(4)
  })
})

describe("CONSTRUCTION_MANUAL_STATUS_LABELS", () => {
  it("ist ein Alias auf die α-Tabelle, keine zweite Kopie", () => {
    // Identität, nicht Gleichheit: zwei Tabellen für dieselben drei Werte
    // würden auseinanderlaufen.
    expect(CONSTRUCTION_MANUAL_STATUS_LABELS).toBe(CONSTRUCTION_RAG_LABELS)
    expect(CONSTRUCTION_MANUAL_STATUS_LABELS.gruen).toBe("Grün")
    expect(CONSTRUCTION_MANUAL_STATUS_LABELS.gelb).toBe("Gelb")
    expect(CONSTRUCTION_MANUAL_STATUS_LABELS.rot).toBe("Rot")
  })
})

describe("describeProgressSource", () => {
  it("nennt Arbeitspakete im Dativ Plural", () => {
    expect(
      describeProgressSource(
        section({ progress_source: "work_items", source_count: 7, linked_count: 7 })
      )
    ).toBe("aus 7 Arbeitspaketen im Teilbaum")
  })

  it("nennt ein einzelnes Arbeitspaket im Singular", () => {
    expect(
      describeProgressSource(
        section({ progress_source: "work_items", source_count: 1, linked_count: 1 })
      )
    ).toBe("aus 1 Arbeitspaket im Teilbaum")
  })

  it("nennt Phasen im Plural", () => {
    expect(
      describeProgressSource(
        section({
          progress_source: "phases",
          source_count: 2,
          linked_count: 2,
          phase_linked_count: 2,
        })
      )
    ).toBe("aus 2 Phasen im Teilbaum")
  })

  it("nennt eine einzelne Phase im Singular", () => {
    expect(
      describeProgressSource(
        section({
          progress_source: "phases",
          source_count: 1,
          linked_count: 1,
          phase_linked_count: 1,
        })
      )
    ).toBe("aus 1 Phase im Teilbaum")
  })

  /**
   * Der Kern der Slice (AC-45δ.10): ohne diese Angabe ist „0 %" nicht von
   * „nichts verknüpft" zu unterscheiden — und „nichts verknüpft" ist in Prod
   * heute der Normalfall.
   */
  it("sagt bei nichts Verknüpftem ausdrücklich, dass nichts verknüpft ist", () => {
    const text = describeProgressSource(section())
    expect(text).toBe("Nichts verknüpft — kein Fortschritt berechenbar")
    expect(text).not.toMatch(/0\s*%/)
  })

  it("nennt bei nur abgebrochenen Verknüpfungen beide Zahlen", () => {
    const text = describeProgressSource(
      section({ progress_source: "work_items", source_count: 0, linked_count: 3 })
    )
    expect(text).toBe(
      "3 Arbeitspakete verknüpft, davon 0 zählbar (abgebrochen) — kein Fortschritt berechenbar"
    )
    expect(text).not.toMatch(/0\s*%/)
  })

  it("bringt auch die nur-abgebrochene Einzelverknüpfung in den Singular", () => {
    expect(
      describeProgressSource(
        section({ progress_source: "phases", source_count: 0, linked_count: 1, phase_linked_count: 1 })
      )
    ).toBe(
      "1 Phase verknüpft, davon 0 zählbar (abgebrochen) — kein Fortschritt berechenbar"
    )
  })

  it("verwirft Phasen nicht stillschweigend, wenn Arbeitspakete führen", () => {
    // Edge Case „Arbeitspakete UND Phasen": der Fortschritt kommt aus den
    // Arbeitspaketen, die Phasen werden trotzdem genannt.
    expect(
      describeProgressSource(
        section({
          progress_source: "work_items",
          source_count: 4,
          linked_count: 4,
          phase_linked_count: 2,
        })
      )
    ).toBe(
      "aus 4 Arbeitspaketen im Teilbaum · 2 Phasen ebenfalls verknüpft, hier nicht gezählt"
    )
  })

  it("hängt den Phasen-Hinweis nicht an, wenn die Phasen selbst führen", () => {
    const text = describeProgressSource(
      section({
        progress_source: "phases",
        source_count: 3,
        linked_count: 3,
        phase_linked_count: 3,
      })
    )
    expect(text).toBe("aus 3 Phasen im Teilbaum")
    expect(text).not.toMatch(/ebenfalls verknüpft/)
  })

  it("suggeriert in keinem Fall, dass alles in Ordnung ist", () => {
    const cases = [
      section(),
      section({ progress_source: "work_items", source_count: 0, linked_count: 2 }),
      section({ progress_source: "work_items", source_count: 5, linked_count: 5 }),
      section({
        progress_source: "phases",
        source_count: 1,
        linked_count: 1,
        phase_linked_count: 1,
      }),
    ]
    for (const s of cases) {
      const text = describeProgressSource(s)
      expect(text.trim()).not.toBe("")
      expect(text).not.toMatch(/in Ordnung|abgeschlossen|vollständig|keine Auffälligkeit/i)
    }
  })
})

describe("hasCancelledOnlyLinks", () => {
  it("trifft genau den Fall „verknüpft, aber nichts zählbar\"", () => {
    expect(hasCancelledOnlyLinks({ linked_count: 3, source_count: 0 })).toBe(true)
    // Nichts verknüpft ist ein ANDERER Fall — sonst wären die beiden Meldungen
    // nicht auseinanderzuhalten.
    expect(hasCancelledOnlyLinks({ linked_count: 0, source_count: 0 })).toBe(false)
    expect(hasCancelledOnlyLinks({ linked_count: 3, source_count: 3 })).toBe(false)
    expect(hasCancelledOnlyLinks({ linked_count: 3, source_count: 1 })).toBe(false)
  })
})

describe("hasComparableProgress", () => {
  it("verlangt Quelle UND zählbaren Nenner", () => {
    expect(hasComparableProgress(section())).toBe(false)
    expect(
      hasComparableProgress(
        section({ progress_source: "work_items", source_count: 0, linked_count: 2 })
      )
    ).toBe(false)
    expect(
      hasComparableProgress(
        section({ progress_source: "work_items", source_count: 2, linked_count: 2 })
      )
    ).toBe(true)
  })
})

describe("splitDeadlines", () => {
  it("gibt bei leerer Liste zwei leere Listen zurück", () => {
    expect(splitDeadlines([])).toEqual({ elapsed: [], upcoming: [] })
  })

  it("trennt verstrichen von bevorstehend und sortiert je Gruppe aufsteigend", () => {
    const entries = [
      deadline({ ref_number: 1, due_on: "2026-08-25", is_elapsed: false }),
      deadline({ ref_number: 2, due_on: "2026-08-10", is_elapsed: true }),
      deadline({ ref_number: 3, due_on: "2026-08-21", is_elapsed: false }),
      deadline({ ref_number: 4, due_on: "2026-08-01", is_elapsed: true }),
    ]
    const { elapsed, upcoming } = splitDeadlines(entries)
    expect(elapsed.map((e) => e.ref_number)).toEqual([4, 2])
    expect(upcoming.map((e) => e.ref_number)).toEqual([3, 1])
  })

  it("legt verstrichene Termine in der flachen Liste nach vorn (AC-45δ.12)", () => {
    const entries = [
      deadline({ ref_number: 1, due_on: "2026-08-30", is_elapsed: false }),
      deadline({ ref_number: 2, due_on: "2026-08-02", is_elapsed: true }),
    ]
    expect(deadlinesElapsedFirst(entries).map((e) => e.ref_number)).toEqual([2, 1])
  })

  it("behält bei gleichem Datum die Reihenfolge der Auswertung", () => {
    // Die Auswertung ordnet nach `due_on`, `kind`, `ref_number`. Eine zweite
    // Sortierregel hier wäre eine zweite Wahrheit — die Stabilität von
    // `Array.prototype.sort` ist die Zusicherung, und sie wird hier gepinnt.
    const entries = [
      deadline({ kind: "abnahme", ref_number: 9, due_on: "2026-08-15" }),
      deadline({ kind: "mangel", ref_number: 4, due_on: "2026-08-15" }),
      deadline({ kind: "mangel", ref_number: 7, due_on: "2026-08-15" }),
    ]
    expect(splitDeadlines(entries).upcoming.map((e) => e.ref_number)).toEqual([9, 4, 7])
  })

  it("rechnet `is_elapsed` nicht nach, sondern übernimmt es", () => {
    // Es gibt genau EINEN Zeitbezug (`as_of`, D-δ1), und der liegt
    // serverseitig. Ein längst vergangenes Datum, das die Auswertung als nicht
    // verstrichen meldet, bleibt bevorstehend — sonst hätte die Anzeige eine
    // eigene Uhr.
    const entries = [deadline({ due_on: "2020-01-01", is_elapsed: false })]
    const { elapsed, upcoming } = splitDeadlines(entries)
    expect(elapsed).toHaveLength(0)
    expect(upcoming).toHaveLength(1)
  })

  it("lässt die übergebene Liste unverändert", () => {
    const entries = [
      deadline({ ref_number: 1, due_on: "2026-08-30", is_elapsed: true }),
      deadline({ ref_number: 2, due_on: "2026-08-02", is_elapsed: true }),
    ]
    splitDeadlines(entries)
    expect(entries.map((e) => e.ref_number)).toEqual([1, 2])
  })
})

describe("constructionScheduleSignalsExportUrl", () => {
  const PROJECT = "33333333-3333-4333-8333-333333333333"

  it("baut die Ausgabe-Adresse je Abschnitt", () => {
    expect(constructionScheduleSignalsExportUrl(PROJECT, "trades")).toBe(
      `/api/projects/${PROJECT}/construction-schedule-signals/export?section=trades`
    )
    expect(constructionScheduleSignalsExportUrl(PROJECT, "overdue_defects")).toBe(
      `/api/projects/${PROJECT}/construction-schedule-signals/export?section=overdue_defects`
    )
  })

  it("maskiert die Projektkennung", () => {
    expect(constructionScheduleSignalsExportUrl("a/b?c", "sections")).toBe(
      "/api/projects/a%2Fb%3Fc/construction-schedule-signals/export?section=sections"
    )
  })
})

describe("fetchConstructionScheduleSignals", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubJson(body: unknown, ok = true) {
    const fetchMock = vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }))
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  /**
   * Diese beiden Fälle sind der Grund, warum es sie gibt: die erste Fassung des
   * Wrappers hat die Antwort der Route als nackte Nutzlast gelesen, obwohl sie
   * `{ signals: … }` liefert — ein Fehler, den kein Typ fängt, weil beide Seiten
   * nur eine Zusicherung `as` tragen.
   */
  it("packt die Auswertung aus der `signals`-Hülle der Route aus", async () => {
    const payload = { project_id: "p1", as_of: "2026-08-20", window_days: 14 }
    const fetchMock = stubJson({ signals: payload })

    const result = await fetchConstructionScheduleSignals("p1")

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/construction-schedule-signals",
      { method: "GET", cache: "no-store" }
    )
  })

  it("gibt `null` weiter statt einen Zeitbezug zu erfinden", async () => {
    // `as_of` ist der EINE Zeitbezug der Slice (D-δ1). Ein ausgedachtes
    // Leer-Objekt würde auf einer Fläche, die „nichts da" von „0" trennen soll,
    // genau die Verwechslung einbauen, die sie beseitigt.
    stubJson({ signals: null })
    await expect(fetchConstructionScheduleSignals("p1")).resolves.toBeNull()
  })

  it("wirft bei einer Absage der Route einen `ConstructionApiError` mit Status", async () => {
    stubJson({ error: { code: "signals_failed", message: "kaputt" } }, false)
    await expect(fetchConstructionScheduleSignals("p1")).rejects.toMatchObject({
      name: "ConstructionApiError",
      status: 500,
      code: "signals_failed",
      message: "kaputt",
    })
  })
})
