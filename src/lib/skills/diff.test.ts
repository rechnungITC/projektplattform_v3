import { describe, expect, it } from "vitest"

import { diffStats, lineDiff } from "./diff"

// PROJ-77-α — dependency-free line diff for the rollback confirm panel.

describe("lineDiff", () => {
  it("marks unchanged lines when identical", () => {
    const d = lineDiff("a\nb\nc", "a\nb\nc")
    expect(d.every((l) => l.op === "unchanged")).toBe(true)
    expect(d).toHaveLength(3)
  })

  it("detects a changed middle line as removed + added", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc")
    expect(d).toEqual([
      { op: "unchanged", value: "a" },
      { op: "removed", value: "b" },
      { op: "added", value: "B" },
      { op: "unchanged", value: "c" },
    ])
  })

  it("handles pure insertion", () => {
    const d = lineDiff("a\nc", "a\nb\nc")
    expect(diffStats(d)).toEqual({ added: 1, removed: 0, unchanged: 2 })
    expect(d.find((l) => l.op === "added")?.value).toBe("b")
  })

  it("handles pure deletion", () => {
    const d = lineDiff("a\nb\nc", "a\nc")
    expect(diffStats(d)).toEqual({ added: 0, removed: 1, unchanged: 2 })
    expect(d.find((l) => l.op === "removed")?.value).toBe("b")
  })

  it("treats empty strings as no lines", () => {
    expect(lineDiff("", "")).toEqual([])
    expect(diffStats(lineDiff("", "x"))).toEqual({
      added: 1,
      removed: 0,
      unchanged: 0,
    })
    expect(diffStats(lineDiff("x", ""))).toEqual({
      added: 0,
      removed: 1,
      unchanged: 0,
    })
  })

  it("diffs a full rewrite as all-removed then all-added", () => {
    const d = lineDiff("x\ny", "p\nq")
    expect(diffStats(d)).toEqual({ added: 2, removed: 2, unchanged: 0 })
  })
})
