/**
 * CLI wrapper for the branch-collision guard. See ./analyze.ts for the rules and why they exist.
 *
 * Usage:  npm run check:branch-collision -- PROJ-Y-45p
 *
 * Read-only git queries — no network, no DB, no secrets. Run it BEFORE opening a branch or worktree
 * for a slice. It answers one question: is anybody on this slice already?
 *
 * Deliberately not a CI check. Measured on 2026-08-26: the repo carries 27 unmerged remote branches,
 * of which roughly six groups share a slice id purely as months-old debris (`proj-34` alone has
 * four). A required check over that set would fail on day one and stay red, which is how a gate
 * becomes decoration — the exact failure PROJ-147 was opened to fix. The collision also has to be
 * caught BEFORE the work happens; by PR time both branches already exist and the duplication is
 * already paid for.
 */
import { execFileSync } from "node:child_process"

import { analyzeCollision, type RefInput } from "./analyze"

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
  return git(["tag", "--list"])
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ kind: "tag" as const, name }))
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

  const refs: RefInput[] = [
    ...collectWorktrees(selfWorktree()),
    ...collectRefs("refs/heads", "branch-local", localMerged),
    ...collectRefs("refs/remotes/origin", "branch-remote", remoteMerged),
    ...collectTags(),
  ]

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
  process.stdout.write("branch-collision: free — nobody is holding this slice.\n")
  return 0
}

process.exit(main(process.argv.slice(2)))
