/**
 * CLI wrapper for the branch-collision guard. See ./analyze.ts for the rules and why they exist.
 *
 * Usage:  npm run check:branch-collision -- PROJ-Y-45p
 *
 * Read-only queries against git and two tracked files — no network, no DB, no secrets. Run it
 * BEFORE opening a branch or worktree for a slice.
 *
 * It answers TWO questions, and PROJ-175 exists because they used to be conflated:
 *   1. Is anybody holding this slice right now?  -> live refs, decides the exit code.
 *   2. Does this id already denote something?    -> written records, reported only.
 *
 * On 2026-09-04 it said `free` about PROJ-171 two hours after PR #548 had consumed the id: the
 * merge had deleted the branch, so no ref remained. Question 2 is what catches that.
 *
 * Deliberately not a CI check. Measured on 2026-08-26: the repo carries 27 unmerged remote branches,
 * of which roughly six groups share a slice id purely as months-old debris (`proj-34` alone has
 * four). A required check over that set would fail on day one and stay red, which is how a gate
 * becomes decoration — the exact failure PROJ-147 was opened to fix. The collision also has to be
 * caught BEFORE the work happens; by PR time both branches already exist and the duplication is
 * already paid for.
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  analyzeCollision,
  analyzeRecordClaims,
  canonicalizeSliceId,
  fileNameIdPattern,
  recordIdPattern,
  type RecordInput,
  type RefInput,
} from "./analyze"

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  } catch {
    // A failing query degrades the scan rather than killing it: a guard that cannot answer must not
    // block work it knows nothing about.
    return ""
  }
}

/** Absolute path of the checkout the guard is being run from. */
function selfWorktree(): string {
  return git(["rev-parse", "--show-toplevel"]).trim()
}

/** Branches checked out anywhere in this repo — the strongest live-claim signal. */
function collectWorktrees(self: string): RefInput[] {
  const out: RefInput[] = []
  let currentPath = ""
  for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length).trim()
    if (line.startsWith("branch ")) {
      out.push({
        kind: "worktree",
        name: line.slice("branch ".length).replace("refs/heads/", "").trim(),
        worktreePath: currentPath,
        isSelf: self !== "" && currentPath === self,
      })
    }
  }
  return out
}

function collectRefs(namespace: string, kind: "branch-local" | "branch-remote", merged: Set<string>): RefInput[] {
  const raw = git(["for-each-ref", "--format=%(refname:short)%09%(committerdate:iso-strict)", namespace])
  const out: RefInput[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    const [nameRaw, date] = line.split("\t")
    const name = nameRaw.replace(/^origin\//, "")
    if (name === "main" || name === "HEAD") continue
    out.push({ kind, name, tipIsoDate: date, mergedIntoMain: merged.has(name) })
  }
  return out
}

/** One `--merged` query per namespace instead of an ancestry check per ref. */
function collectMerged(args: string[]): Set<string> {
  const set = new Set<string>()
  for (const line of git(args).split("\n")) {
    const name = line.replace(/^[*+]?\s*/, "").replace(/^origin\//, "").trim()
    if (name && !name.startsWith("(")) set.add(name)
  }
  return set
}

function collectTags(): RefInput[] {
  // PROJ-Y-151c — a tag now needs a date and a reachability flag, not just a name.
  //
  // `creatordate` is the one field that answers for BOTH tag shapes: annotated tags carry their own
  // tagger date, lightweight ones fall through to the commit date. `taggerdate` would be empty for
  // every lightweight tag and quietly make it look infinitely old — which is the safe direction,
  // but it would also make the exemption untestable against this repo's real corpus.
  const reachable = new Set(
    git(["tag", "--merged", "HEAD"])
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
  )
  const out: RefInput[] = []
  for (const line of git(["for-each-ref", "--format=%(refname:short)%09%(creatordate:iso-strict)", "refs/tags"]).split("\n")) {
    const [name, date] = line.split("\t")
    const clean = (name ?? "").trim()
    if (!clean) continue
    out.push({
      kind: "tag",
      name: clean,
      tipIsoDate: (date ?? "").trim() || undefined,
      reachableFromHead: reachable.has(clean),
    })
  }
  return out
}

/**
 * Reads the written records that claim an id. Fail-open throughout: a source that cannot be read
 * degrades the report, because a guard that cannot answer must not block work it knows nothing
 * about (same rule as `git()` above).
 */
function collectRecords(repoRoot: string, requested: string): RecordInput {
  const empty: RecordInput = { indexRowLines: [], specFiles: [], nextAvailableId: null, prose: [] }
  if (repoRoot === "") return empty

  // `requested` is whatever the caller typed (`PROJ-171`, a branch name, …); recordIdPattern
  // needs the canonical form. Getting this wrong is invisible: the throw lands in the fail-open
  // branch and the report simply says "nothing found".
  const canonical = canonicalizeSliceId(requested)
  if (!canonical) return empty
  let pattern: RegExp
  try {
    pattern = recordIdPattern(canonical)
  } catch {
    return empty
  }
  const hits = (text: string): number => (text.match(new RegExp(pattern.source, "gi")) ?? []).length

  const indexPath = join(repoRoot, "features", "INDEX.md")
  const indexRowLines: number[] = []
  let nextAvailableId: string | null = null
  const skipLines = new Set<number>()
  let indexText = ""
  try {
    indexText = readFileSync(indexPath, "utf8")
  } catch {
    indexText = ""
  }
  indexText.split("\n").forEach((line, i) => {
    const lineNo = i + 1
    if (/^##\s*Next Available ID/i.test(line)) {
      nextAvailableId = line.replace(/^##\s*Next Available ID:?\s*/i, "").trim()
      // The pointer names an id by definition; counting it as prose would make every fresh id
      // look claimed.
      skipLines.add(lineNo)
      return
    }
    // Only the FIRST cell counts as a row for this id — a mention deeper in the prose of some
    // other row is prose, not a row.
    const firstCell = /^\|([^|]*)\|/.exec(line)
    if (firstCell && hits(firstCell[1]) > 0) {
      indexRowLines.push(lineNo)
      skipLines.add(lineNo)
    }
  })

  let specFiles: string[] = []
  try {
    const filePattern = fileNameIdPattern(canonical)
    specFiles = readdirSync(join(repoRoot, "features")).filter((f) =>
      f.endsWith(".md") ? filePattern.test(f.replace(/\.md$/, "")) : false
    )
  } catch {
    specFiles = []
  }

  const prose: { file: string; hits: number }[] = []
  const walk = (dir: string, rel: string): void => {
    let entries
    try {
      entries = readdirSync(join(repoRoot, dir), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const childRel = rel === "" ? e.name : `${rel}/${e.name}`
      if (e.isDirectory()) {
        walk(join(dir, e.name), childRel)
        continue
      }
      if (!e.name.endsWith(".md")) continue
      const full = join(repoRoot, dir, e.name)
      let text = ""
      try {
        text = readFileSync(full, "utf8")
      } catch {
        continue
      }
      const isIndex = full === indexPath
      let n = 0
      text.split("\n").forEach((line, i) => {
        if (isIndex && skipLines.has(i + 1)) return
        n += hits(line)
      })
      if (n > 0) prose.push({ file: childRel, hits: n })
    }
  }
  walk("features", "features")
  walk("docs", "docs")

  return { indexRowLines, specFiles, nextAvailableId, prose }
}

function main(argv: string[]): number {
  const requested = argv[0]
  if (!requested) {
    process.stderr.write(
      "branch-collision: pass the slice you are about to start.\n" +
        "  npm run check:branch-collision -- PROJ-Y-45p\n"
    )
    return 2
  }

  const localMerged = collectMerged(["branch", "--merged", "origin/main", "--format=%(refname:short)"])
  const remoteMerged = collectMerged(["branch", "-r", "--merged", "origin/main", "--format=%(refname:short)"])

  const repoRoot = selfWorktree()

  const refs: RefInput[] = [
    ...collectWorktrees(repoRoot),
    ...collectRefs("refs/heads", "branch-local", localMerged),
    ...collectRefs("refs/remotes/origin", "branch-remote", remoteMerged),
    ...collectTags(),
  ]

  const records = collectRecords(repoRoot, requested)

  let analysis
  try {
    analysis = analyzeCollision(requested, refs, new Date().toISOString())
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 2
  }

  const { slice, findings, related, blocked } = analysis

  for (const f of findings) {
    const line = `${slice}: ${f.kind} "${f.name}" — ${f.detail}`
    if (f.severity === "block") process.stderr.write(`::error::${line}\n`)
    else if (f.severity === "warn") process.stdout.write(`::warning::${line}\n`)
    else process.stdout.write(`  info: ${line}\n`)
  }

  if (related.length > 0) {
    process.stdout.write(`\n  sibling slices of the same feature (context, never blocking):\n`)
    for (const r of related.slice(0, 10)) {
      process.stdout.write(`    ${r.name} — ${r.detail}\n`)
    }
    if (related.length > 10) process.stdout.write(`    … and ${related.length - 10} more\n`)
  }

  const recordFindings = analyzeRecordClaims(slice, records)
  if (recordFindings.length > 0) {
    process.stdout.write(`\n  this id is already written down (never blocking — see analyze.ts):\n`)
    for (const r of recordFindings) {
      process.stdout.write(`    ${r.kind}: ${r.name} — ${r.detail}\n`)
    }
  }

  const blocks = findings.filter((f) => f.severity === "block").length
  const warns = findings.filter((f) => f.severity === "warn").length
  process.stdout.write(
    `\nbranch-collision: ${slice} — scanned ${refs.length} ref(s); ` +
      `${blocks} blocking, ${warns} warning(s), ${findings.length - blocks - warns} informational.\n`
  )

  if (blocked) {
    process.stderr.write(
      "branch-collision: CLAIMED — do not start a second branch for this slice. A commit-free " +
        "branch is invisible to `git log` and `gh pr list` and still means the work is taken " +
        "(PROJ-Y-45p, 2026-08-26). See CLAUDE.md (Parallel Sessions).\n"
    )
    return 1
  }
  if (recordFindings.length > 0) {
    // The load-bearing change of PROJ-175. The old sentence — "free — nobody is holding this
    // slice" — was true about refs and read as "the id is available", which is what nearly caused
    // a fourth double assignment after PROJ-Y-1, PROJ-Y-151d and PROJ-145.
    const where = recordFindings.map((r) => r.kind).join(", ")
    process.stdout.write(
      `branch-collision: NOT free — no live claim, but this id is already documented (${where}). ` +
        "Nobody is holding it, and it is not available for a new slice: pick the id behind " +
        "`Next Available ID` in features/INDEX.md.\n"
    )
    return 0
  }
  process.stdout.write(
    "branch-collision: free — nobody is holding this slice, and no record claims the id.\n"
  )
  return 0
}

process.exit(main(process.argv.slice(2)))
