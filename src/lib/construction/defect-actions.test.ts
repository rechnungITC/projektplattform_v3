import { describe, expect, it } from "vitest"

import {
  availableDefectActions,
  buildDefectUpdatePayload,
  DEFECT_TRANSITIONS,
  defectActionNeedsReason,
  describeReviewBlock,
  draftFromDefect,
  offeredDefectActions,
  type DefectDraft,
} from "./defect-actions"
import {
  CONSTRUCTION_DEFECT_ACTIONS,
  CONSTRUCTION_DEFECT_REASON_REQUIRED_ACTIONS,
  type ConstructionDefect,
  type ConstructionDefectAction,
  type ConstructionDefectStatus,
} from "@/types/construction-defect"

/**
 * PROJ-45-β /frontend — der Zustandsautomat steht in TypeScript ein zweites Mal
 * (D-β10, Angebots-Spiegel). Diese Tabelle ist deshalb wörtlich aus
 * `transition_construction_defect_status` (Migration 20260818104358, `case
 * p_action`) abgeschrieben und NICHT aus dem Modul abgeleitet — ein Test, der
 * seine Erwartung aus dem Prüfling bezieht, bestätigt nur sich selbst.
 */
const MIGRATION_TABLE: Record<
  ConstructionDefectAction,
  { from: ConstructionDefectStatus[]; to: ConstructionDefectStatus; reason: boolean }
> = {
  in_arbeit: { from: ["offen"], to: "in_bearbeitung", reason: false },
  fertigmelden: { from: ["offen", "in_bearbeitung"], to: "erledigt", reason: false },
  pruefen: { from: ["erledigt"], to: "geprueft", reason: false },
  zurueckweisen: { from: ["erledigt"], to: "in_bearbeitung", reason: true },
  verwerfen: {
    from: ["offen", "in_bearbeitung", "erledigt"],
    to: "verworfen",
    reason: true,
  },
  wieder_aufnehmen: { from: ["verworfen"], to: "offen", reason: false },
}

const ALL_STATUSES: ConstructionDefectStatus[] = [
  "offen",
  "in_bearbeitung",
  "erledigt",
  "geprueft",
  "verworfen",
]

describe("DEFECT_TRANSITIONS mirrors the migration", () => {
  it("covers every action the API vocabulary knows", () => {
    expect(Object.keys(DEFECT_TRANSITIONS).sort()).toEqual(
      [...CONSTRUCTION_DEFECT_ACTIONS].sort()
    )
  })

  for (const action of CONSTRUCTION_DEFECT_ACTIONS) {
    it(`${action}: from / to / reason match the SQL case block`, () => {
      const expected = MIGRATION_TABLE[action]
      expect([...DEFECT_TRANSITIONS[action].from].sort()).toEqual(
        [...expected.from].sort()
      )
      expect(DEFECT_TRANSITIONS[action].to).toBe(expected.to)
      expect(defectActionNeedsReason(action)).toBe(expected.reason)
    })
  }

  it("the reason-required set is the one the types publish", () => {
    const derived = CONSTRUCTION_DEFECT_ACTIONS.filter(defectActionNeedsReason)
    expect([...derived].sort()).toEqual(
      [...CONSTRUCTION_DEFECT_REASON_REQUIRED_ACTIONS].sort()
    )
  })
})

describe("availableDefectActions", () => {
  it("offers exactly what the migration allows, for every status", () => {
    for (const status of ALL_STATUSES) {
      const expected = CONSTRUCTION_DEFECT_ACTIONS.filter((a) =>
        MIGRATION_TABLE[a].from.includes(status)
      )
      expect([...availableDefectActions(status)].sort(), status).toEqual(
        [...expected].sort()
      )
    }
  })

  it("offers nothing for a reviewed defect — geprueft is terminal", () => {
    expect(availableDefectActions("geprueft")).toEqual([])
  })

  it("offers only re-opening for a dismissed defect", () => {
    expect(availableDefectActions("verworfen")).toEqual(["wieder_aufnehmen"])
  })

  it("survives an unknown status without offering anything", () => {
    expect(availableDefectActions("kaputt")).toEqual([])
    expect(availableDefectActions(null)).toEqual([])
  })
})

// ── Vier-Augen ──────────────────────────────────────────────────────────────

const REPORTER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

function defectAt(
  status: ConstructionDefectStatus,
  reportedDoneBy: string | null = null
): Pick<ConstructionDefect, "status" | "reported_done_by"> {
  return { status, reported_done_by: reportedDoneBy }
}

describe("describeReviewBlock", () => {
  it("blocks the person who reported completion, and says why", () => {
    const reason = describeReviewBlock(defectAt("erledigt", REPORTER), REPORTER)
    expect(reason).toContain("Vier-Augen")
    // B-β7 — der klemmende Fall muss benannt werden, nicht kaschiert.
    expect(reason).toContain("zweite Projektleitung")
  })

  it("does not block a different person", () => {
    expect(describeReviewBlock(defectAt("erledigt", REPORTER), OTHER)).toBeNull()
  })

  it("still blocks in round 2 — the field moves with each completion report", () => {
    // Nach einer Rückweisung meldet ein ANDERER fertig; jetzt ist ER gesperrt
    // und der ursprüngliche Melder wieder frei (Pentest-Vektor K).
    expect(describeReviewBlock(defectAt("erledigt", OTHER), OTHER)).not.toBeNull()
    expect(describeReviewBlock(defectAt("erledigt", OTHER), REPORTER)).toBeNull()
  })

  it("explains a defect that was never reported done", () => {
    expect(describeReviewBlock(defectAt("erledigt", null), OTHER)).toContain(
      "nie fertiggemeldet"
    )
  })

  it("says nothing outside the review state", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "erledigt")) {
      expect(describeReviewBlock(defectAt(status, REPORTER), REPORTER)).toBeNull()
    }
  })
})

describe("offeredDefectActions", () => {
  it("withholds only the review from the reporter, keeping the other actions", () => {
    const offered = offeredDefectActions(defectAt("erledigt", REPORTER), REPORTER)
    expect(offered).not.toContain("pruefen")
    // Zurückweisen und Verwerfen bleiben — sonst wäre der Mangel eingefroren.
    expect(offered).toContain("zurueckweisen")
    expect(offered).toContain("verwerfen")
  })

  it("offers the review to anyone else", () => {
    expect(offeredDefectActions(defectAt("erledigt", REPORTER), OTHER)).toContain(
      "pruefen"
    )
  })
})

// ── Leeren-Schalter ─────────────────────────────────────────────────────────

const FULL: ConstructionDefect = {
  id: "d1",
  tenant_id: "t1",
  project_id: "p1",
  defect_number: 7,
  title: "Undichte Dachhaut",
  description: "Wasser tritt an der Attika ein.",
  trade_id: "trade-a",
  section_id: "sec-a",
  severity: "erheblich",
  status: "offen",
  due_date: "2026-09-01",
  responsible_user_id: REPORTER,
  vendor_id: "vendor-a",
  reported_done_by: null,
  reported_done_at: null,
  created_by: REPORTER,
  created_at: "2026-08-18T00:00:00Z",
  updated_at: "2026-08-18T00:00:00Z",
}

describe("buildDefectUpdatePayload", () => {
  it("sends nothing when nothing changed", () => {
    expect(buildDefectUpdatePayload(FULL, draftFromDefect(FULL))).toBeNull()
  })

  it("turns an emptied field into its explicit clear switch — never into a value", () => {
    // Das ist die PROJ-122-Defektklasse: „weglassen" heisst in der Funktion
    // „unverändert", ein Leerstring wäre ein gesetzter Wert. Nur der Schalter
    // entfernt wirklich.
    const draft: DefectDraft = {
      ...draftFromDefect(FULL),
      description: "",
      section_id: "",
      due_date: "",
      responsible_user_id: "",
      vendor_id: "",
    }
    expect(buildDefectUpdatePayload(FULL, draft)).toEqual({
      clear_description: true,
      clear_section: true,
      clear_due_date: true,
      clear_responsible: true,
      clear_vendor: true,
    })
  })

  it("never sends a value and its own clear switch together (the API refuses that)", () => {
    const draft = { ...draftFromDefect(FULL), description: "" }
    const payload = buildDefectUpdatePayload(FULL, draft)
    expect(payload).toEqual({ clear_description: true })
    expect(payload).not.toHaveProperty("description")
  })

  it("sends only the fields that really moved", () => {
    const draft = { ...draftFromDefect(FULL), title: "Neuer Titel" }
    expect(buildDefectUpdatePayload(FULL, draft)).toEqual({ title: "Neuer Titel" })
  })

  it("trims the title and ignores a whitespace-only edit", () => {
    const draft = { ...draftFromDefect(FULL), title: `  ${FULL.title}  ` }
    expect(buildDefectUpdatePayload(FULL, draft)).toBeNull()
  })

  it("refuses to empty the mandatory title (lock L13 keeps trade and title set)", () => {
    const draft = { ...draftFromDefect(FULL), title: "   " }
    expect(buildDefectUpdatePayload(FULL, draft)).toBeNull()
  })

  it("re-points the trade but has no way to empty it", () => {
    const draft = { ...draftFromDefect(FULL), trade_id: "trade-b" }
    expect(buildDefectUpdatePayload(FULL, draft)).toEqual({ trade_id: "trade-b" })
    const emptied = { ...draftFromDefect(FULL), trade_id: "" }
    expect(buildDefectUpdatePayload(FULL, emptied)).toBeNull()
  })

  it("fills a previously empty optional field without any clear switch", () => {
    const bare: ConstructionDefect = {
      ...FULL,
      description: null,
      section_id: null,
      due_date: null,
      responsible_user_id: null,
      vendor_id: null,
    }
    const draft: DefectDraft = {
      ...draftFromDefect(bare),
      description: "Nachtrag",
      due_date: "2026-10-01",
    }
    expect(buildDefectUpdatePayload(bare, draft)).toEqual({
      description: "Nachtrag",
      due_date: "2026-10-01",
    })
  })
})
