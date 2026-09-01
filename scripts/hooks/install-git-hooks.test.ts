import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

const INSTALLER = resolve(__dirname, "install-git-hooks.mjs")
const GUARD = resolve(__dirname, "ref-transaction-guard.mjs")
const CLI = resolve(__dirname, "..", "check-branch-collision")

let repo = ""

function run(args: string[] = []) {
  return execFileSync("node", [INSTALLER, ...args], { cwd: repo, encoding: "utf8" })
}

function hookPath() {
  return join(repo, ".git", "hooks", "reference-transaction")
}

beforeEach(() => {
  // A throwaway repository: the installer writes into .git/hooks, so it must never run against the
  // real one from a test.
  repo = mkdtempSync(join(tmpdir(), "hooks-install-"))
  execFileSync("git", ["init", "--quiet", repo])
  // The installer copies the guard out of the checkout it is invoked from, so mirror that layout.
  execFileSync("mkdir", ["-p", join(repo, "scripts", "hooks")])
  execFileSync("mkdir", ["-p", join(repo, "scripts", "check-branch-collision")])
  writeFileSync(join(repo, "scripts", "hooks", "ref-transaction-guard.mjs"), readFileSync(GUARD))
  for (const f of ["index.ts", "analyze.ts"]) {
    writeFileSync(join(repo, "scripts", "check-branch-collision", f), readFileSync(join(CLI, f)))
  }
})

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

describe("install-git-hooks", () => {
  it("installs a copy, not a link into the working tree", () => {
    // The link form reintroduced the very dependency option (c) exists to escape: a branch switch in
    // the checkout would silence the hook, and fail-open means silently.
    run()
    const installed = readFileSync(hookPath(), "utf8")

    expect(installed).toContain("branchesBeingCreated")
    expect(installed).not.toContain(join(repo, "scripts", "hooks", "ref-transaction-guard.mjs"))
  })

  it("recognises its own hook and can remove it", () => {
    // Regression: an earlier version emitted a marker that differed from the one it searched for, so
    // `--uninstall` called its own hook foreign and refused. That left a repo-wide guard installed
    // with no supported way to remove it.
    run()
    expect(existsSync(hookPath())).toBe(true)

    const out = run(["--uninstall"])

    expect(out).toContain("removed")
    expect(existsSync(hookPath())).toBe(false)
  })

  it("survives install → uninstall → install", () => {
    run()
    run(["--uninstall"])
    run()
    expect(existsSync(hookPath())).toBe(true)
  })

  it("refuses to touch a hook it did not write", () => {
    writeFileSync(hookPath(), "#!/bin/sh\n# somebody else's hook\nexit 0\n")

    let failed = false
    try {
      run()
    } catch {
      failed = true
    }

    expect(failed).toBe(true)
    // And it left the foreign hook alone.
    expect(readFileSync(hookPath(), "utf8")).toContain("somebody else's hook")
  })

  it("copies the collision CLI next to the hook", () => {
    // This is what closes D-Y150d.7: with the CLI beside the hook, the decision no longer reaches
    // into the working tree, so a checkout parked on an older branch cannot silence it.
    run()

    for (const f of ["index.ts", "analyze.ts"]) {
      expect(existsSync(join(repo, ".git", "hooks", "collision", f))).toBe(true)
    }
  })

  it("copies the CLI verbatim — it must not become a second implementation", () => {
    // The hook and `npm run check:branch-collision` must never disagree about whether a slice is
    // claimed. A copy of the one source cannot drift in judgement; a reimplementation would.
    run()

    for (const f of ["index.ts", "analyze.ts"]) {
      expect(readFileSync(join(repo, ".git", "hooks", "collision", f), "utf8")).toBe(
        readFileSync(join(CLI, f), "utf8")
      )
    }
  })

  it("removes the copied CLI on uninstall", () => {
    run()
    run(["--uninstall"])

    expect(existsSync(join(repo, ".git", "hooks", "collision"))).toBe(false)
  })

  it("reports nothing to remove when no hook is installed", () => {
    expect(run(["--uninstall"])).toContain("nothing to remove")
  })
})
