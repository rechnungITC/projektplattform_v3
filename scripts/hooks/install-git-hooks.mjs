#!/usr/bin/env node
/**
 * Installs (or removes) the `reference-transaction` hook from PROJ-Y-150d.
 *
 * `.git/hooks` is not version controlled, so the hook cannot ship with a merge — that is the price of
 * option (c) and the reason this installer exists.
 *
 * It COPIES the guard into `.git/hooks` rather than pointing at the working tree. The first version
 * wrote a shim with the absolute path of the repo script, which reintroduced exactly the dependency
 * option (c) was built to escape: the primary checkout here rotates through other lanes' feature
 * branches, and on a branch that predates the script the shim would find nothing and — being
 * fail-open by construction — exit 0 silently. A copy in `.git/hooks` is immune to branch switching.
 *
 * The copy freezes at install time, so re-run this after pulling a change to the guard. That is the
 * lesser evil: a stale guard still guards, a missing one does not.
 *
 * Residual dependency, named rather than hidden: deciding whether a slice is CLAIMED still runs
 * `scripts/check-branch-collision` out of the working tree, because that is the single source of
 * truth for slice-id matching. If the checkout lacks it, the hook exits 0. Removing that last link
 * would mean duplicating the id logic — a second source of truth, which PROJ-150 deliberately
 * avoided.
 *
 *   npm run hooks:install     install, or report that it is already installed
 *   npm run hooks:uninstall   remove it again
 *
 * Refuses to touch a foreign hook. A `reference-transaction` hook that this installer did not write
 * belongs to something else, and clobbering it could silently disable another tool's safeguard.
 */
import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Recognition string. Deliberately WITHOUT a comment prefix: it is emitted into the installed file and
 * searched for again on uninstall, so both must be the same literal. An earlier version prefixed it
 * with "# " and stripped that on write — the installer then no longer recognised its own hook and
 * refused to remove it, which would have left a repo-wide guard that cannot be uninstalled.
 */
const MARKER = "PROJ-Y-150d branch-collision guard"
const HOOK = "reference-transaction"

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

/** Where git actually looks for hooks — `core.hooksPath` wins over the common dir when set. */
function hooksDir() {
  let configured = ""
  try {
    configured = git(["config", "--get", "core.hooksPath"])
  } catch {
    configured = ""
  }
  if (configured) return resolve(configured)
  return resolve(join(git(["rev-parse", "--git-common-dir"]), "hooks"))
}

/** The installed hook: a copy of the guard, prefixed so `--uninstall` can recognise its own work. */
function hookContentFrom(sourcePath) {
  const guard = readFileSync(sourcePath, "utf8")
  const header = `#!/usr/bin/env node
// ${MARKER} — installed by npm run hooks:install, remove with npm run hooks:uninstall.
// This is a COPY, not a link: it must survive the primary checkout switching to a branch that does
// not carry the script. Re-run the installer after pulling a change to the guard.
`
  // Drop the source's own shebang; the header carries one.
  return header + guard.replace(/^#!.*\n/, "")
}

function main(argv) {
  const remove = argv.includes("--uninstall")
  const dir = hooksDir()
  const path = join(dir, HOOK)
  const target = resolve(join(dirname(fileURLToPath(import.meta.url)), "ref-transaction-guard.mjs"))

  const existing = existsSync(path) ? readFileSync(path, "utf8") : null
  const isOurs = existing !== null && existing.includes(MARKER)

  if (existing !== null && !isOurs) {
    process.stderr.write(
      `hooks: ${path} exists and was not written by this installer.\n` +
        "Refusing to touch it — a foreign reference-transaction hook belongs to something else.\n" +
        "Inspect it, then merge the two by hand if you want both.\n"
    )
    return 1
  }

  if (remove) {
    if (!isOurs) {
      process.stdout.write(`hooks: nothing to remove at ${path}.\n`)
      return 0
    }
    rmSync(path)
    process.stdout.write(`hooks: removed ${path}.\n`)
    return 0
  }

  if (!existsSync(target)) {
    process.stderr.write(`hooks: ${target} not found — wrong checkout?\n`)
    return 1
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(path, hookContentFrom(target))
  chmodSync(path, 0o755)
  process.stdout.write(
    `hooks: installed ${HOOK} at ${path}\n` +
      `       copied from ${target} (a copy, so a branch switch cannot silence it)\n` +
      "       Covers every worktree of this repo, and git typed by hand.\n" +
      "       Refuses to CREATE a branch whose slice is already claimed; switching, listing,\n" +
      "       deleting, committing, fetching and rebasing are untouched.\n" +
      "       Override once: BRANCH_COLLISION_GUARD=off git checkout -b <name>\n" +
      "       Remove: npm run hooks:uninstall\n"
  )
  return 0
}

process.exit(main(process.argv.slice(2)))
