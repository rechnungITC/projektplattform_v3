/**
 * Guards the `Deployment Scope` column in `features/INDEX.md`.
 *
 * Lifecycle status says where a feature sits in the workflow; deployment scope says what was
 * actually shipped. `.claude/rules/general.md` makes them two separate fields with a fixed table of
 * legal combinations — this analyzer is that table, executable.
 *
 * Why it exists: the rule was written because "Deployed" had been awarded to work that was partly
 * deferred (PROJ-141-γ1). A rule nobody can run drifts back; a required check does not.
 *
 * Parsing note — anchor at the END of the line, never at field numbers. Row prose legitimately
 * contains escaped pipes (`\|`), and four rows carried *unescaped* ones until PROJ-145 repaired
 * them. Every row ends `| <status> | <scope> | <spec> | <date> |`, so the four rightmost structural
 * pipes plus the two leftmost are the frame; anything between them is prose.
 */

export const SCOPE_FULL = "full"
export const SCOPE_MVP = "mvp"
export const SCOPE_ALPHA = "alpha"
export const SCOPE_TOOLING = "tooling-only"
export const SCOPE_SUPERSEDED = "superseded"
export const SCOPE_EMPTY = "—"

/**
 * Transitional marker for the legacy rows PROJ-145 introduced the column for.
 *
 * It is deliberately NOT a scope value. The rule forbids inventing scopes for unreviewed rows, so
 * the debt is written down in full view instead of guessed at. Rows carrying it are counted as a
 * warning on every run so the backlog cannot quietly become permanent.
 */
export const SCOPE_UNCLASSIFIED = "– nicht klassifiziert –"

/** Scopes a `Deployed` row may legitimately carry. */
const DEPLOYED_SCOPES = new Set<string>([SCOPE_FULL, SCOPE_MVP, SCOPE_ALPHA, SCOPE_TOOLING])

const ALL_SCOPES = new Set<string>([
  ...DEPLOYED_SCOPES,
  SCOPE_SUPERSEDED,
  SCOPE_EMPTY,
  SCOPE_UNCLASSIFIED,
])

export const EXPECTED_HEADER = "| ID | Feature | Status | Deployment Scope | Spec | Created |"

export type IndexRow = {
  id: string
  status: string
  scope: string
  line: number
}

export type IndexAnalysis = {
  errors: string[]
  warnings: string[]
  rows: IndexRow[]
  unclassified: string[]
}

/** Unescaped `|` only — `\|` is prose and must not be treated as a cell boundary. */
function structuralPipes(line: string): number[] {
  const out: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "|" && (i === 0 || line[i - 1] !== "\\")) out.push(i)
  }
  return out
}

/** Strip markdown emphasis so `**Deployed (…)**` and `Deployed` classify identically. */
function coreStatus(cell: string): string {
  return cell.trim().replace(/^\*+/, "").replace(/\*+$/, "").trim()
}

export function analyzeIndex(content: string): IndexAnalysis {
  const errors: string[] = []
  const warnings: string[] = []
  const rows: IndexRow[] = []
  const unclassified: string[] = []

  const lines = content.split("\n")
  // Counted separately from `rows`: a row that fails the cell-count check never reaches `rows`, and
  // keying "is the table still there?" off `rows` would bury a broken row under a wrong diagnosis.
  let matched = 0

  if (!lines.some((l) => l.trim() === EXPECTED_HEADER)) {
    errors.push(
      `features/INDEX.md: the table header does not carry the separate Deployment Scope column. ` +
        `Expected exactly: ${EXPECTED_HEADER}`
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith("| PROJ-")) continue
    matched++
    const lineNo = i + 1

    const idMatch = /^\|\s*(PROJ-[A-Za-z0-9-]+)/.exec(line)
    const id = idMatch ? idMatch[1] : `row@${lineNo}`

    const pipes = structuralPipes(line)
    // 6 cells => 7 structural pipes.
    if (pipes.length !== 7) {
      errors.push(
        `${id} (INDEX.md:${lineNo}): row has ${pipes.length - 1} cells, expected 6 ` +
          `(ID | Feature | Status | Deployment Scope | Spec | Created). ` +
          `Unescaped "|" in prose is the usual cause — write it as "\\|".`
      )
      continue
    }

    const status = coreStatus(line.slice(pipes[2] + 1, pipes[3]))
    const scope = line.slice(pipes[3] + 1, pipes[4]).trim()
    rows.push({ id, status, scope, line: lineNo })

    if (!ALL_SCOPES.has(scope)) {
      errors.push(
        `${id} (INDEX.md:${lineNo}): "${scope}" is not a deployment scope. ` +
          `Use one of: ${[...DEPLOYED_SCOPES].join(", ")}, ${SCOPE_SUPERSEDED}, ` +
          `${SCOPE_EMPTY} (not yet deployed), or the transitional "${SCOPE_UNCLASSIFIED}".`
      )
      continue
    }

    const isDeployed = status.startsWith("Deployed")
    const isSuperseded = status.startsWith("Superseded")

    if (scope === SCOPE_UNCLASSIFIED) {
      if (!isDeployed) {
        errors.push(
          `${id} (INDEX.md:${lineNo}): status "${status}" must not carry ` +
            `"${SCOPE_UNCLASSIFIED}" — that marker exists only for legacy Deployed rows ` +
            `awaiting the evidence-based audit.`
        )
      } else {
        unclassified.push(id)
      }
      continue
    }

    // One defect per row, one message. `Deployed + superseded` breaks two statements at once, so it
    // is named explicitly first — otherwise a single bad row emits two errors and reads like two
    // problems.
    if (isDeployed && scope === SCOPE_SUPERSEDED) {
      errors.push(
        `${id} (INDEX.md:${lineNo}): "Deployed + ${SCOPE_SUPERSEDED}" is never legal — a ` +
          `superseded feature was not deployed on its own. Pick the lifecycle status that is true.`
      )
    } else if (isDeployed) {
      if (!DEPLOYED_SCOPES.has(scope)) {
        errors.push(
          `${id} (INDEX.md:${lineNo}): Deployed requires one of ` +
            `${[...DEPLOYED_SCOPES].join(", ")} — found "${scope}".`
        )
      }
    } else if (isSuperseded) {
      if (scope !== SCOPE_SUPERSEDED) {
        errors.push(
          `${id} (INDEX.md:${lineNo}): Superseded requires scope "${SCOPE_SUPERSEDED}" — ` +
            `found "${scope}".`
        )
      }
    } else if (scope !== SCOPE_EMPTY) {
      errors.push(
        `${id} (INDEX.md:${lineNo}): status "${status}" is pre-deployment, so scope must be ` +
          `"${SCOPE_EMPTY}" — found "${scope}". Scope is only awarded at deployment.`
      )
    }
  }

  if (matched === 0) {
    errors.push("features/INDEX.md: no PROJ rows found — is the table still there?")
  }

  if (unclassified.length > 0) {
    warnings.push(
      `${unclassified.length} legacy Deployed row(s) still carry "${SCOPE_UNCLASSIFIED}". ` +
        `This is the visible bookkeeping debt PROJ-145 recorded on purpose — classify them from ` +
        `their acceptance criteria and evidence, never from the old "Deployed" label.`
    )
  }

  return { errors, warnings, rows, unclassified }
}
