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
  it("covers exactly the five measured append-only islands", () => {
    expect(GOVERNANCE_HISTORY_ISLANDS.map((i) => i.table)).toEqual([
      "stakeholder_profile_audit_events",
      "decision_approval_events",
      "deliverable_approval_events",
      "ma_clearance_request_events",
      "construction_defect_events",
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
      // PROJ-45-β: guard steps aside on plain parent absence → PROJ-Y-148d.
      ["construction_defect_events", false],
    ])
  })

  it("attributes each island to the slice that promised its immutability", () => {
    expect(GOVERNANCE_HISTORY_ISLANDS.map((i) => i.promisedBy)).toEqual([
      "PROJ-33",
      "PROJ-31",
      "PROJ-105",
      "PROJ-100c",
      "PROJ-45-β",
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
    // Measured live: `construction_defect_events` has rows, yet the project
    // delete succeeds and takes them along, because its guard steps aside on
    // plain parent absence. Counting it as a blocker would refuse a delete that
    // in fact works — the one way this slice could make things worse.
    const result = await detectGovernanceHistory(
      counterFor({ construction_defect_events: 12 })
    )
    expect(result).toEqual({ status: "ok", block: null })
  })

  it("never even asks a non-blocking island", async () => {
    const count = vi.fn(counterFor({}))
    await detectGovernanceHistory(count)
    const asked = count.mock.calls.map(([island]) => island.table)
    expect(asked).not.toContain("construction_defect_events")
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
