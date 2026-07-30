/**
 * PROJ-141-β2 (M-8) — Structured frontmatter diff for the rollback confirmation.
 *
 * `rollback_skill_version` copies BOTH `markdown_content` and `frontmatter` from
 * the archived target into a new draft version. The prior body-only line-diff
 * silently missed changes to `allowed_actions` / `allowed_kinds` / `temperature`
 * / `tone` / `model_overrides`, so an admin could confirm "no changes" while
 * the action mandate flipped underneath.
 *
 * The diff is a per-key list of adds/removals so the dialog can flag the
 * action-mandate change prominently without falling back to opaque LCS.
 */

import type { SkillFrontmatter } from "@/types/skill"

export type FrontmatterFieldKind =
  /** ordered set of strings (allowed_actions / allowed_kinds) */
  | "string-list"
  /** free-form scalar (tone) */
  | "scalar"
  /** number scalar (temperature) */
  | "number"
  /** ordered key→value map (model_overrides) */
  | "kv-map"

export interface FrontmatterFieldDiff {
  key: keyof SkillFrontmatter
  label: string
  kind: FrontmatterFieldKind
  /** items present in target (rollback goal) but not in active — will be added by rollback */
  added: string[]
  /** items present in active but not in target — will be removed by rollback */
  removed: string[]
  /** truthy when the two sides differ in any way */
  changed: boolean
}

const FIELD_LABELS: Record<keyof SkillFrontmatter, string> = {
  allowed_actions: "Erlaubte Aktionen (allowed_actions)",
  allowed_kinds: "Erlaubte Zielarten (allowed_kinds)",
  temperature: "Temperature",
  tone: "Tonalität (tone)",
  model_overrides: "Modell-Overrides (model_overrides)",
}

const FIELD_KINDS: Record<keyof SkillFrontmatter, FrontmatterFieldKind> = {
  allowed_actions: "string-list",
  allowed_kinds: "string-list",
  temperature: "number",
  tone: "scalar",
  model_overrides: "kv-map",
}

/** Normalise a possibly-null/undefined string-list into a stable, deduped array. */
function toStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return Array.from(new Set(v.filter((x): x is string => typeof x === "string")))
}

/** Normalise a scalar into a displayable string (empty string when unset). */
function toScalar(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "number") return String(v)
  return String(v)
}

/** Normalise a kv-map into sorted `key=value` lines. */
function toKvLines(v: unknown): string[] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return []
  const entries = Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => [k, val == null ? "" : String(val)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([k, val]) => `${k}=${val}`)
}

function diffLists(active: string[], target: string[]): {
  added: string[]
  removed: string[]
  changed: boolean
} {
  const setActive = new Set(active)
  const setTarget = new Set(target)
  const added = target.filter((x) => !setActive.has(x))
  const removed = active.filter((x) => !setTarget.has(x))
  return { added, removed, changed: added.length > 0 || removed.length > 0 }
}

function diffScalars(active: string, target: string): {
  added: string[]
  removed: string[]
  changed: boolean
} {
  if (active === target) return { added: [], removed: [], changed: false }
  return {
    added: target ? [target] : [],
    removed: active ? [active] : [],
    changed: true,
  }
}

const FIELD_ORDER: (keyof SkillFrontmatter)[] = [
  "allowed_actions",
  "allowed_kinds",
  "temperature",
  "tone",
  "model_overrides",
]

export function diffFrontmatter(
  active: SkillFrontmatter | null | undefined,
  target: SkillFrontmatter | null | undefined
): FrontmatterFieldDiff[] {
  const a = active ?? {}
  const t = target ?? {}
  const out: FrontmatterFieldDiff[] = []
  for (const key of FIELD_ORDER) {
    const kind = FIELD_KINDS[key]
    let d: { added: string[]; removed: string[]; changed: boolean }
    if (kind === "string-list") {
      d = diffLists(toStringList(a[key]), toStringList(t[key]))
    } else if (kind === "kv-map") {
      d = diffLists(toKvLines(a[key]), toKvLines(t[key]))
    } else {
      d = diffScalars(toScalar(a[key]), toScalar(t[key]))
    }
    out.push({
      key,
      label: FIELD_LABELS[key],
      kind,
      added: d.added,
      removed: d.removed,
      changed: d.changed,
    })
  }
  return out
}

export function hasFrontmatterChanges(diffs: FrontmatterFieldDiff[]): boolean {
  return diffs.some((d) => d.changed)
}

export function hasAllowedActionsChange(diffs: FrontmatterFieldDiff[]): boolean {
  return diffs.find((d) => d.key === "allowed_actions")?.changed ?? false
}
