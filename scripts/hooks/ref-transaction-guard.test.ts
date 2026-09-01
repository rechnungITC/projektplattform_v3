import { describe, expect, it } from "vitest"

// Plain ESM on purpose: a git hook runs on every reference transaction in the repository, so it must
// start in milliseconds and carry no tsx/TypeScript startup cost.
import {
  branchesBeingCreated,
  buildRefusalText,
  parseTransactionLines,
} from "./ref-transaction-guard.mjs"

const ZERO = "0".repeat(40)
const SHA = "a".repeat(40)
const never = () => false
const always = () => true

describe("parseTransactionLines", () => {
  it("parses git's `<old> SP <new> SP <ref>` format", () => {
    expect(parseTransactionLines(`${ZERO} ${SHA} refs/heads/proj-150/x\n`)).toEqual([
      { oldValue: ZERO, newValue: SHA, ref: "refs/heads/proj-150/x" },
    ])
  })

  it("handles several updates in one transaction", () => {
    const text = `${ZERO} ${SHA} refs/heads/a\n${SHA} ${ZERO} refs/heads/b\n`
    expect(parseTransactionLines(text)).toHaveLength(2)
  })

  it("ignores blank and malformed lines instead of throwing", () => {
    expect(parseTransactionLines(`\n\nnonsense\n${ZERO} ${SHA} refs/heads/x\n`)).toHaveLength(1)
    expect(parseTransactionLines("")).toEqual([])
    expect(parseTransactionLines(undefined as unknown as string)).toEqual([])
  })
})

describe("branchesBeingCreated", () => {
  it("reports a genuine creation", () => {
    const e = parseTransactionLines(`${ZERO} ${SHA} refs/heads/proj-150/x`)
    expect(branchesBeingCreated(e, never)).toEqual(["proj-150/x"])
  })

  it("does NOT treat a force update as a creation", () => {
    // The subtle one, and it comes from git's own documentation: on a force update the old value is
    // all-zeroes too. Only `git rev-parse` tells them apart — in the `prepared` phase the refs are
    // locked but not yet written, so an existing ref still resolves. Without this, `git checkout -B`
    // on an existing branch and a force-push would both be misread as new work.
    const e = parseTransactionLines(`${ZERO} ${SHA} refs/heads/proj-150/x`)
    expect(branchesBeingCreated(e, always)).toEqual([])
  })

  it("ignores an ordinary update (old value is a real sha)", () => {
    const e = parseTransactionLines(`${SHA} ${"b".repeat(40)} refs/heads/main`)
    expect(branchesBeingCreated(e, never)).toEqual([])
  })

  it("ignores a deletion", () => {
    const e = parseTransactionLines(`${SHA} ${ZERO} refs/heads/proj-150/x`)
    expect(branchesBeingCreated(e, never)).toEqual([])
  })

  it.each([
    "refs/tags/v2.78.0-PROJ-Y-150a",
    "refs/remotes/origin/proj-150/x",
    "refs/stash",
    "refs/notes/commits",
    "HEAD",
    "ORIG_HEAD",
  ])("ignores %s — only refs/heads/ is this hook's business", (ref) => {
    const e = parseTransactionLines(`${ZERO} ${SHA} ${ref}`)
    expect(branchesBeingCreated(e, never)).toEqual([])
  })

  it("survives a large fetch transaction without reporting anything", () => {
    // A fetch can carry thousands of remote-tracking refs in one transaction.
    const text = Array.from({ length: 2000 }, (_, i) => `${ZERO} ${SHA} refs/remotes/origin/b${i}`).join("\n")
    expect(branchesBeingCreated(parseTransactionLines(text), never)).toEqual([])
  })

  it("accepts sha256 object names", () => {
    const z = "0".repeat(64)
    const e = parseTransactionLines(`${z} ${"c".repeat(64)} refs/heads/proj-150/x`)
    expect(branchesBeingCreated(e, never)).toEqual(["proj-150/x"])
  })

  it("deduplicates", () => {
    const text = `${ZERO} ${SHA} refs/heads/proj-150/x\n${ZERO} ${SHA} refs/heads/proj-150/x`
    expect(branchesBeingCreated(parseTransactionLines(text), never)).toEqual(["proj-150/x"])
  })
})

describe("buildRefusalText", () => {
  it("names every claimed branch and its detail", () => {
    const t = buildRefusalText([{ branch: "proj-y-45p/x", detail: ["worktree /tmp/pv3-y45p", "tag v2.75.0"] }])
    expect(t).toContain("proj-y-45p/x")
    expect(t).toContain("worktree /tmp/pv3-y45p")
    expect(t).toContain("tag v2.75.0")
  })

  it("does not put the override switch in the refusal text", () => {
    // Same reasoning as the PreToolUse hook: the override belongs in CLAUDE.md, not in a message
    // that a model reads on every collision.
    const t = buildRefusalText([{ branch: "b", detail: [] }])
    expect(t).not.toContain("BRANCH_COLLISION_GUARD")
  })
})
