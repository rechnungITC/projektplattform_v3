import { describe, expect, it, vi } from "vitest"

import {
  detectGovernanceHistory,
  governanceHistoryMessage,
  GOVERNANCE_HISTORY_BLOCK_CODE,
  GOVERNANCE_HISTORY_ISLANDS,
  type GovernanceHistoryCounter,
  type GovernanceHistoryIsland,
} from "./governance-history"

/**
 * The counter, driven per test: a map of table -> result. Anything not listed
 * counts zero, so each test only states what it is about.
 */
function counterFor(
  rows: Record<string, number | { code?: string; message: string }>
): GovernanceHistoryCounter {
  return (island: GovernanceHistoryIsland) => {
    const entry = rows[island.table]
    if (entry === undefined) return Promise.resolve({ count: 0, error: null })
    if (typeof entry === "number") {
      return Promise.resolve({ count: entry, error: null })
    }
    return Promise.resolve({ count: null, error: entry })
  }
}

// -----------------------------------------------------------------------------
// The frozen registry (AC-Y148a.V1-5)
// -----------------------------------------------------------------------------

describe("GOVERNANCE_HISTORY_ISLANDS", () => {
  /**
   * Pinned deliberately, not derived. The list was measured live against prod
   * (recursive cascade closure of `projects` over `confdeltype='c'`, intersected
   * with DELETE triggers whose function raises). TypeScript cannot check that,
   * so a sixth island has to break this test and force a decision — which is
   * not a hypothetical: PROJ-45-β added the fifth while this slice was written,
   * and it slipped in unnoticed at the DB level.
   *
   * If this fails, do not just extend the array: decide what the new history is
   * called in front of a user, and whether it really may not be deleted.
   */
  it("covers exactly the six measured append-only islands", () => {
    // Dieser Test hat 2026-08-19 seine Arbeit getan: PROJ-45-γ hat die SECHSTE
    // Insel eingebracht (`construction_acceptance_events`), und die Liste ist
    // erst nach einer gemessenen Entscheidung erweitert worden — nicht, weil
    // der Test rot war.
    expect(GOVERNANCE_HISTORY_ISLANDS.map((i) => i.table)).toEqual([
      "stakeholder_profile_audit_events",
      "decision_approval_events",
      "deliverable_approval_events",
      "ma_clearance_request_events",
      "construction_defect_events",
      "construction_acceptance_events",
    ])
  })

  it("names every island in business language, never by its table", () => {
    for (const island of GOVERNANCE_HISTORY_ISLANDS) {
      expect(island.label.length).toBeGreaterThan(0)
      expect(island.label).not.toContain("_")
      // AC-Y148a.V1-2: no table name may leak through the label. Every island
      // table carries underscores, so the absence of one is a cheap guard.
      expect(island.label).not.toContain(island.table)
    }
  })

  it("freezes which islands actually refuse the cascade", () => {
    // Each value was measured by deleting a project in a rolled-back
    // transaction. Flipping one is a decision about a shipped promise, not a
    // detail: `false` means that history is removed with the project.
    expect(
      GOVERNANCE_HISTORY_ISLANDS.map((i) => [i.table, i.blocksHardDelete])
    ).toEqual([
      ["stakeholder_profile_audit_events", true],
      ["decision_approval_events", true],
      ["deliverable_approval_events", true],
      ["ma_clearance_request_events", true],
      // Was `false` until PROJ-Y-148d removed the exit from PROJ-45-β's guard.
      ["construction_defect_events", true],
      // PROJ-45-γ: GEMESSEN `true`. γs Waechter hatte den Ausstieg von β
      // zunaechst geerbt und ist per Fix-forward (20260819170000) bedingungslos
      // gemacht worden — im Gleichzug zu PROJ-Y-148d, das dieselbe Aenderung
      // fuer die Maengel-Historie vorgenommen hat. Rollback-Sonde gegen Prod:
      // ein geseedetes Ereignis lehnt das Projekt-Loeschen mit `42501` ab.
      ["construction_acceptance_events", true],
    ])
  })

  it("attributes each island to the slice that promised its immutability", () => {
    expect(GOVERNANCE_HISTORY_ISLANDS.map((i) => i.promisedBy)).toEqual([
      "PROJ-33",
      "PROJ-31",
      "PROJ-105",
      "PROJ-100c",
      "PROJ-45-β",
      "PROJ-45-γ",
    ])
  })

  it("carries an explicit FK hint for the ambiguous stakeholder join", () => {
    // `stakeholder_profile_audit_events` has two FKs to `stakeholders`
    // (stakeholder_id + actor_stakeholder_id); an unqualified embed is
    // ambiguous and PostgREST rejects it outright.
    const island = GOVERNANCE_HISTORY_ISLANDS[0]
    expect(island.parentForeignKey).toBe(
      "stakeholder_profile_audit_events_stakeholder_id_fkey"
    )
    for (const each of GOVERNANCE_HISTORY_ISLANDS) {
      expect(each.parentForeignKey).toContain(each.table)
      expect(each.parentForeignKey.endsWith("_fkey")).toBe(true)
    }
  })
})

// -----------------------------------------------------------------------------
// Detection
// -----------------------------------------------------------------------------

describe("detectGovernanceHistory", () => {
  it("reports no block when every island is empty", async () => {
    const result = await detectGovernanceHistory(counterFor({}))
    expect(result).toEqual({ status: "ok", block: null })
  })

  it("asks every blocking island, not just the ones with rows today", async () => {
    const count = vi.fn(counterFor({}))
    await detectGovernanceHistory(count)
    expect(count).toHaveBeenCalledTimes(
      GOVERNANCE_HISTORY_ISLANDS.filter((i) => i.blocksHardDelete).length
    )
  })

  it("does not refuse for an island that does not block the cascade", async () => {
    // Since PROJ-Y-148d all five real islands block, so this rule can no longer
    // be triggered through the registry — and a test that cannot fail guards
    // nothing. It is therefore driven by a synthetic island. The rule still
    // matters: counting a non-blocking island as a blocker would refuse a delete
    // that in fact works, the one way this area can get worse.
    const result = await detectGovernanceHistory(
      counterFor({ future_non_blocking_events: 12 }),
      [{ ...GOVERNANCE_HISTORY_ISLANDS[0], table: "future_non_blocking_events",
         blocksHardDelete: false }]
    )
    expect(result).toEqual({ status: "ok", block: null })
  })

  it("refuses for construction defect history — the PROJ-Y-148d flip", async () => {
    // The inverse of what this test asserted before PROJ-Y-148d: the guard no
    // longer steps aside when the cascade removes the parent defect, so the
    // pre-flight must refuse instead of letting the history go.
    const result = await detectGovernanceHistory(
      counterFor({ construction_defect_events: 12 })
    )
    expect(result).toEqual({
      status: "ok",
      block: { kinds: ["Mängel-Historie"], total: 12 },
    })
  })

  it("never even asks a non-blocking island", async () => {
    // Same reason as above: driven by a synthetic island, because every real one
    // blocks since PROJ-Y-148d. Asking a non-blocking island would be harmless
    // but wasteful, and the skip is what keeps the rule above honest.
    const count = vi.fn(counterFor({}))
    await detectGovernanceHistory(count, [
      { ...GOVERNANCE_HISTORY_ISLANDS[0], table: "blocks", blocksHardDelete: true },
      { ...GOVERNANCE_HISTORY_ISLANDS[0], table: "skipped", blocksHardDelete: false },
    ])
    const asked = count.mock.calls.map(([island]) => island.table)
    expect(asked).toEqual(["blocks"])
  })

  it("asks all five real islands now that none is skipped", async () => {
    const count = vi.fn(counterFor({}))
    await detectGovernanceHistory(count)
    expect(count.mock.calls.map(([i]) => i.table)).toEqual(
      GOVERNANCE_HISTORY_ISLANDS.map((i) => i.table)
    )
  })

  it("sums the rows and lists the affected kinds in registry order", async () => {
    // The live shape of the worst trashed project ("Test 1 SCRUM"): 17 profile
    // events + 4 decision-approval events.
    const result = await detectGovernanceHistory(
      counterFor({
        decision_approval_events: 4,
        stakeholder_profile_audit_events: 17,
      })
    )
    expect(result).toEqual({
      status: "ok",
      block: {
        kinds: [
          "Stakeholder-Profil-Historie",
          "Genehmigungs-Historie zu Entscheidungen",
        ],
        total: 21,
      },
    })
  })

  it("blocks on an island that raises 42501 rather than 23514", async () => {
    // Three of the five guards raise `42501`, so a SQLSTATE-only mapping would
    // miss them. Row counting does not care which code the guard would raise.
    const result = await detectGovernanceHistory(
      counterFor({ ma_clearance_request_events: 2 })
    )
    expect(result).toEqual({
      status: "ok",
      block: {
        kinds: ["Historie der Vertraulichkeits-Freischaltungen"],
        total: 2,
      },
    })
  })

  it("treats a table that does not exist here as zero", async () => {
    // An environment that lags the prod schema by a merge — the case
    // `construction_defect_events` was in until PROJ-45-β landed. Asserted on a
    // *blocking* island, so the tolerance is actually exercised rather than
    // hidden behind the non-blocking skip.
    for (const code of ["42P01", "PGRST205"]) {
      const result = await detectGovernanceHistory(
        counterFor({
          ma_clearance_request_events: { code, message: "missing" },
        })
      )
      expect(result).toEqual({ status: "ok", block: null })
    }
  })

  it("still blocks on other islands when one table is absent", async () => {
    const result = await detectGovernanceHistory(
      counterFor({
        ma_clearance_request_events: { code: "42P01", message: "missing" },
        stakeholder_profile_audit_events: 3,
      })
    )
    expect(result).toMatchObject({
      status: "ok",
      block: { total: 3 },
    })
  })

  it("reports a real read failure instead of guessing either way", async () => {
    const result = await detectGovernanceHistory(
      counterFor({
        decision_approval_events: { code: "42501", message: "permission denied" },
      })
    )
    expect(result).toEqual({
      status: "check_failed",
      message: "permission denied",
    })
  })

  it("reports a read failure that carries no code at all", async () => {
    const result = await detectGovernanceHistory(
      counterFor({ stakeholder_profile_audit_events: { message: "boom" } })
    )
    expect(result).toEqual({ status: "check_failed", message: "boom" })
  })
})

// -----------------------------------------------------------------------------
// Wording
// -----------------------------------------------------------------------------

describe("governanceHistoryMessage", () => {
  it("names the history in business terms and never a table", () => {
    const message = governanceHistoryMessage({
      kinds: ["Stakeholder-Profil-Historie"],
      total: 10,
    })
    expect(message).toContain("Stakeholder-Profil-Historie")
    expect(message).toContain("10 Einträge")
    for (const island of GOVERNANCE_HISTORY_ISLANDS) {
      expect(message).not.toContain(island.table)
    }
  })

  it("joins several kinds readably", () => {
    const message = governanceHistoryMessage({
      kinds: ["A-Historie", "B-Historie", "C-Historie"],
      total: 3,
    })
    expect(message).toContain("A-Historie, B-Historie und C-Historie")
  })

  it("uses the singular for a single entry", () => {
    const message = governanceHistoryMessage({ kinds: ["A-Historie"], total: 1 })
    expect(message).toContain("1 Eintrag")
    expect(message).not.toContain("Einträge")
  })

  it("says the project stays in the trash — the outcome, not a failure", () => {
    const message = governanceHistoryMessage({ kinds: ["A-Historie"], total: 1 })
    expect(message).toContain("Papierkorb")
  })
})

describe("GOVERNANCE_HISTORY_BLOCK_CODE", () => {
  it("is the stable contract between route and dialog", () => {
    // Pinned because the dialog branches on it; renaming it silently would
    // turn the honest refusal back into a generic red error toast.
    expect(GOVERNANCE_HISTORY_BLOCK_CODE).toBe("governance_history_immutable")
  })
})
