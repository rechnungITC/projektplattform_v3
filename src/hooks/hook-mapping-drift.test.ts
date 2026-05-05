import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Read-side drift detection — Spiegel zu den POST/PATCH-Schema-Drift-Tests
 * (281 Tests, Refactor 2026-05-04).
 *
 * Bug-Klasse: ein Hook macht `.from(table).select("a, b, c, d")`, aber das
 * nachgelagerte field-by-field-Mapping listet nur `a` und `b` auf — `c`
 * und `d` werden aus der DB geholt aber nie ins Frontend-Item gemapped.
 * Das Frontend bekommt die Werte nie zu sehen → save-revert-Bugs (z. B.
 * 770add3 — work_items planned_start/planned_end).
 *
 * Statische Datei-Inspektion statt Hook-Mocks: für jeden Hook wird das
 * Source-File geparst, der mehrzeilige SELECT-String extrahiert, und
 * für jede Spalte wird geprüft, dass sie irgendwo im File auch als
 * Object-Key auftaucht (`spalte: ...`).
 *
 * Was das nicht abdeckt:
 *   - Spread-Pattern (`{ ...row }`): Test wäre fälschlich grün, aber
 *     wir nutzen kein Spread in den Hooks heute.
 *   - Wenn ein Mapping eine Spalte nutzt aber unter anderem Namen
 *     persistiert (z. B. `tenant_id: row.tenantId`): wäre falsch grün.
 *     Heute kein Vorkommen.
 *   - Hook ohne Mapping (z. B. .single().data direkt zurückgegeben):
 *     wird via skipFiles unten ausgenommen.
 */

const REPO_ROOT = join(__dirname, "..", "..")

interface HookCheck {
  /** Datei relativ zu repo-root. */
  file: string
  /** Tabelle die im SELECT geprüft wird. */
  table: string
  /** Spaltennamen die im Mapping nicht erwartet werden — z. B. weil sie
   *  via Joined-Subselect kommen oder umbenannt werden. */
  ignoreColumns?: string[]
  /** Hook nutzt direct-cast (`setX(data as RawRow[])`) statt
   *  field-by-field-Mapping. Bei direct-cast kann strukturell kein
   *  "save-revert"-Bug entstehen weil kein lossy step — der Cast
   *  preserved jedes Feld zur Laufzeit; TS-Sicherheit kommt vom
   *  RawRow-Type. Wir überspringen den Mapping-Check, prüfen aber, dass
   *  ein RawRow-Type-Eintrag pro Spalte existiert.
   */
  directCast?: boolean
}

const HOOKS_TO_CHECK: HookCheck[] = [
  {
    file: "src/hooks/use-work-items.ts",
    table: "work_items",
    // `responsible:profiles!...(...)` ist ein Joined-Subselect, kein
    // direkt mappbares Feld. Es wird in responsible_display_name +
    // responsible_email aufgespalten — anderes Naming, anders geprüft.
    ignoreColumns: ["responsible"],
  },
  {
    file: "src/hooks/use-work-item.ts",
    table: "work_items",
    ignoreColumns: ["responsible"],
  },
  {
    file: "src/hooks/use-phases.ts",
    table: "phases",
  },
  {
    file: "src/hooks/use-milestones.ts",
    table: "milestones",
  },
  {
    file: "src/hooks/use-sprints.ts",
    table: "sprints",
    directCast: true,
  },
  {
    file: "src/hooks/use-projects.ts",
    table: "projects",
  },
  {
    file: "src/hooks/use-project.ts",
    table: "projects",
  },
  {
    file: "src/hooks/use-project-members.ts",
    table: "project_memberships",
    // Profile-Subselect, gleiche Begründung wie work_items.
    ignoreColumns: ["profiles"],
  },
  {
    file: "src/hooks/use-tenant-members.ts",
    table: "tenant_memberships",
    ignoreColumns: ["profiles"],
  },
  {
    file: "src/hooks/use-tenant-memberships.ts",
    table: "tenant_memberships",
    ignoreColumns: ["tenant", "tenants"],
    directCast: true,
  },
]

/**
 * Extract the columns from the FIRST multi-line `.select(...)` after the
 * given `.from("<table>")` call. Single-line selects are caught too.
 *
 * Returns plain column names (no `:` aliases, no joined subselects).
 */
function extractSelectColumns(source: string, table: string): string[] {
  const fromIdx = source.indexOf(`.from("${table}")`)
  if (fromIdx === -1) return []
  const selectIdx = source.indexOf(".select(", fromIdx)
  if (selectIdx === -1) return []

  // Find the matching string-literal that's the .select() argument.
  // Two forms: `.select("..." )` single-line or `.select("...", )` multiline.
  // We look for the next `"` after `.select(`, then the closing `"`.
  const openQuote = source.indexOf('"', selectIdx)
  if (openQuote === -1) return []
  const closeQuote = source.indexOf('"', openQuote + 1)
  if (closeQuote === -1) return []

  const raw = source.slice(openQuote + 1, closeQuote)
  // Split by top-level commas — but joined subselects can contain commas
  // inside parens, so we track paren-depth.
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

  // Strip joined-subselect notation: "foo:bar(...)" → "foo".
  // Strip column-alias notation: "foo:bar" → "foo".
  return parts.map((p) => {
    const colonIdx = p.indexOf(":")
    return (colonIdx === -1 ? p : p.slice(0, colonIdx)).trim()
  })
}

describe("Hook SELECT vs. mapping drift", () => {
  for (const check of HOOKS_TO_CHECK) {
    it(`${check.file} — every SELECT'd column from "${check.table}" is mapped`, () => {
      const path = join(REPO_ROOT, check.file)
      const source = readFileSync(path, "utf8")

      const columns = extractSelectColumns(source, check.table)
      expect(
        columns.length,
        `Could not extract any SELECT columns from ${check.file} (.from("${check.table}"))`,
      ).toBeGreaterThan(0)

      const ignored = new Set(check.ignoreColumns ?? [])

      if (check.directCast) {
        // Hook uses `setX(data as RawRow[])` — no field-by-field mapping.
        // Drift would mean RawRow-Type is missing a column. We check that
        // every SELECT'd column appears at least once in the file (most
        // likely as a RawRow type member or destructure).
        for (const col of columns) {
          if (ignored.has(col)) continue
          const re = new RegExp(`\\b${col}\\b`, "u")
          expect(
            source,
            `${check.file} (directCast): column "${col}" is in the SELECT list of "${check.table}" but never referenced in the file (RawRow-Type drift?).`,
          ).toMatch(re)
        }
        return
      }

      for (const col of columns) {
        if (ignored.has(col)) continue
        // Look for "<col>:" or "<col> :" in the file — typical mapping
        // pattern. Allow optional whitespace.
        const re = new RegExp(`\\b${col}\\s*:`, "u")
        expect(
          source,
          `${check.file}: column "${col}" is in the SELECT list of "${check.table}" but missing from the mapping (no "${col}: ..." entry found in the file).`,
        ).toMatch(re)
      }
    })
  }
})
