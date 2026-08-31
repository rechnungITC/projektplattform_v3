import { describe, expect, it } from "vitest"

import { analyzeRegister, classifyState, extractLead } from "./analyze"

/** Minimal followup table in the shape the real register uses. */
function table(...rows: string[]): string {
  return ["| PROJ | Status | Current reconciliation |", "|---|---|---|", ...rows].join("\n")
}

function tableRow(id: string, state: string): string {
  return `| ${id} | ${state} | some reconciliation prose |`
}

/** Narrative section, as the register writes them for recent slices. */
function section(id: string, head: string, ...bullets: string[]): string {
  return [`## ${id} — ${head}`, "", ...bullets].join("\n")
}

function bullet(id: string, lead: string, body = "Longer prose that narrates history."): string {
  return `- **${id} — ${lead}**\n  ${body}`
}

/** `| ID | Feature | Status | Scope | Spec | Created |` */
function indexWith(id: string, status: string, scope: string): string {
  return [
    "| ID | Feature | Status | Deployment Scope | Spec | Created |",
    "|----|---------|--------|------------------|------|---------|",
    `| ${id} | Some feature | ${status} | ${scope} | [Spec](${id}-x.md) | 2026-01-01 |`,
  ].join("\n")
}

describe("classifyState", () => {
  it("reads the done vocabulary measured in the register", () => {
    for (const t of [
      "**Erledigt 2026-08-21**",
      "**Geschlossen 2026-08-20 — Deployed / Scope `full`**",
      "**Resolved 2026-08-14** — Tag `v2.57.0`",
      "**Deployed 2026-08-19 / Scope `alpha`**",
      "Der Fund ist behoben.",
    ]) {
      expect(classifyState(t), t).toBe("done")
    }
  })

  it("reads the open vocabulary, including pre-deployment lifecycle states", () => {
    for (const t of [
      "Planned (Followup)",
      "Planned (Followup, cross-cutting)",
      "Approved",
      "In Review",
      "(offen, sicherheitsrelevant)",
    ]) {
      expect(classifyState(t), t).toBe("open")
    }
  })

  it("refuses to judge when both or neither vocabulary appears", () => {
    expect(classifyState("Planned, aber teilweise behoben")).toBe("ambiguous")
    expect(classifyState("Siehe Spec, Details dort")).toBe("ambiguous")
  })
})

describe("extractLead", () => {
  it("takes only the bolded lead, because the body narrates history", () => {
    expect(extractLead("- **PROJ-Y-1a — Titel. Erledigt 2026-08-31.** War vorher offen.")).toBe(
      "PROJ-Y-1a — Titel. Erledigt 2026-08-31."
    )
  })

  it("returns null when a bullet has no bolded lead", () => {
    expect(extractLead("- PROJ-Y-1a — kein Fettdruck")).toBeNull()
  })
})

describe("analyzeRegister — R1: an id recorded twice must not contradict itself", () => {
  it("fails when the table says done and the narrative says open", () => {
    const { errors, comparedIds } = analyzeRegister(
      [
        table(tableRow("PROJ-Y-151d", "**Erledigt 2026-08-28**")),
        "",
        section(
          "PROJ-151",
          "Projektbezogener KI-Chat (Deployed, Scope `full`)",
          bullet("PROJ-Y-151d", "Skill-Anweisungen umgehen den Gate (offen, sicherheitsrelevant).")
        ),
      ].join("\n"),
      indexWith("PROJ-151", "Deployed", "full")
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("PROJ-Y-151d")
    expect(errors[0]).toContain("contradicts itself")
    expect(new Set(comparedIds)).toEqual(new Set(["PROJ-Y-151d"]))
  })

  it("passes when both places agree", () => {
    const { errors, warnings } = analyzeRegister(
      [
        table(tableRow("PROJ-Y-151e", "**Erledigt 2026-08-28**")),
        "",
        section(
          "PROJ-151",
          "Projektbezogener KI-Chat (Deployed, Scope `full`)",
          bullet("PROJ-Y-151e", "Skill-Anweisungen werden klassifiziert. Erledigt 2026-08-28.")
        ),
      ].join("\n"),
      indexWith("PROJ-151", "Deployed", "full")
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  /**
   * The measured non-check. 6 of 6 narrative ids had no table row on 2026-08-31 — that is the
   * convention for recent slices. If this test ever fails, the guard has started crying wolf.
   */
  it("does NOT complain about a narrative id that has no table row", () => {
    const { errors, warnings, comparedIds } = analyzeRegister(
      [
        table(tableRow("PROJ-Y-45b", "Planned (Followup, 45)")),
        "",
        section(
          "PROJ-153",
          "Arbeitspakete aus dem Vorhaben (α `/backend` live, In Progress)",
          bullet("PROJ-Y-153a", "Bestandsbefund (offen).")
        ),
      ].join("\n"),
      indexWith("PROJ-153", "In Progress", "—")
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(comparedIds).toEqual([])
  })

  it("warns instead of failing when either side is not decidable", () => {
    const { errors, warnings } = analyzeRegister(
      [
        table(tableRow("PROJ-Y-9x", "Siehe Spec")),
        "",
        section("PROJ-9", "Etwas (Deployed, Scope `mvp`)", bullet("PROJ-Y-9x", "Titel ohne Zustand")),
      ].join("\n"),
      indexWith("PROJ-9", "Deployed", "mvp")
    )
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("not decidable")
  })
})

describe("analyzeRegister — R2: one id, one state across tables", () => {
  it("fails when two table rows for the same id disagree", () => {
    const { errors } = analyzeRegister(
      table(
        tableRow("PROJ-Y-114d", "**Erledigt 2026-08-21**"),
        tableRow("PROJ-Y-114d", "Planned (Followup)")
      ),
      indexWith("PROJ-114", "Deployed", "mvp")
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("table rows disagree")
  })

  it("accepts duplicate rows that agree — 19 such ids exist and all agree today", () => {
    const { errors } = analyzeRegister(
      table(
        tableRow("PROJ-Y-114d", "**Erledigt 2026-08-21**"),
        tableRow("PROJ-Y-114d", "**Erledigt 2026-08-21**, zweite Tabelle")
      ),
      indexWith("PROJ-114", "Deployed", "mvp")
    )
    expect(errors).toEqual([])
  })
})

describe("analyzeRegister — R3: a claimed scope must match features/INDEX.md", () => {
  it("fails on the exact PROJ-151 case: header mvp, INDEX full", () => {
    const { errors } = analyzeRegister(
      section("PROJ-151", "Projektbezogener KI-Chat (Deployed, Scope `mvp`)"),
      indexWith("PROJ-151", "Deployed", "full")
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("scope disagrees")
    expect(errors[0]).toContain("`mvp`")
    expect(errors[0]).toContain("`full`")
  })

  it("stays silent when the header makes no scope claim", () => {
    const { errors, warnings } = analyzeRegister(
      section("PROJ-153", "Arbeitspakete aus dem Vorhaben (α `/backend` live, In Progress)"),
      indexWith("PROJ-153", "In Progress", "—")
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it("warns when a scope is claimed for a feature that has no INDEX row", () => {
    const { warnings, errors } = analyzeRegister(
      section("PROJ-999", "Erfundenes (Deployed, Scope `full`)"),
      indexWith("PROJ-1", "Deployed", "full")
    )
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("no row with a scope column")
  })
})

describe("analyzeRegister — parsing", () => {
  it("does not mistake a table header for an id", () => {
    const { tableRows } = analyzeRegister(table(tableRow("PROJ-1", "Deployed")), indexWith("PROJ-1", "Deployed", "full"))
    expect(tableRows.map((r) => r.id)).toEqual(["PROJ-1"])
  })

  it("parses greek sub-slice ids, which are part of the vocabulary", () => {
    const { errors } = analyzeRegister(
      [
        table(tableRow("PROJ-45-β", "**Deployed 2026-08-19 / Scope `alpha`**")),
        "",
        section("PROJ-45", "Construction (Deployed, Scope `mvp`)", bullet("PROJ-45-β", "Mängel (offen).")),
      ].join("\n"),
      indexWith("PROJ-45", "Deployed", "mvp")
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("PROJ-45-β")
  })

  it("stops collecting claims at the next heading", () => {
    const { claims } = analyzeRegister(
      [
        section("PROJ-151", "Etwas (Deployed, Scope `full`)", bullet("PROJ-Y-151a", "Erledigt.")),
        "",
        "## Some Other Heading",
        "",
        bullet("PROJ-Y-999z", "Erledigt."),
      ].join("\n"),
      indexWith("PROJ-151", "Deployed", "full")
    )
    expect(claims.map((c) => c.id)).toEqual(["PROJ-Y-151a"])
  })
})
