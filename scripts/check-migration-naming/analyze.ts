/**
 * PROJ-134 — pure analysis of supabase migration filenames + content.
 *
 * No filesystem / DB access here (fully unit-testable). The index.ts entry
 * reads the directory and feeds {name, content} pairs in.
 *
 * HARD-FAIL (errors → CI fails):
 *   - filename not matching ^\d{14}_[a-z0-9_]+\.sql$        (AC-134.3)
 *   - two files sharing the same 14-digit version prefix    (AC-134.2, the
 *     PROJ-69/PROJ-89 collision that breaks `supabase db push`)
 *   - bare `moddatetime` in a trigger body instead of `extensions.moddatetime`
 *     (PROJ-Y-130g) — see MODDATETIME_EXCEPTIONS for why this is an error and
 *     not a warning
 * WARN (non-blocking):
 *   - seconds-precise timestamp (SS != "00", not minute-rastered)  (AC-134.3)
 *   - version prefixes not strictly ascending in sorted order      (AC-134.3)
 *   - `create table` without `if not exists`                       (AC-134.4)
 */

export interface MigrationFile {
  name: string // basename, e.g. "20260629084539_proj116_dd_report.sql"
  content: string
}

export interface AnalysisResult {
  errors: string[]
  warnings: string[]
}

const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/
// `create table` (optionally `create table if not exists`) — warn when the
// `if not exists` guard is absent. Tolerates arbitrary whitespace/newlines.
// `\btable\b` (no trailing \s+) so the `\s+` lives INSIDE the lookahead — that
// stops `\s+` from backtracking to one space and defeating the guard on
// "create table  if not exists" (multiple spaces).
const CREATE_TABLE_RE = /\bcreate\s+table\b(?!\s+if\s+not\s+exists\b)/gi

/**
 * PROJ-Y-130g — `execute function moddatetime(...)` ohne Schema-Qualifizierung.
 *
 * CLAUDE.md verlangt `extensions.moddatetime`. Der Grund, live gemessen: die
 * Extension liegt in Prod im Schema `extensions`, `public` hat 0 solche
 * Funktionen — die bare Form löst dort nur über den `search_path` auf. In einer
 * `SECURITY DEFINER`-Funktion mit `set search_path = public, pg_temp` löst sie
 * gar nicht auf.
 *
 * Bis PROJ-Y-130g erzwang niemand die Regel; der Schema-Drift-Replay stolperte
 * bloß darüber, weil seine Shadow-DB `extensions` nicht im `search_path` hatte —
 * und verschwieg es in einer Warnung, die die Ursache nicht nannte. Zwei
 * Migrationen verletzten die Regel dadurch unbemerkt und kosteten den Replay
 * 704 Zeilen plus eine Kaskade. Nach der `search_path`-Angleichung im Workflow
 * würde der Replay die bare Form akzeptieren — deshalb wird die Regel hier
 * ausdrücklich geprüft, statt sich weiter auf eine Umgebungsdifferenz zu
 * verlassen.
 *
 * Fehler, nicht Warnung: die Lehre aus PROJ-Y-130f ist, dass eine Warnung, die
 * niemand liest, nichts verhindert.
 */
const BARE_MODDATETIME_RE =
  /\bexecute\s+(?:function|procedure)\s+(?!extensions\s*\.)(?:public\s*\.\s*)?moddatetime\b/gi

/**
 * Migrationen, die die Regel verletzen und **nicht** korrigierbar sind:
 * Migrationen sind append-only. Beide sind in Prod korrekt angewendet — dort
 * trägt der `search_path` die Auflösung; der Schaden lag ausschließlich im
 * Fresh-Apply-Replay und ist durch die `search_path`-Angleichung behoben.
 *
 * Die Liste ist bewusst kurz und eingefroren: ein neuer Eintrag ist eine
 * bewusste Entscheidung und fällt im Diff auf.
 */
export const MODDATETIME_EXCEPTIONS: readonly string[] = [
  "20260703135741_proj107_risk_register.sql",
  "20260721094301_proj110_stage_gates_and_decision_fields.sql",
] as const

export function analyzeMigrations(files: MigrationFile[]): AnalysisResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Sort by name so ordering checks are deterministic.
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))

  const prefixToNames = new Map<string, string[]>()
  const validPrefixes: string[] = []

  for (const f of sorted) {
    const m = NAME_RE.exec(f.name)
    if (!m) {
      errors.push(
        `${f.name}: filename must match ^\\d{14}_[a-z0-9_]+\\.sql$ ` +
          `(14-digit timestamp + snake_case slug). PROJ-134 AC-134.3.`
      )
      continue
    }
    const prefix = m[1]
    prefixToNames.set(prefix, [...(prefixToNames.get(prefix) ?? []), f.name])
    validPrefixes.push(prefix)

    // PROJ-Y-130g: bare `moddatetime` — Fehler, sofern nicht dokumentierte Ausnahme.
    if (BARE_MODDATETIME_RE.test(f.content)) {
      BARE_MODDATETIME_RE.lastIndex = 0 // `g`-Flag: Zustand vor dem nächsten Lauf zurücksetzen
      if (!MODDATETIME_EXCEPTIONS.includes(f.name)) {
        errors.push(
          `${f.name}: bare \`moddatetime\` in a trigger body. Use ` +
            `\`extensions.moddatetime\` — the bare form resolves in prod only via ` +
            `search_path and not at all inside a SECURITY DEFINER function with ` +
            `\`set search_path = public, pg_temp\`. CLAUDE.md / PROJ-Y-130g.`
        )
      }
    } else {
      BARE_MODDATETIME_RE.lastIndex = 0
    }

    // seconds-precise warning (SS = chars 13-14 of YYYYMMDDHHMMSS)
    const seconds = prefix.slice(12, 14)
    if (seconds !== "00") {
      warnings.push(
        `${f.name}: seconds-precise timestamp (…${prefix.slice(8)}); ` +
          `prefer minute-rastered (…${prefix.slice(8, 12)}00) to avoid MCP ` +
          `apply_migration drift. PROJ-134 AC-134.3.`
      )
    }

    // idempotency warning (AC-134.4) — warn, not fail.
    if (CREATE_TABLE_RE.test(f.content)) {
      warnings.push(
        `${f.name}: 'create table' without 'if not exists' — prefer idempotent ` +
          `DDL so a re-apply doesn't hard-abort. PROJ-134 AC-134.4 (warn).`
      )
    }
    CREATE_TABLE_RE.lastIndex = 0 // reset stateful global regex
  }

  // collision: same 14-digit prefix on >1 file (AC-134.2, hard-fail)
  for (const [prefix, names] of prefixToNames) {
    if (names.length > 1) {
      errors.push(
        `Version-prefix collision on ${prefix}: ${names.join(", ")}. ` +
          `Duplicate prefixes break 'supabase db push' (PROJ-69/PROJ-89 incident). ` +
          `PROJ-134 AC-134.2.`
      )
    }
  }

  // strictly-ascending order (AC-134.3, warn). Duplicates are already errors;
  // this catches a new migration inserted with an out-of-order timestamp.
  for (let i = 1; i < validPrefixes.length; i++) {
    if (validPrefixes[i] <= validPrefixes[i - 1]) {
      warnings.push(
        `Version order not strictly ascending: ${validPrefixes[i - 1]} ` +
          `then ${validPrefixes[i]}. PROJ-134 AC-134.3 (warn).`
      )
    }
  }

  return { errors, warnings }
}
