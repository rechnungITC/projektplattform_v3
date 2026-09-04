/**
 * Guards against two sessions building the same slice at once.
 *
 * Why it exists: on 2026-08-26 two sessions built PROJ-Y-45p in parallel and pushed competing
 * migrations to production 27 seconds apart, leaving two rival accounting mechanisms on one column.
 * Unwinding it cost three PRs (#457/#458/#459). The mitigation that shipped was a sentence in
 * CLAUDE.md telling the next session to look for a branch first — and PROJ-Y-130f had just finished
 * demonstrating what happens to a rule nobody can execute. This analyzer is that sentence, runnable.
 *
 * The design is measured, not assumed. Two counts from the live repo decided it:
 *
 *   1. Several branches per slice ID is the NORM here, not the exception — `proj-130` carries 12,
 *      `proj-34` nine, `proj-80` five, almost all of them one lane working sequentially and never
 *      deleting the old head. So "a branch with this ID exists" is useless as a stop signal: it
 *      would fire nearly always, and a guard that cries wolf gets ignored (the PROJ-Y-130f lesson
 *      one level down).
 *   2. What actually marks a LIVE claim is a worktree. Exactly six branches were checked out at the
 *      time of writing; every other branch was inert. The colliding branch — `proj-y-45p/quota-
 *      decrement` — was in a worktree at the moment the second session looked at it and read its
 *      zero commits as "not started".
 *
 * Hence the severity split: a live worktree or an older tag stops you; recent unpushed-to-main
 * work only warns; historical debris is listed and ignored. Blocking on anything weaker would
 * reproduce the noise problem instead of the fix.
 *
 * Pure functions — no git, no filesystem, no network. The driver in ./index.ts collects the refs.
 */

/** Where a ref was found. `worktree` means a branch currently checked out somewhere. */
export type RefKind = "worktree" | "tag" | "branch-local" | "branch-remote"

/**
 * Where a *documentary* claim was found — a source that says the id already denotes something,
 * even when no ref exists any more.
 *
 * PROJ-175: the guard used to read git refs only, and git refs are exactly what a merge destroys.
 * On 2026-09-04 it reported `PROJ-171` as free two hours after PR #548 had consumed it, because
 * GitHub deletes the head branch on merge. The INDEX row caught it; the guard did not.
 */
export type RecordKind = "index-row" | "spec-file" | "id-pointer" | "prose"

/** Any place a claim can come from — a live ref or a written record. */
export type ClaimKind = RefKind | RecordKind

export type RefInput = {
  kind: RefKind
  /** Branch or tag name exactly as git reports it. */
  name: string
  /** Absolute path of the checkout, for `worktree` refs. */
  worktreePath?: string
  /** ISO date of the ref tip, used for the recency window. */
  tipIsoDate?: string
  /** True when the ref is already contained in main and therefore cannot be in flight. */
  mergedIntoMain?: boolean
  /** True when this worktree is the caller's own checkout — a claim by you, not by someone else. */
  isSelf?: boolean
  /**
   * Tags only: true when the tagged commit is contained in the current HEAD.
   *
   * Together with a fresh date this says "this lane is standing on the work the tag marks" — the
   * tag equivalent of `isSelf`. A tag another lane has not merged yet is not reachable and keeps
   * its block.
   */
  reachableFromHead?: boolean
}

export type Severity = "block" | "warn" | "info"

export type Finding = {
  severity: Severity
  kind: ClaimKind
  /** The ref that matched. */
  name: string
  /** Canonical slice id the ref resolved to. */
  slice: string
  /** Human-readable reason, already phrased for the terminal. */
  detail: string
}

export type Analysis = {
  /** Canonical form of the requested slice, e.g. `proj-y-45p`. */
  slice: string
  /** Findings for the requested slice itself, most severe first. */
  findings: Finding[]
  /** Other slices of the same feature number — never blocking, context only. */
  related: Finding[]
  blocked: boolean
}

/** A ref whose tip is older than this is treated as debris rather than work in flight. */
export const RECENT_DAYS = 7

/**
 * PROJ-Y-151c — how long a tag counts as "just shipped by whoever is standing on it".
 *
 * The tag rule reads "already deployed, check the register before rebuilding it". That reason does
 * not fit the hours right after a deploy: the lane that shipped the slice routinely needs one more
 * branch for a correction, and refusing it there is a pure false positive. It happened on
 * 2026-08-27 — the PROJ-Y-151b closure tagged the slice and the very next branch was refused, on
 * the lane's OWN tag, two minutes old. Since PROJ-Y-150c the verdict is a hard `deny`, so the
 * guard's own advice ("re-run deliberately") could not help either.
 *
 * The register proposed two shapes. The precise one — exempt tags made in the current session —
 * is NOT implementable and that was measured, not assumed: git keeps no reflog for tags
 * (`core.logAllRefUpdates` covers refs/heads, refs/remotes and HEAD; `.git/logs/refs/tags/` does
 * not exist), so a locally created tag is indistinguishable from a fetched one. What is left is
 * the age window.
 *
 * 24 hours, not two: a closure run — merge, wait for the production deploy, measure, book — takes
 * the better part of an hour, and follow-up corrections keep arriving through the same working
 * day. A two-hour window was tried first and already missed this very case ten hours later.
 *
 * The price, stated rather than hidden: within the window, a tag ANOTHER lane pushed in the last
 * day also stops blocking, once you have pulled it. Two things keep that acceptable — the finding
 * is still printed loudly with the tag name and its age, and the signal that actually catches a
 * concurrent lane is the worktree, which is untouched and still blocks. A tag says the work is
 * *finished*; an unmerged branch tip says it may be *in flight*, and that case has only warned
 * since PROJ-150. Blocking harder on the weaker signal was the inversion this fixes.
 */
export const FRESH_TAG_HOURS = 24

/** Sub-slice names the repo uses, plus the Greek letters the specs write them as. */
const GREEK: Record<string, string> = {
  "α": "alpha",
  "β": "beta",
  "γ": "gamma",
  "δ": "delta",
  "ε": "epsilon",
  "ζ": "zeta",
  "η": "eta",
  "θ": "theta",
}

const GREEK_WORDS = new Set(Object.values(GREEK))

/**
 * Matches a slice id anywhere inside a ref name.
 *
 * Deliberately a search, not a positional parse: the id sits in the first segment
 * (`proj-y-45p/quota-fix`) or in the second (`docs/proj-y-143d-spec`, `feat/PROJ-62-organization-wip`).
 * It also has to survive every spelling the repo actually contains — `proj-y-45p`, `projy-145`,
 * `proj61`, `PROJ-45-delta` — which is why both hyphens are optional and the `y` is its own group.
 *
 * Only `proj`-prefixed ids are recognised, so a multi-slice branch name such as
 * `fix/proj18-25b-28-36-deferred-qa` registers PROJ-18 and not the bare numbers after it. That is a
 * deliberate miss: matching loose digits would drag in every `2` and `36` in a branch name.
 */
const ID_PATTERN = /proj-?(y)?-?(\d+)([a-z])?(?:-([a-z]+))?/gi

/** Folds a Greek letter or sub-slice word to its canonical Latin name, or null if it is not one. */
function canonicalSubSlice(raw: string | undefined): string | null {
  if (!raw) return null
  const lowered = raw.toLowerCase()
  if (GREEK_WORDS.has(lowered)) return lowered
  return null
}

/** Builds the canonical id string from its parts. */
function compose(isFollowup: boolean, num: string, letter: string | null, sub: string | null): string {
  const head = isFollowup ? `proj-y-${num}` : `proj-${num}`
  return `${head}${letter ?? ""}${sub ? `-${sub}` : ""}`
}

/**
 * Extracts every slice id a ref name claims, in canonical form.
 *
 * Returns an empty array for names that carry no id at all (`main`, `audit/chatbot-…`), which is
 * how non-slice branches stay silent.
 */
export function extractSliceIds(name: string): string[] {
  const out: string[] = []
  // Greek letters have to be folded before the ASCII-only pattern runs over the string.
  let normalized = name
  for (const [glyph, word] of Object.entries(GREEK)) {
    normalized = normalized.split(glyph).join(word)
  }
  // A tag is `v2.75.0-PROJ-Y-45p`; drop the version so the pattern does not read `2` as a slice.
  normalized = normalized.replace(/^v\d+(?:\.\d+)*-/i, "")

  for (const m of normalized.matchAll(ID_PATTERN)) {
    const [, y, num, letter, tail] = m
    out.push(compose(Boolean(y), num, letter ? letter.toLowerCase() : null, canonicalSubSlice(tail)))
  }
  return [...new Set(out)]
}

/**
 * Normalizes a slice id supplied on the command line.
 *
 * Accepts everything the repo writes: `PROJ-Y-45p`, `proj-y-45p`, `PROJ-45-δ`, `PROJ-45-delta`,
 * `projy-145`, and a bare branch name to read the id out of. Returns null when no id is present,
 * so the driver can refuse rather than scan for nothing.
 */
export function canonicalizeSliceId(raw: string): string | null {
  const ids = extractSliceIds(raw.trim())
  return ids.length > 0 ? ids[0] : null
}

/** The feature number two slices share when they are sub-slices or followups of one feature. */
export function relatedKey(slice: string): string | null {
  const m = /^proj-(?:y-)?(\d+)/.exec(slice)
  return m ? m[1] : null
}

function daysBetween(fromIso: string, nowIso: string): number {
  const from = Date.parse(fromIso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(from) || Number.isNaN(now)) return Number.POSITIVE_INFINITY
  return (now - from) / 86_400_000
}

const SEVERITY_ORDER: Record<Severity, number> = { block: 0, warn: 1, info: 2 }

/**
 * Classifies one matching ref.
 *
 * Only two things stop you, and both are unambiguous: someone has the branch open in a checkout, or
 * the slice already carries a tag and is therefore shipped. Everything else is information.
 */
function classify(ref: RefInput, slice: string, nowIso: string): Finding {
  if (ref.kind === "worktree" && ref.isSelf) {
    // Your own checkout is not a collision. Blocking here would make the guard fire every time a
    // session re-ran it mid-slice, which is how a check earns the right to be ignored.
    return {
      severity: "info",
      kind: ref.kind,
      name: ref.name,
      slice,
      detail: `your own checkout (${ref.worktreePath ?? "this worktree"}) — you already hold this slice.`,
    }
  }

  if (ref.kind === "worktree") {
    return {
      severity: "block",
      kind: ref.kind,
      name: ref.name,
      slice,
      detail:
        `checked out in ${ref.worktreePath ?? "a worktree"} — another session is on this slice ` +
        "right now. Talk to it before starting; do not open a second branch.",
    }
  }

  if (ref.kind === "tag") {
    const tagAgeHours = ref.tipIsoDate ? daysBetween(ref.tipIsoDate, nowIso) * 24 : Number.POSITIVE_INFINITY
    if (ref.reachableFromHead && tagAgeHours <= FRESH_TAG_HOURS) {
      // Not a foreign claim: the tag is minutes old AND its commit is in this HEAD, so this lane
      // shipped it and is now following up. Same reasoning as `isSelf` above — a guard that fires
      // on your own fresh deploy is a guard that teaches people to switch it off.
      //
      // Deliberately still loud. `warn` prints the tag and its age, so a lane that pulled someone
      // else's just-merged tag still sees it; it just is not refused.
      return {
        severity: "warn",
        kind: ref.kind,
        name: ref.name,
        slice,
        detail:
          `a tag carries this slice, but it is ${tagAgeHours < 1 ? "less than an hour" : `${Math.floor(tagAgeHours)} hour(s)`} ` +
          "old and already contained in your HEAD — you shipped it. Follow-up work is fine; " +
          "starting the slice over is not.",
      }
    }
    return {
      severity: "block",
      kind: ref.kind,
      name: ref.name,
      slice,
      detail: "a tag carries this slice — it is already deployed. Check the register before rebuilding it.",
    }
  }

  if (ref.mergedIntoMain) {
    return {
      severity: "info",
      kind: ref.kind,
      name: ref.name,
      slice,
      detail: "already merged into main — historical, not a claim.",
    }
  }

  const age = ref.tipIsoDate ? daysBetween(ref.tipIsoDate, nowIso) : Number.POSITIVE_INFINITY
  if (age <= RECENT_DAYS) {
    return {
      severity: "warn",
      kind: ref.kind,
      name: ref.name,
      slice,
      detail:
        `unmerged, tip ${age < 1 ? "less than a day" : `${Math.floor(age)} day(s)`} old — ` +
        "possibly work in flight. Check whose it is.",
    }
  }

  return {
    severity: "info",
    kind: ref.kind,
    name: ref.name,
    slice,
    detail: "unmerged but stale — debris, not a claim.",
  }
}

/**
 * Answers "is this slice claimed right now?" for the given refs.
 *
 * `nowIso` is injected rather than read from the clock so the recency window is testable.
 */
export function analyzeCollision(rawSlice: string, refs: RefInput[], nowIso: string): Analysis {
  const slice = canonicalizeSliceId(rawSlice)
  if (!slice) {
    throw new Error(
      `branch-collision: "${rawSlice}" contains no slice id. Expected something like PROJ-Y-45p or PROJ-45-delta.`
    )
  }

  const key = relatedKey(slice)
  const findings: Finding[] = []
  const related: Finding[] = []

  for (const ref of refs) {
    const ids = extractSliceIds(ref.name)
    if (ids.includes(slice)) {
      findings.push(classify(ref, slice, nowIso))
      continue
    }
    // Same feature number, different slice. Never blocking — `proj-45-delta` and `proj-45-epsilon`
    // are deliberately separate units of work — but worth seeing when you pick up a family.
    if (key && ids.some((id) => relatedKey(id) === key)) {
      const other = ids.find((id) => relatedKey(id) === key) as string
      related.push({
        severity: "info",
        kind: ref.kind,
        name: ref.name,
        slice: other,
        detail:
          ref.kind === "worktree"
            ? `sibling slice ${other} is checked out in ${ref.worktreePath ?? "a worktree"}.`
            : `sibling slice ${other}.`,
      })
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return {
    slice,
    findings,
    related,
    blocked: findings.some((f) => f.severity === "block"),
  }
}

/* ------------------------------------------------------------------------------------------------
 * PROJ-175 — documentary claims
 *
 * The guard answered one question ("is anybody on this slice?") in words that read like the answer
 * to another ("is this id available?"). Three occurrences, measured 2026-09-04:
 *
 *   PROJ-171     INDEX row 1, spec file 1, prose 7,  refs 0  -> reported `free`   (assignment, 2026-09-04)
 *   PROJ-Y-151b  INDEX row 1, spec file 1, prose 34, refs 2  -> blocked today     (PROJ-Y-150e)
 *   PROJ-159     INDEX row 0, spec file 0, prose 37, refs 0  -> reported `free`   (PROJ-163)
 *
 * There is no single source that covers them: PROJ-171 needs the INDEX row, PROJ-159 needs the prose
 * and nothing else. Hence four sources.
 *
 * Every one of them is `info`, and that is measured rather than cautious. Over the last 200 PR
 * branches, 44 of 77 distinct ids (57 %) were branched more than once — 133 branches, 66 % of all
 * PRs, `proj-45` alone 17 times — and all of those ids carry an INDEX row. A blocking rule would
 * have refused two thirds of the real work; a `warn` would shout on two thirds of all runs. Either
 * one trains people to ignore the guard, the failure PROJ-150 was written to avoid. What changes is
 * the closing sentence: it may no longer say `free` about an id that is already written down.
 * ---------------------------------------------------------------------------------------------- */

/** What the driver read from the repository, already reduced to counts and locations. */
export type RecordInput = {
  /** 1-based line numbers of `| <ID> |` rows in features/INDEX.md. */
  indexRowLines: number[]
  /** Spec file names under features/ whose name starts with the id. */
  specFiles: string[]
  /** The `## Next Available ID: PROJ-N` pointer, verbatim, or null when unreadable. */
  nextAvailableId: string | null
  /** Prose hits per file, already excluding the id's own INDEX row and the pointer line. */
  prose: { file: string; hits: number }[]
}

/**
 * Builds the pattern that finds an id as written in prose.
 *
 * The trailing lookahead is the whole point: without it `PROJ-15` matches inside `PROJ-151`,
 * `PROJ-153` and `PROJ-155`, and every short id looks claimed. Rejecting a following hyphen also
 * keeps `proj-45` from matching its own sub-slices (`PROJ-45-δ`), which the `related` section
 * already reports separately.
 */
export function recordIdPattern(slice: string): RegExp {
  const m = /^proj-(y-)?(\d+)([a-z])?(?:-(.+))?$/.exec(slice)
  if (!m) throw new Error(`not a canonical slice id: ${slice}`)
  const [, y, num, letter, sub] = m

  let body = `proj-?${y ? "y-?" : ""}${num}${letter ?? ""}`
  if (sub) {
    // A sub-slice is written either as the word or as the glyph it was folded from.
    const glyph = Object.entries(GREEK).find(([, word]) => word === sub)?.[0]
    const alts = glyph ? `${sub}|${glyph}` : sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    body += `-(?:${alts})`
  }
  return new RegExp(`${body}(?![0-9A-Za-z-])`, "gi")
}

/**
 * True when a plain top-level id sits below the `Next Available ID` pointer, i.e. it was handed out
 * already.
 *
 * Only bare `proj-<n>` ids are judged. A `PROJ-Y-` followup or a lettered sub-slice belongs to a
 * feature that already exists, so the pointer says nothing about it.
 */
/**
 * Same id, but for file names — where a hyphen legitimately follows (`PROJ-171-spec-followup.md`).
 *
 * The prose pattern rejects a trailing hyphen so that `proj-45` does not match `PROJ-45-δ`. Reusing
 * it here silently found nothing, which is why this is a separate function rather than a flag.
 */
export function fileNameIdPattern(slice: string): RegExp {
  const src = recordIdPattern(slice).source.replace(/\(\?!\[0-9A-Za-z-\]\)$/, "")
  return new RegExp(`^(?:${src})(?:-|$)`, "i")
}

export function isBelowPointer(slice: string, pointer: string | null): boolean {
  if (!pointer) return false
  const self = /^proj-(\d+)$/.exec(slice)
  const ptr = /proj-(\d+)/i.exec(pointer)
  if (!self || !ptr) return false
  return Number(self[1]) < Number(ptr[1])
}

/**
 * Turns the documentary sources into findings. Never blocking — see the block comment above.
 */
export function analyzeRecordClaims(slice: string, records: RecordInput): Finding[] {
  const out: Finding[] = []

  if (records.indexRowLines.length > 0) {
    const where = records.indexRowLines.map((l) => `features/INDEX.md:${l}`).join(", ")
    out.push({
      severity: "info",
      kind: "index-row",
      name: where,
      slice,
      detail:
        "the portfolio index already carries a row for this id — it denotes existing work, so it " +
        "is not available for a new slice",
    })
  }

  for (const file of records.specFiles) {
    out.push({
      severity: "info",
      kind: "spec-file",
      name: `features/${file}`,
      slice,
      detail: "a feature spec is filed under this id",
    })
  }

  if (isBelowPointer(slice, records.nextAvailableId)) {
    out.push({
      severity: "info",
      kind: "id-pointer",
      name: records.nextAvailableId ?? "",
      slice,
      detail: "this id is below the Next Available ID pointer, so it was handed out earlier",
    })
  }

  const proseHits = records.prose.reduce((sum, p) => sum + p.hits, 0)
  if (proseHits > 0) {
    const top = records.prose
      .slice()
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3)
      .map((p) => `${p.file} (${p.hits})`)
      .join(", ")
    out.push({
      severity: "info",
      kind: "prose",
      name: top,
      slice,
      detail:
        `${proseHits} mention(s) in features/ and docs/ — an id promised in prose is taken even ` +
        "without a ref (PROJ-159 was referenced 37 times and reported free, PROJ-163)",
    })
  }

  return out
}
