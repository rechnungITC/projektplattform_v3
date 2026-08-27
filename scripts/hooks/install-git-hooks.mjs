#!/usr/bin/env node
/**
 * Installs (or removes) the `reference-transaction` hook from PROJ-Y-150d.
 *
 * `.git/hooks` is not version controlled, so the hook cannot ship with a merge — that is the price of
 * option (c) and the reason this installer exists. It writes a shim carrying the ABSOLUTE path of the
 * repo script, resolved now, so the hook keeps working from every worktree and from any cwd.
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

const MARKER = "# PROJ-Y-150d branch-collision guard"
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

function shimFor(target) {
  return `#!/bin/sh
${MARKER} — installed by npm run hooks:install, remove with npm run hooks:uninstall.
# Absolute path so the hook works from every worktree. Never fails the transaction on its own:
# if node or the script is gone, exit 0 = allow.
[ -x "${target}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
exec node "${target}" "$@"
`
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
  writeFileSync(path, shimFor(target))
  chmodSync(path, 0o755)
  process.stdout.write(
    `hooks: installed ${HOOK} at ${path}\n` +
      `       -> ${target}\n` +
      "       Covers every worktree of this repo, and git typed by hand.\n" +
      "       Refuses to CREATE a branch whose slice is already claimed; switching, listing,\n" +
      "       deleting, committing, fetching and rebasing are untouched.\n" +
      "       Override once: BRANCH_COLLISION_GUARD=off git checkout -b <name>\n" +
      "       Remove: npm run hooks:uninstall\n"
  )
  return 0
}

process.exit(main(process.argv.slice(2)))
