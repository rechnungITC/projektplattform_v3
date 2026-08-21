/**
 * PROJ-Y-45d — struktureller Wächter: ein Radix-`Select` darf seinen `value`
 * NICHT als `undefined` bekommen.
 *
 * Der Defekt: React entscheidet an der ersten Render-Runde, ob eine Komponente
 * kontrolliert ist. Ist `value` beim Öffnen `undefined` und wird bei der ersten
 * Auswahl definiert, kippt die Komponente von unkontrolliert auf kontrolliert
 * und React meldet „Select is changing from uncontrolled to controlled". In
 * PROJ-45-β `/qa` (F-2) war das bei **jedem** Öffnen der Mangel-Maske
 * reproduzierbar; in PROJ-45-γ hat es dann die Konsolen-Zusicherung einer
 * fremden Spec verschmutzt.
 *
 * Warum ein struktureller Test und keine Radix-Interaktion: der Fehler ist eine
 * **Verdrahtung**, keine Laufzeitlogik. Ein jsdom-Test müsste Radix' Pointer-
 * Capture-Aufrufe stubben, um das Dropdown zu öffnen — fragil und teuer für
 * einen Ein-Zeilen-Vertrag. Derselbe Zuschnitt wie
 * `audit-report-view.contract.test.ts` (PROJ-Y-130p).
 *
 * ## Der eigentliche Ertrag: die Ausnahmeliste
 *
 * Das Followup-Register führte die Mangel-Maske als „die einzige Stelle dieser
 * Form im ganzen Repo". Das trifft auf die **wörtliche** Form zu
 * (`value={… .length > 0 ? … : undefined}`, gemessen 1 Treffer), aber **nicht**
 * auf die Defektklasse: fünf weitere Selects übergeben `… ?? undefined`. Sie
 * stehen unten namentlich, damit
 *
 *   1. die Mangel-Maske nicht zurückfallen kann (sie ist NICHT in der Liste),
 *   2. ein **neuer** solcher Select den Lauf rot macht und eine Entscheidung
 *      erzwingt statt still einzusickern,
 *   3. die fünf auffindbar bleiben, statt in einer Fussnote zu verschwinden.
 *
 * Sie werden hier bewusst nicht mitgefixt: jede liegt in einer fremden Slice,
 * und `method-header.tsx` rendert auf **jeder** Projektraum-Seite, also unter
 * einer Visual-Baseline (`project-room`). Das gehört in eine eigene Slice mit
 * eigener Nachmessung → PROJ-Y-45n.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

const SRC = join(process.cwd(), "src")

/**
 * Selects, die heute `undefined` übergeben — gemessen am 2026-08-21, nicht
 * geschätzt. Jeder Eintrag ist ein bekannter Fall der Defektklasse aus einer
 * fremden Slice. Diese Liste darf nur **kürzer** werden.
 */
const KNOWN_UNDEFINED_VALUE_SELECTS = [
  "src/components/releases/release-page-client.tsx",
  "src/components/project-room/method-header.tsx",
  "src/components/sprints/sprint-state-dialog.tsx",
  "src/components/projects/wizard/step-ma-foundation.tsx",
  "src/components/projects/ma/ma-foundation-card.tsx",
] as const

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full))
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}

/**
 * Findet Dateien, in denen ein `value={…undefined…}` innerhalb der Attributliste
 * eines `<Select` steht. JSX ist mehrzeilig, deshalb wird ab jedem `<Select`
 * vorwärts gelesen, bis das öffnende Tag schliesst (`>` am Zeilenende) — nicht
 * pauschal „sechs Zeilen", was bei umformatiertem Code danebengreift.
 */
function selectsWithUndefinedValue(): string[] {
  const hits: string[] = []
  for (const file of tsxFiles(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (!/<Select(\s|$)/.test(lines[i])) continue
      // Attributliste des öffnenden Tags einsammeln.
      let attrs = ""
      for (let j = i; j < Math.min(lines.length, i + 25); j++) {
        attrs += lines[j] + "\n"
        if (/^\s*>/.test(lines[j]) || /[^-=]>\s*$/.test(lines[j])) break
      }
      if (/value=\{[^}]*undefined/.test(attrs)) {
        hits.push(relative(process.cwd(), file))
      }
    }
  }
  return [...new Set(hits)].sort()
}

describe("PROJ-Y-45d — Radix-Select bekommt niemals einen undefined-Wert", () => {
  it("die Mangel-Maske übergibt keinen undefined-Wert mehr", () => {
    const offenders = selectsWithUndefinedValue()
    expect(offenders).not.toContain(
      "src/components/construction/construction-defect-dialog.tsx",
    )
  })

  it("keine Bau-Fläche übergibt einen undefined-Wert", () => {
    const offenders = selectsWithUndefinedValue().filter((f) =>
      f.startsWith("src/components/construction/"),
    )
    expect(offenders).toEqual([])
  })

  it("kein NEUER Fall der Defektklasse — die Ausnahmeliste ist erschöpfend", () => {
    // Absicht: diese Zusicherung soll fehlschlagen, wenn irgendwo ein weiterer
    // Select mit undefined-Wert entsteht. Sie ist damit der eigentliche
    // Regressionsschutz; der Fix oben ist nur ein Element davon.
    expect(selectsWithUndefinedValue()).toEqual(
      [...KNOWN_UNDEFINED_VALUE_SELECTS].sort(),
    )
  })

  it("der Sucher greift nicht ins Leere — er findet die bekannten Fälle wirklich", () => {
    // Ohne diese Gegenprobe wäre ein kaputter Sucher (0 Treffer) in den zwei
    // negativen Zusicherungen oben trivial grün. Dieselbe Falle wie in
    // PROJ-130-δ1/F-1, wo ein struktureller Zähler in der falschen Rolle zählte.
    expect(selectsWithUndefinedValue().length).toBe(
      KNOWN_UNDEFINED_VALUE_SELECTS.length,
    )
    expect(selectsWithUndefinedValue().length).toBeGreaterThan(0)
  })
})
