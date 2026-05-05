/**
 * PostgREST SELECT-string parser.
 *
 * Splits a `select(...)` argument into column names and embedded-relation
 * blocks. Used by the AST walker to extract the column list it must
 * validate against `information_schema.columns`.
 *
 * Handles PostgREST syntax:
 *   "id, title"                          -> 2 columns
 *   "id, alias:title"                    -> 2 columns (alias dropped)
 *   "id, responsible:profiles!fk(name)"  -> 1 column + 1 embedded relation
 *   "id, foo(a, b)"                      -> 1 column + 1 embedded relation
 *   "*"                                  -> wildcard (returns kind="wildcard")
 *
 * Embedded relations are returned but NOT recursively validated in α-slice
 * — the diff layer simply skips them. See PROJ-42-β for nested validation.
 */

export interface ParsedSelect {
  kind: "columns" | "wildcard"
  columns: string[]
  embeddedRelations: EmbeddedRelation[]
}

export interface EmbeddedRelation {
  /** Field name in the PostgREST response (alias if present, else relation name). */
  alias: string | null
  /** Underlying table/view referenced. */
  relation: string
  /** Inner SELECT string (for recursive validation in PROJ-42-β). */
  innerSelect: string
}

/**
 * Splits a PostgREST SELECT-string at top-level commas (respecting parens).
 * Returns trimmed segments. Empty segments are dropped.
 */
function splitTopLevel(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let buffer = ""
  for (const ch of input) {
    if (ch === "(") {
      depth += 1
      buffer += ch
    } else if (ch === ")") {
      depth -= 1
      buffer += ch
    } else if (ch === "," && depth === 0) {
      const trimmed = buffer.trim()
      if (trimmed.length > 0) out.push(trimmed)
      buffer = ""
    } else {
      buffer += ch
    }
  }
  const trimmed = buffer.trim()
  if (trimmed.length > 0) out.push(trimmed)
  return out
}

/**
 * Parses a single segment of a SELECT string.
 *
 * Forms:
 *   "title"                          -> column "title"
 *   "alias:title"                    -> column "title" (alias ignored)
 *   "responsible:profiles!fk(name)"  -> embedded relation
 *   "profiles(name)"                 -> embedded relation (no alias)
 *   "profiles!fk(name)"              -> embedded relation (no alias)
 */
function parseSegment(segment: string):
  | { kind: "column"; name: string }
  | { kind: "embedded"; relation: EmbeddedRelation }
  | { kind: "skip"; reason: string } {
  // An embedded relation always contains parens.
  const parenIdx = segment.indexOf("(")
  if (parenIdx === -1) {
    // Plain column. May have alias prefix `alias:column`.
    const colonIdx = segment.indexOf(":")
    const name = colonIdx === -1 ? segment : segment.slice(colonIdx + 1)
    const cleaned = name.trim()
    if (cleaned.length === 0) return { kind: "skip", reason: "empty segment" }
    return { kind: "column", name: cleaned }
  }

  // Embedded relation: <left>(<inner>)
  // <left> may be: relation, alias:relation, relation!fk, alias:relation!fk
  const left = segment.slice(0, parenIdx).trim()
  const lastParen = segment.lastIndexOf(")")
  if (lastParen === -1 || lastParen < parenIdx) {
    return { kind: "skip", reason: "unbalanced parens" }
  }
  const inner = segment.slice(parenIdx + 1, lastParen)

  let alias: string | null = null
  let relationPart = left
  const colonIdx = left.indexOf(":")
  if (colonIdx !== -1) {
    alias = left.slice(0, colonIdx).trim()
    relationPart = left.slice(colonIdx + 1).trim()
  }
  // Drop the !<fk-hint> if present.
  const bangIdx = relationPart.indexOf("!")
  const relation =
    bangIdx === -1 ? relationPart : relationPart.slice(0, bangIdx).trim()
  if (relation.length === 0) {
    return { kind: "skip", reason: "missing relation name" }
  }

  return {
    kind: "embedded",
    relation: { alias, relation, innerSelect: inner },
  }
}

/**
 * Parses a PostgREST SELECT-string into columns + embedded relations.
 *
 * Returns kind="wildcard" if the SELECT is *only* "*" or contains "*" as
 * one of its top-level segments (e.g. `"*, tag:tags(name)"`). PostgREST
 * treats either form as "all columns plus the listed embeds" — drift is
 * not statically checkable when "*" is present, so we skip the call.
 * Embedded relations alongside "*" are still parsed and returned for
 * future PROJ-42-β nested validation.
 */
export function parseSelect(input: string): ParsedSelect {
  const trimmed = input.trim()
  if (trimmed === "*") {
    return { kind: "wildcard", columns: [], embeddedRelations: [] }
  }

  const segments = splitTopLevel(trimmed)
  const columns: string[] = []
  const embeddedRelations: EmbeddedRelation[] = []
  let hasWildcard = false
  for (const segment of segments) {
    if (segment === "*") {
      hasWildcard = true
      continue
    }
    const parsed = parseSegment(segment)
    if (parsed.kind === "column") {
      columns.push(parsed.name)
    } else if (parsed.kind === "embedded") {
      embeddedRelations.push(parsed.relation)
    }
    // skip kinds are silently dropped — they're parser-recoverable noise.
  }
  if (hasWildcard) {
    return { kind: "wildcard", columns: [], embeddedRelations }
  }
  return { kind: "columns", columns, embeddedRelations }
}
