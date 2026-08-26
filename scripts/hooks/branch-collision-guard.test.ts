import { describe, expect, it } from "vitest"

// The hook is plain ESM JavaScript on purpose: it must start in milliseconds on every `git *` call,
// so it carries no tsx/TypeScript startup cost. TypeScript resolves the .mjs import without help.
import { detectBranchCreation, splitSegments, tokenize } from "./branch-collision-guard.mjs"

describe("splitSegments", () => {
  it("splits on shell operators", () => {
    expect(splitSegments("cd /tmp && git status")).toEqual(["cd /tmp", "git status"])
    expect(splitSegments("a; b | c")).toEqual(["a", "b", "c"])
  })

  it("does not split inside quotes", () => {
    expect(splitSegments("git log --grep='a && b'")).toEqual(["git log --grep='a && b'"])
  })
})

describe("tokenize", () => {
  it("keeps quoted values as one token and strips the quotes", () => {
    expect(tokenize(`git branch "my branch"`)).toEqual(["git", "branch", "my branch"])
  })

  it("preserves an empty quoted argument", () => {
    expect(tokenize(`git branch ""`)).toEqual(["git", "branch", ""])
  })
})

describe("detectBranchCreation — recognises creation", () => {
  it.each([
    ["git checkout -b proj-150/x", "proj-150/x"],
    ["git checkout -B proj-150/x", "proj-150/x"],
    ["git switch -c proj-150/x", "proj-150/x"],
    ["git switch --create proj-150/x", "proj-150/x"],
    ["git worktree add -b proj-150/x /tmp/wt origin/main", "proj-150/x"],
    ["git branch proj-150/x", "proj-150/x"],
    ["git branch proj-150/x origin/main", "proj-150/x"],
    // The command shape that actually caused the PROJ-Y-45p collision.
    ["git worktree add ../pv3 -b proj-y-45p/quota-decrement", "proj-y-45p/quota-decrement"],
  ])("%s", (command, expected) => {
    expect(detectBranchCreation(command)).toBe(expected)
  })

  it("finds a creation after other commands", () => {
    expect(detectBranchCreation("cd /tmp/x && git fetch && git checkout -b proj-150/y")).toBe("proj-150/y")
  })

  it("looks past git's own global options", () => {
    expect(detectBranchCreation("git -C /tmp/repo checkout -b proj-150/z")).toBe("proj-150/z")
    expect(detectBranchCreation("git --no-pager branch proj-150/z")).toBe("proj-150/z")
  })

  it("ignores a leading env assignment", () => {
    expect(detectBranchCreation("GIT_EDITOR=true git checkout -b proj-150/w")).toBe("proj-150/w")
  })
})

describe("detectBranchCreation — stays silent", () => {
  it.each([
    // Switching, listing, deleting, moving: blocking these would break ordinary work and the hook
    // would be turned off within a day.
    "git status",
    "git checkout main",
    "git switch proj-y-45p/quota-fix",
    "git branch",
    "git branch -a",
    "git branch --list proj-130",
    "git branch -D proj-150/old",
    "git branch -m old new",
    "git branch --show-current",
    "git branch -vv",
    "git rebase origin/main",
    "git worktree list",
    // No create flag: this checks out an EXISTING branch, it does not make one.
    "git worktree add /tmp/wt origin/main",
    "git worktree add --detach /tmp/wt origin/main",
    "git worktree remove /tmp/wt",
    // A branch name inside a quoted argument is not a command.
    "git log --oneline --grep='checkout -b proj-y-45p/x'",
    "echo 'git checkout -b proj-150/fake'",
    // Not git at all.
    "npm run check:branch-collision -- PROJ-150",
    "",
  ])("%s", (command) => {
    expect(detectBranchCreation(command)).toBeNull()
  })

  it("returns null for a create flag with no value", () => {
    expect(detectBranchCreation("git checkout -b")).toBeNull()
    expect(detectBranchCreation("git checkout -b --track")).toBeNull()
  })

  it("returns null for non-string input", () => {
    expect(detectBranchCreation(undefined)).toBeNull()
    expect(detectBranchCreation(null)).toBeNull()
    expect(detectBranchCreation(42)).toBeNull()
  })

  it("does not read `git switch -c` semantics into `git branch -c`", () => {
    // On `git branch`, -c means --copy, not --create.
    expect(detectBranchCreation("git branch -c old new")).toBeNull()
  })
})
