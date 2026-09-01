import { describe, expect, it } from "vitest"

import {
  analyzeCollision,
  canonicalizeSliceId,
  extractSliceIds,
  FRESH_TAG_HOURS,
  RECENT_DAYS,
  relatedKey,
  type RefInput,
} from "./analyze"

const NOW = "2026-08-26T14:00:00Z"

/** PROJ-Y-151c — the tag-freshness window is measured in hours, not days. */
function hoursBefore(nowIso: string, hours: number): string {
  return new Date(Date.parse(nowIso) - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString()
}

describe("canonicalizeSliceId", () => {
  // Every spelling below was taken from the live branch/tag corpus, not invented.
  it.each([
    ["PROJ-Y-45p", "proj-y-45p"],
    ["proj-y-45p", "proj-y-45p"],
    ["projy-145", "proj-y-145"],
    ["projy-122a", "proj-y-122a"],
    ["proj61", "proj-61"],
    ["PROJ-150", "proj-150"],
    ["proj-45-delta", "proj-45-delta"],
    ["PROJ-45-DELTA", "proj-45-delta"],
    ["proj-80-alpha", "proj-80-alpha"],
    ["proj-y-2", "proj-y-2"],
    ["proj-y-130h", "proj-y-130h"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(canonicalizeSliceId(raw)).toBe(expected)
  })

  it("folds the Greek letters the specs are written in", () => {
    expect(canonicalizeSliceId("PROJ-45-δ")).toBe("proj-45-delta")
    expect(canonicalizeSliceId("PROJ-45-ε")).toBe("proj-45-epsilon")
    expect(canonicalizeSliceId("PROJ-70-α")).toBe("proj-70-alpha")
  })

  it("reads the id out of a full branch name", () => {
    expect(canonicalizeSliceId("proj-y-45p/quota-decrement")).toBe("proj-y-45p")
    expect(canonicalizeSliceId("docs/proj-y-143d-spec")).toBe("proj-y-143d")
    expect(canonicalizeSliceId("feat/PROJ-62-organization-wip")).toBe("proj-62")
  })

  it("does not read the version of a tag as a slice", () => {
    expect(canonicalizeSliceId("v2.75.0-PROJ-Y-45p")).toBe("proj-y-45p")
    expect(canonicalizeSliceId("v2.73.0-PROJ-45-delta")).toBe("proj-45-delta")
  })

  it("returns null when there is no id, so non-slice branches stay silent", () => {
    expect(canonicalizeSliceId("main")).toBeNull()
    expect(canonicalizeSliceId("audit/chatbot-command-understanding")).toBeNull()
    expect(canonicalizeSliceId("recover/readme-map")).toBeNull()
  })

  it("keeps PROJ-N and PROJ-Y-N apart", () => {
    // PROJ-130 (the audit trail) and PROJ-Y-130h (a followup) are different units of work.
    expect(canonicalizeSliceId("proj-130")).toBe("proj-130")
    expect(canonicalizeSliceId("proj-y-130")).toBe("proj-y-130")
    expect(canonicalizeSliceId("proj-130")).not.toBe(canonicalizeSliceId("proj-y-130"))
  })

  it("registers only proj-prefixed ids in a multi-slice branch name", () => {
    // Documented miss: the bare numbers after the first id are not slices to this matcher.
    expect(extractSliceIds("fix/proj18-25b-28-36-deferred-qa")).toEqual(["proj-18"])
  })
})

describe("relatedKey", () => {
  it("groups sub-slices and followups of one feature", () => {
    expect(relatedKey("proj-45-delta")).toBe("45")
    expect(relatedKey("proj-y-45p")).toBe("45")
    expect(relatedKey("proj-150")).toBe("150")
  })
})

describe("analyzeCollision", () => {
  it("blocks on the PROJ-Y-45p collision that caused this guard to exist", () => {
    // The state of the repo when the second session looked: the other lane's branch existed with
    // zero commits, was absent from origin, invisible to `gh pr list` — and open in a worktree.
    const refs: RefInput[] = [
      {
        kind: "worktree",
        name: "proj-y-45p/quota-decrement",
        worktreePath: "/tmp/pv3-y45p-other",
      },
    ]
    const result = analyzeCollision("PROJ-Y-45p", refs, NOW)

    expect(result.blocked).toBe(true)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe("block")
    expect(result.findings[0].detail).toContain("/tmp/pv3-y45p-other")
  })

  it("does not block on your own checkout", () => {
    // Otherwise the guard fires every time a session re-runs it mid-slice, and gets tuned out.
    const refs: RefInput[] = [
      { kind: "worktree", name: "proj-150/guard", worktreePath: "/tmp/mine", isSelf: true },
    ]
    const result = analyzeCollision("PROJ-150", refs, NOW)

    expect(result.blocked).toBe(false)
    expect(result.findings[0].severity).toBe("info")
    expect(result.findings[0].detail).toContain("you already hold")
  })

  it("still blocks when the same slice is open in somebody else's checkout", () => {
    const refs: RefInput[] = [
      { kind: "worktree", name: "proj-150/mine", worktreePath: "/tmp/mine", isSelf: true },
      { kind: "worktree", name: "proj-150/theirs", worktreePath: "/tmp/theirs", isSelf: false },
    ]
    const result = analyzeCollision("PROJ-150", refs, NOW)

    expect(result.blocked).toBe(true)
    expect(result.findings[0].name).toBe("proj-150/theirs")
  })

  it("blocks when a tag shows the slice is already deployed", () => {
    const refs: RefInput[] = [{ kind: "tag", name: "v2.75.0-PROJ-Y-45p" }]
    const result = analyzeCollision("PROJ-Y-45p", refs, NOW)

    expect(result.blocked).toBe(true)
    expect(result.findings[0].detail).toContain("already deployed")
  })

  // PROJ-Y-151c — the lane that just shipped a slice must be able to open one more branch.
  //
  // The exemption is deliberately narrow: fresh AND already contained in this HEAD. Each test
  // below removes exactly one half, so a future change cannot widen it by accident.

  it("lets the lane that just shipped a slice follow up on its own tag", () => {
    const refs: RefInput[] = [
      {
        kind: "tag",
        name: "v2.82.0-PROJ-Y-151b",
        tipIsoDate: hoursBefore(NOW, 2),
        reachableFromHead: true,
      },
    ]
    const result = analyzeCollision("PROJ-Y-151b", refs, NOW)

    expect(result.blocked).toBe(false)
    // Still said out loud — the point is not to hide the tag, only to stop refusing.
    expect(result.findings[0].severity).toBe("warn")
    expect(result.findings[0].detail).toContain("you shipped it")
  })

  it("still blocks a fresh tag another lane has not merged into this HEAD", () => {
    const refs: RefInput[] = [
      {
        kind: "tag",
        name: "v2.82.0-PROJ-Y-151b",
        tipIsoDate: hoursBefore(NOW, 2),
        reachableFromHead: false,
      },
    ]
    expect(analyzeCollision("PROJ-Y-151b", refs, NOW).blocked).toBe(true)
  })

  it("still blocks a tag older than the window even when it is in this HEAD", () => {
    const refs: RefInput[] = [
      {
        kind: "tag",
        name: "v2.75.0-PROJ-Y-45p",
        tipIsoDate: hoursBefore(NOW, FRESH_TAG_HOURS + 1),
        reachableFromHead: true,
      },
    ]
    expect(analyzeCollision("PROJ-Y-45p", refs, NOW).blocked).toBe(true)
  })

  it("blocks a dateless tag rather than treating it as fresh", () => {
    // Fail closed: `creatordate` is empty for no tag shape this repo uses, but if it ever were,
    // an unknown age must not buy an exemption.
    const refs: RefInput[] = [
      { kind: "tag", name: "v1.0.0-PROJ-Y-45p", reachableFromHead: true },
    ]
    expect(analyzeCollision("PROJ-Y-45p", refs, NOW).blocked).toBe(true)
  })

  it("stays quiet on the normal case of one lane holding many branches for one slice", () => {
    // Measured from the live repo: proj-130 carries twelve branches, all one lane working
    // sequentially. If this fired, the guard would be noise and would get ignored.
    const refs: RefInput[] = Array.from({ length: 12 }, (_, i) => ({
      kind: "branch-local" as const,
      name: `proj-130/slice-${i}`,
      mergedIntoMain: true,
      tipIsoDate: daysAgo(30 + i),
    }))
    const result = analyzeCollision("PROJ-130", refs, NOW)

    expect(result.blocked).toBe(false)
    expect(result.findings.every((f) => f.severity === "info")).toBe(true)
  })

  it("does not treat sibling sub-slices as the same slice", () => {
    const refs: RefInput[] = [
      { kind: "worktree", name: "proj-45-delta/deploy-closure", worktreePath: "/repo" },
    ]
    const result = analyzeCollision("PROJ-45-epsilon", refs, NOW)

    expect(result.blocked).toBe(false)
    expect(result.findings).toHaveLength(0)
    // …but it is surfaced as context, because they belong to the same feature.
    expect(result.related).toHaveLength(1)
    expect(result.related[0].slice).toBe("proj-45-delta")
  })

  it("warns but does not block on recent unmerged work", () => {
    const refs: RefInput[] = [
      {
        kind: "branch-remote",
        name: "proj-150/branch-collision-guard",
        mergedIntoMain: false,
        tipIsoDate: daysAgo(1),
      },
    ]
    const result = analyzeCollision("PROJ-150", refs, NOW)

    expect(result.blocked).toBe(false)
    expect(result.findings[0].severity).toBe("warn")
  })

  it("demotes stale unmerged branches to debris", () => {
    const refs: RefInput[] = [
      {
        kind: "branch-remote",
        name: "proj-34/gamma1-sentiment-router",
        mergedIntoMain: false,
        tipIsoDate: daysAgo(RECENT_DAYS + 60),
      },
    ]
    const result = analyzeCollision("PROJ-34", refs, NOW)

    expect(result.blocked).toBe(false)
    expect(result.findings[0].severity).toBe("info")
    expect(result.findings[0].detail).toContain("stale")
  })

  it("treats a ref with no tip date as debris rather than as a claim", () => {
    // Fail open on missing metadata: inventing a claim out of an unreadable date would be noise.
    const refs: RefInput[] = [
      { kind: "branch-local", name: "proj-99/whatever", mergedIntoMain: false },
    ]
    const result = analyzeCollision("PROJ-99", refs, NOW)

    expect(result.findings[0].severity).toBe("info")
  })

  it("ignores branches that carry no slice id at all", () => {
    const refs: RefInput[] = [
      { kind: "worktree", name: "main", worktreePath: "/repo" },
      { kind: "worktree", name: "audit/chatbot-command-understanding", worktreePath: "/tmp/x" },
    ]
    const result = analyzeCollision("PROJ-150", refs, NOW)

    expect(result.findings).toHaveLength(0)
    expect(result.related).toHaveLength(0)
    expect(result.blocked).toBe(false)
  })

  it("orders the most severe finding first", () => {
    const refs: RefInput[] = [
      { kind: "branch-local", name: "proj-y-45p/old", mergedIntoMain: true, tipIsoDate: daysAgo(40) },
      { kind: "worktree", name: "proj-y-45p/live", worktreePath: "/tmp/live" },
      { kind: "branch-remote", name: "proj-y-45p/fresh", mergedIntoMain: false, tipIsoDate: daysAgo(1) },
    ]
    const result = analyzeCollision("PROJ-Y-45p", refs, NOW)

    expect(result.findings.map((f) => f.severity)).toEqual(["block", "warn", "info"])
  })

  it("refuses an argument that carries no slice id instead of scanning for nothing", () => {
    expect(() => analyzeCollision("not-a-slice", [], NOW)).toThrow(/no slice id/)
  })
})
