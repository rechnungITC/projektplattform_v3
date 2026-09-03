import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * DTT Stufe 5 — Type-vs-SELECT-Drift.
 *
 * Spiegel zu hook-mapping-drift.test.ts: dort wird geprüft, dass jede
 * SELECT'd-Spalte im Mapping landet (DB → Frontend). Hier wird die andere
 * Richtung geprüft: jedes Field im Frontend-Type muss in mindestens einem
 * "primary" Hook-SELECT vorkommen (oder in einer Allowlist von
 * Frontend-derived/computed Fields stehen).
 *
 * Bug-Klasse: ein neues Field wird zum Type hinzugefügt (z. B. PROJ-25
 * Stage 5 → `WorkItem.planned_start: string | null`), aber kein Hook
 * holt es aus der DB. Frontend nutzt `item.planned_start` ohne Warning,
 * Wert ist immer undefined → leere UI ohne erkennbaren Fehler.
 *
 * PROJ-Y-155g — **die Schutzschicht hatte ein Loch, und es hat zugeschlagen.**
 * Die Prüfung kannte je Typ genau **einen** SELECT. PROJ-155-β.2 hat
 * `Project.settings` ergänzt und die Spalte in `use-projects.ts` (**Mehrzahl**,
 * dem erklärten Ort) nachgezogen — womit dieser Wächter befriedigt war. Gelesen
 * wird das Feld aber von `useProject` (**Einzahl**, eigener SELECT), und dort
 * fehlte es: der Auto-Scheduling-Schalter rendete immer als „aus", die ganze
 * Vorschau-Kaskade war über die Oberfläche unerreichbar. Der Spiegel
 * `hook-mapping-drift.test.ts` schwieg zu Recht — er verlangt, dass jede
 * **gelesene** Spalte abgebildet wird, und `settings` war dort weder gelesen
 * noch abgebildet, also in sich konsistent.
 *
 * Ein Typ darf deshalb **mehrere** Leseorte erklären, und **jeder** muss jedes
 * nicht-berechnete Feld liefern. Wer einen zweiten Hook auf denselben Typ baut,
 * trägt ihn hier ein — sonst ist er ungeprüft, und das ist genau der Weg, auf
 * dem der Defekt entstand.
 */

const REPO_ROOT = join(__dirname, "..", "..")

interface TypeCheck {
  typeFile: string
  typeName: string
  /**
   * **Alle** Hooks, die eine volle Zeile dieses Typs lesen. Jeder von ihnen
   * muss jedes nicht-berechnete Feld liefern — ein Hook, der den Typ
   * zurückgibt und ein Feld nicht holt, liefert dort `undefined`, während der
   * Typ etwas anderes verspricht (PROJ-Y-155g).
   */
  selects: { file: string; table: string }[]
  /** Felder die im Type sind aber NICHT aus der DB kommen — z. B.
   *  Frontend-derived (responsible_display_name aus Subselect-Join). */
  computedFields?: string[]
}

const TYPE_CHECKS: TypeCheck[] = [
  {
    typeFile: "src/types/work-item.ts",
    typeName: "WorkItem",
    selects: [
      { file: "src/hooks/use-work-items.ts", table: "work_items" },
    ],
    // Keine derived fields auf dem Base-Type. WorkItemWithProfile
    // erweitert WorkItem mit responsible_display_name + responsible_email
    // (separat geprüft).
    computedFields: [],
  },
  {
    typeFile: "src/types/phase.ts",
    typeName: "Phase",
    selects: [
      { file: "src/hooks/use-phases.ts", table: "phases" },
    ],
  },
  {
    typeFile: "src/types/milestone.ts",
    typeName: "Milestone",
    selects: [
      { file: "src/hooks/use-milestones.ts", table: "milestones" },
    ],
  },
  {
    typeFile: "src/types/sprint.ts",
    typeName: "Sprint",
    selects: [
      { file: "src/hooks/use-sprints.ts", table: "sprints" },
    ],
  },
  {
    typeFile: "src/types/project.ts",
    typeName: "Project",
    // Zwei Leseorte: die Liste und der Einzelabruf. Der zweite fehlte hier,
    // und daran ist PROJ-155-β.2 in Produktion still gescheitert.
    selects: [
      { file: "src/hooks/use-projects.ts", table: "projects" },
      { file: "src/hooks/use-project.ts", table: "projects" },
    ],
  },
]

/**
 * Strip /* ... *\/ block-comments from source so JSDoc above interface
 * fields doesn't get mistaken for a `key:` line.
 */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Extract field names from `export interface <name> { ... }`. Returns
 * top-level keys only (ignores nested object types).
 */
function extractInterfaceFields(source: string, name: string): string[] {
  const stripped = stripBlockComments(source)
  const startRe = new RegExp(`export\\s+interface\\s+${name}\\s*\\{`, "u")
  const match = startRe.exec(stripped)
  if (!match) return []

  // Walk braces from match-end forward.
  const startIdx = match.index + match[0].length
  let depth = 1
  let i = startIdx
  while (i < stripped.length && depth > 0) {
    const c = stripped[i]
    if (c === "{") depth++
    else if (c === "}") depth--
    i++
  }
  if (depth !== 0) return []
  const body = stripped.slice(startIdx, i - 1)

  // Pattern: top-level `<name>?:` or `<name>:` at start of line (after
  // any whitespace). Avoid object-literal-keys nested deeper than 1 brace
  // by tracking depth.
  const fields: string[] = []
  let nestDepth = 0
  for (const line of body.split("\n")) {
    for (const c of line) {
      if (c === "{") nestDepth++
      else if (c === "}") nestDepth--
    }
    if (nestDepth > 0) continue
    const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*\??\s*:/iu)
    if (m) fields.push(m[1])
  }
  return fields
}

function extractSelectColumns(source: string, table: string): string[] {
  const fromIdx = source.indexOf(`.from("${table}")`)
  if (fromIdx === -1) return []
  const selectIdx = source.indexOf(".select(", fromIdx)
  if (selectIdx === -1) return []
  const openQuote = source.indexOf('"', selectIdx)
  if (openQuote === -1) return []
  const closeQuote = source.indexOf('"', openQuote + 1)
  if (closeQuote === -1) return []
  const raw = source.slice(openQuote + 1, closeQuote)

  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === "(") depth++
    else if (c === ")") depth--
    else if (c === "," && depth === 0) {
      parts.push(raw.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(raw.slice(start).trim())
  return parts.map((p) => {
    const colonIdx = p.indexOf(":")
    return (colonIdx === -1 ? p : p.slice(0, colonIdx)).trim()
  })
}

describe("Type-vs-SELECT drift (DTT Stufe 5)", () => {
  for (const check of TYPE_CHECKS) {
    it(`${check.typeName} — every field is provided by every declared SELECT or marked computed`, () => {
      const typePath = join(REPO_ROOT, check.typeFile)
      const typeSource = readFileSync(typePath, "utf8")
      const typeFields = extractInterfaceFields(typeSource, check.typeName)
      expect(
        typeFields.length,
        `Could not parse any fields from ${check.typeName} in ${check.typeFile}`,
      ).toBeGreaterThan(0)
      expect(
        check.selects.length,
        `${check.typeName} declares no SELECT site`,
      ).toBeGreaterThan(0)

      const computed = new Set(check.computedFields ?? [])

      for (const site of check.selects) {
        const selectSource = readFileSync(join(REPO_ROOT, site.file), "utf8")
        const selectColumns = new Set(
          extractSelectColumns(selectSource, site.table),
        )
        expect(
          selectColumns.size,
          `Could not parse any SELECT columns from ${site.file}`,
        ).toBeGreaterThan(0)

        for (const field of typeFields) {
          if (computed.has(field)) continue
          expect(
            selectColumns.has(field),
            `${check.typeName}.${field} (${check.typeFile}) is in the type but missing from the SELECT in ${site.file} → ${site.table}. Either add it to that SELECT or list it as a computed field. Ein zweiter Leseort, der ein Feld nicht holt, liefert dort undefined — genau der PROJ-Y-155g-Defekt.`,
          ).toBe(true)
        }
      }
    })
  }
})
