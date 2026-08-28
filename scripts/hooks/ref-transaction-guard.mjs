#!/usr/bin/env node
/**
 * git `reference-transaction` hook: the branch-collision guard at the git layer.
 *
 * Why this exists (PROJ-Y-150b, option c). The PreToolUse hook from PROJ-Y-150a is read out of the
 * working tree and loaded by a session, and it is subject to the permission allow list. All three
 * proved to be real gaps, measured:
 *
 *   1. the working tree must carry a current `.claude/settings.json` — and the primary checkout here
 *      rotates through other lanes' feature branches (three different states inside two hours),
 *   2. the running session must have loaded it — a `git checkout` swaps the file without waking the
 *      settings watcher,
 *   3. the verdict must survive the allow list — `.claude/settings.local.json` carries `Bash(git *)`,
 *      which swallowed the original `ask` entirely (fixed in PROJ-Y-150c by moving to `deny`).
 *
 * A git hook hangs on none of the three: it lives in the shared `.git/hooks` (this repo sets
 * `core.hooksPath` to exactly that, so every worktree is covered at once), it is invoked by git
 * rather than by a session, and it also covers `git` typed by a human outside Claude Code.
 *
 * It is also strictly more reliable than the command-parsing approach, because there is nothing to
 * parse: git hands over the refs. The documented limitation D-Y150a.3 — `git checkout -b "$(cat f)"`
 * slipping through because a shell substitution cannot be resolved statically — does not exist here.
 *
 * DANGER, and why this file is defensive to the point of paranoia: `reference-transaction` fires on
 * EVERY reference update in the repository — every commit, fetch, rebase, reset, tag, stash. A
 * non-zero exit in the `prepared` phase aborts the transaction. A bug here does not annoy one
 * session, it breaks git for everyone on this machine. Therefore:
 *
 *   - Every failure path exits 0. Unreadable stdin, a missing guard, a crashing child, a malformed
 *     line: all mean "allow". The hook may only ever refuse something it positively identified.
 *   - It reacts to `prepared` only. In every other phase git ignores the exit code anyway, so doing
 *     work there would be cost without effect.
 *   - It reacts to `refs/heads/` only. Remote-tracking refs, tags, notes, stash and the rewritten
 *     refs of a rebase are none of its business.
 *   - All-zeroes on the old value is NOT taken as "created". Git's own documentation points out that
 *     a force update looks identical, and says how to tell them apart: ask `git rev-parse` for the
 *     current value. In `prepared` the refs are locked but not yet written, so an existing ref still
 *     resolves — which makes it an update, not a creation.
 *   - Recursion is impossible: the guard it calls only reads refs, and an env marker stops a second
 *     level regardless.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ZERO = /^0{40,64}$/
const RECURSION_MARKER = "BRANCH_COLLISION_GUARD_IN_HOOK"

/** One parsed line of the transaction. */
export function parseTransactionLines(text) {
  if (typeof text !== "string") return []
  const out = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length < 3) continue
    const [oldValue, newValue, ...rest] = parts
    out.push({ oldValue, newValue, ref: rest.join(" ") })
  }
  return out
}

/**
 * Branch refs this transaction would create.
 *
 * `refExists` is injected so the rule is testable without a repository: it answers "does this ref
 * already resolve?", which is what separates a creation from a force update.
 */
export function branchesBeingCreated(entries, refExists) {
  const names = []
  for (const { oldValue, ref } of entries) {
    if (!ref.startsWith("refs/heads/")) continue
    if (!ZERO.test(oldValue)) continue
    if (refExists(ref)) continue // force update of an existing branch, not a creation
    names.push(ref.slice("refs/heads/".length))
  }
  return [...new Set(names)]
}

/**
 * Locates the collision CLI, preferring the copy the installer placed next to this hook.
 *
 * This is what closes D-Y150d.7. The hook used to reach into the working tree for the decision, so a
 * checkout parked on a branch that predates the guard silenced it — the same dependency option (c)
 * was built to escape, surviving one level down. The installer now copies the CLI into `.git/hooks`
 * alongside this file, and that copy wins.
 *
 * Note what is NOT duplicated: the slice-id logic still exists exactly once in the repository. The
 * installed files are copies of that one source, not a second implementation — so the hook and
 * `npm run check:branch-collision` cannot drift in their judgement, which a reimplementation would
 * have risked. Re-run the installer after changing the guard; a stale copy still guards, and the
 * installer test executes the installed artifact rather than trusting it.
 *
 * Residual requirement, named: `npx tsx` still needs `node_modules`. That directory is gitignored
 * and therefore does NOT change with the branch, which is precisely why it is not the dependency
 * this fixes. If it is missing entirely, the hook exits 0 like every other failure path.
 */
function resolveGuard(root) {
  const installed = join(dirname(fileURLToPath(import.meta.url)), "collision", "index.ts")
  if (existsSync(installed)) return installed
  const inTree = join(root, "scripts", "check-branch-collision", "index.ts")
  return existsSync(inTree) ? inTree : null
}

/** Repo root from this file's own location — independent of cwd, of env vars, and of the hook shim. */
function repoRoot() {
  return resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
}

function refExistsIn(root) {
  return (ref) => {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
        cwd: root,
        stdio: ["ignore", "ignore", "ignore"],
      })
      return true
    } catch {
      return false
    }
  }
}

export function buildRefusalText(claims) {
  const lines = [
    "",
    "  PROJ-150 branch-collision guard — refusing to create this branch:",
    "",
  ]
  for (const { branch, detail } of claims) {
    lines.push(`    ${branch}`)
    for (const d of detail) lines.push(`      · ${d}`)
  }
  lines.push(
    "",
    "  The slice already looks claimed. Talk to the other lane before opening a second",
    "  branch — two sessions built PROJ-Y-45p in parallel on 2026-08-26 and pushed rival",
    "  migrations to production 27 seconds apart.",
    ""
  )
  return lines.join("\n")
}

function main(argv) {
  // Only `prepared` can abort a transaction; in every other phase git ignores the exit code.
  if (argv[0] !== "prepared") return 0
  if (process.env.BRANCH_COLLISION_GUARD === "off") return 0
  if (process.env[RECURSION_MARKER] === "1") return 0

  let entries
  try {
    entries = parseTransactionLines(readFileSync(0, "utf8"))
  } catch {
    return 0
  }
  if (entries.length === 0) return 0

  const root = repoRoot()
  let created
  try {
    created = branchesBeingCreated(entries, refExistsIn(root))
  } catch {
    return 0
  }
  if (created.length === 0) return 0

  const guard = resolveGuard(root)
  if (!guard) return 0

  const claims = []
  for (const branch of created) {
    let run
    try {
      run = spawnSync("npx", ["tsx", guard, branch], {
        cwd: root,
        encoding: "utf8",
        timeout: 25_000,
        env: { ...process.env, [RECURSION_MARKER]: "1" },
      })
    } catch {
      return 0 // cannot answer → allow
    }
    if (run.status !== 1) continue // 2 = no slice id, anything else = could not answer
    const detail = String(run.stderr || "")
      .split("\n")
      .filter((l) => l.includes("::error::"))
      .map((l) => l.replace("::error::", "").trim())
    claims.push({ branch, detail })
  }

  if (claims.length === 0) return 0

  process.stderr.write(buildRefusalText(claims))
  return 1
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) process.exit(main(process.argv.slice(2)))
