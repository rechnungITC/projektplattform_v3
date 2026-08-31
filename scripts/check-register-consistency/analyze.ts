/**
 * Register-Consistency guard — rules and the measurements behind them.
 *
 * WHY THIS EXISTS
 * `features/OPEN-DEFERRED-STATUS.md` records a followup in two shapes: a row in one of its
 * tables, and — for recent slices — a bullet inside a per-feature narrative section. On
 * 2026-08-28 PROJ-Y-151e shipped, the table row was updated to "Erledigt", and the narrative
 * bullet was not. For three days the file said, about the same id, both "erledigt" (table row)
 * and "(offen, sicherheitsrelevant)" (narrative). A closed Invariante-#3 gap read as open, and
 * nothing failed: `check:index-scope` validates features/INDEX.md, and this file had no guard.
 *
 * WHAT IS DELIBERATELY *NOT* CHECKED — measured, not assumed
 * A narrative id that has no table row is NOT an error. Measured on 2026-08-31: 6 of 6
 * narrative-claim ids (PROJ-Y-152b, 155a, 155b, PROJ-155-β, 153a, 153b) have no table row —
 * that is the house convention for recent slices, not drift. Flagging it would have produced
 * six false positives on day one, and a guard that cries wolf gets ignored (PROJ-150 lesson).
 *
 * Likewise the narrative header's *status* claim is not compared to INDEX. INDEX status cells
 * are prose ("Deployed (α + β live)", "Deployed (Gantt half)"), so a word-level comparison
 * would fire on legitimate wording. Only the scope token is compared: both sides draw from the
 * closed vocabulary in .claude/rules/general.md.
 */

/** State a register entry claims. `ambiguous` means "do not judge" — reported as a warning. */
export type ClaimState = "open" | "done" | "ambiguous"

export type TableRow = { id: string; line: number; cell: string; state: ClaimState }
export type NarrativeClaim = {
  section: string
  id: string
  line: number
  lead: string
  state: ClaimState
}
export type NarrativeSection = { id: string; line: number; head: string; scope: string | null }

export type RegisterAnalysis = {
  errors: string[]
  warnings: string[]
  tableRows: TableRow[]
  sections: NarrativeSection[]
  claims: NarrativeClaim[]
  /** ids carried by both a table row and a narrative claim — the only pairs rule R1 judges. */
  comparedIds: string[]
}

/**
 * Feature and followup ids as they really occur: PROJ-42, PROJ-Y-151e, PROJ-45-β, PROJ-153-α.
 * Greek letters are part of the vocabulary (sub-slices), so they must be in the class.
 */
const ID_SOURCE = "PROJ-(?:Y-)?\\d+[A-Za-z0-9]*(?:-[A-Za-zαβγδεζ0-9]+)*"
const ID_EXACT = new RegExp(`^${ID_SOURCE}$`)
const NARRATIVE_HEAD = /^## (PROJ-\d+)\s*—\s*(.*)$/
const NARRATIVE_CLAIM = new RegExp(`^- \\*\\*(${ID_SOURCE})\\s*(?:—|–|--)`)

/**
 * Vocabulary measured against the live file, not invented. "Approved" and "In Review" are
 * lifecycle states *before* deployment, so they count as open.
 */
const DONE_WORDS = /\b(erledigt|geschlossen|resolved|deployed|behoben|closed|aufgeloest|aufgelöst)\b/i
const OPEN_WORDS = /\b(planned|offen|open|in review|approved|architected|in progress)\b/i

export function classifyState(text: string): ClaimState {
  const done = DONE_WORDS.test(text)
  const open = OPEN_WORDS.test(text)
  if (done && !open) return "done"
  if (open && !done) return "open"
  return "ambiguous"
}

/**
 * The bolded lead of a narrative bullet carries the state claim; the body narrates history and
 * routinely contains both vocabularies ("war offen", "zunächst zurückgestellt"). Classifying the
 * whole body would make almost every entry ambiguous, so only the lead is judged.
 */
export function extractLead(bulletFirstLine: string): string | null {
  const m = bulletFirstLine.match(/^- \*\*(.+?)\*\*/)
  return m ? m[1] : null
}

function parseScope(head: string): string | null {
  const m = head.match(/Scope\s+`([a-z-]+)`/)
  return m ? m[1] : null
}

/**
 * Split a markdown table row on **unescaped** pipes only — `\|` is prose, not a cell boundary.
 * Same rule as scripts/check-index-scope/analyze.ts (`structuralPipes`), and it is not cosmetic:
 * five INDEX rows and several register rows legitimately carry `\|` in their prose. A naive
 * `split("|")` reads the wrong cell there, which is exactly how this guard first mis-read its own
 * PROJ-157 row (scope cell 3 became "…, features/INDEX.md says \") — found by dogfooding.
 */
export function splitCells(line: string): string[] {
  const cells: string[] = []
  let buf = ""
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && (i === 0 || line[i - 1] !== "\\")) {
      cells.push(buf)
      buf = ""
      continue
    }
    buf += line[i]
  }
  cells.push(buf)
  // Leading and trailing pipes produce empty edge entries; drop them like the sibling guard.
  return cells.slice(1, -1).map((c) => c.trim())
}

/** Scope cell of a feature row in features/INDEX.md, or null when the row does not exist. */
function indexScope(indexText: string, featureId: string): string | null {
  const prefix = `| ${featureId} |`
  for (const line of indexText.split("\n")) {
    if (!line.startsWith(prefix)) continue
    const cells = splitCells(line)
    // Columns: ID | Feature | Status | Deployment Scope | Spec | Created
    if (cells.length < 4) return null
    return cells[3]
  }
  return null
}

export function analyzeRegister(registerText: string, indexText: string): RegisterAnalysis {
  const lines = registerText.split("\n")
  const errors: string[] = []
  const warnings: string[] = []

  // --- table rows, across every table in the file ---
  const tableRows: TableRow[] = []
  lines.forEach((line, i) => {
    if (!line.startsWith("| PROJ")) return
    const cells = splitCells(line)
    if (cells.length < 2) return
    const id = cells[0].replace(/[*`]/g, "").trim()
    if (!ID_EXACT.test(id)) return // skips header rows like "| PROJ | Status | ... |"
    tableRows.push({ id, line: i + 1, cell: cells[1], state: classifyState(cells[1]) })
  })

  // --- narrative sections and the claims inside them ---
  const sections: NarrativeSection[] = []
  const claims: NarrativeClaim[] = []
  let current: NarrativeSection | null = null
  lines.forEach((line, i) => {
    const head = line.match(NARRATIVE_HEAD)
    if (head) {
      current = { id: head[1], line: i + 1, head: head[2], scope: parseScope(head[2]) }
      sections.push(current)
      return
    }
    if (line.startsWith("## ")) {
      current = null
      return
    }
    if (!current) return
    const claim = line.match(NARRATIVE_CLAIM)
    if (!claim) return
    const lead = extractLead(line)
    claims.push({
      section: current.id,
      id: claim[1],
      line: i + 1,
      lead: lead ?? line.trim(),
      state: lead === null ? "ambiguous" : classifyState(lead),
    })
  })

  // --- R1: an id recorded in both places must not contradict itself ---
  const byId = new Map<string, TableRow[]>()
  for (const row of tableRows) {
    const list = byId.get(row.id) ?? []
    list.push(row)
    byId.set(row.id, list)
  }

  const comparedIds: string[] = []
  for (const claim of claims) {
    const rows = byId.get(claim.id)
    if (!rows) continue // narrative-only is the convention, not a defect — see header
    comparedIds.push(claim.id)
    const decided = rows.filter((r) => r.state !== "ambiguous")
    if (claim.state === "ambiguous" || decided.length === 0) {
      warnings.push(
        `${claim.id}: state not decidable — narrative line ${claim.line} ` +
          `("${truncate(claim.lead)}") vs table line ${rows[0].line} ` +
          `("${truncate(rows[0].cell)}"). Not judged.`
      )
      continue
    }
    const conflicting = decided.filter((r) => r.state !== claim.state)
    for (const row of conflicting) {
      errors.push(
        `${claim.id}: the register contradicts itself — table line ${row.line} says ` +
          `"${truncate(row.cell)}" (${row.state}), narrative line ${claim.line} says ` +
          `"${truncate(claim.lead)}" (${claim.state}). Update whichever is stale; do not delete ` +
          `the history.`
      )
    }
  }

  // --- R2: the same id in several tables must not disagree either ---
  for (const [id, rows] of byId) {
    const states = new Set(rows.filter((r) => r.state !== "ambiguous").map((r) => r.state))
    if (states.size > 1) {
      errors.push(
        `${id}: table rows disagree — ` +
          rows.map((r) => `line ${r.line} (${r.state})`).join(", ") +
          `. One id, one state.`
      )
    }
  }

  // --- R3: a narrative header that claims a scope must match features/INDEX.md ---
  for (const section of sections) {
    if (section.scope === null) continue // no claim made, nothing to contradict
    const scope = indexScope(indexText, section.id)
    if (scope === null) {
      warnings.push(
        `${section.id}: narrative header line ${section.line} claims scope \`${section.scope}\`, ` +
          `but features/INDEX.md has no row with a scope column for it.`
      )
      continue
    }
    if (scope !== section.scope) {
      errors.push(
        `${section.id}: scope disagrees — narrative header line ${section.line} says ` +
          `\`${section.scope}\`, features/INDEX.md says \`${scope}\`.`
      )
    }
  }

  return { errors, warnings, tableRows, sections, claims, comparedIds }
}

function truncate(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
