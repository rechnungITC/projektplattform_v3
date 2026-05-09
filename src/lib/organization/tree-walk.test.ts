import { describe, expect, it } from "vitest"

import {
  breadcrumbPath,
  collectDescendants,
  maxDepth,
  wouldCreateCycle,
  type MinimalOrgUnit,
} from "./tree-walk"

const u = (id: string, parent_id: string | null, name = id): MinimalOrgUnit => ({
  id,
  parent_id,
  name,
})

const sampleTree: MinimalOrgUnit[] = [
  u("a", null, "Group"),
  u("b", "a", "Hamburg"),
  u("c", "a", "München"),
  u("d", "b", "IT"),
  u("e", "d", "CRM Team"),
  u("f", "d", "ERP Team"),
]

describe("wouldCreateCycle", () => {
  it("returns false when moving to a sibling subtree", () => {
    expect(wouldCreateCycle("e", "c", sampleTree)).toBe(false)
  })

  it("returns false when moving to root", () => {
    expect(wouldCreateCycle("e", null, sampleTree)).toBe(false)
  })

  it("returns true when targeting self", () => {
    expect(wouldCreateCycle("d", "d", sampleTree)).toBe(true)
  })

  it("returns true when target is direct child", () => {
    expect(wouldCreateCycle("d", "e", sampleTree)).toBe(true)
  })

  it("returns true when target is deeper descendant", () => {
    const deep = [
      u("a", null),
      u("b", "a"),
      u("c", "b"),
      u("d", "c"),
    ]
    expect(wouldCreateCycle("a", "d", deep)).toBe(true)
  })

  it("returns false when target is unrelated", () => {
    expect(wouldCreateCycle("d", "c", sampleTree)).toBe(false)
  })
})

describe("collectDescendants", () => {
  it("returns all descendants depth-first", () => {
    const result = collectDescendants("a", sampleTree).map((n) => n.id)
    expect(result.sort()).toEqual(["b", "c", "d", "e", "f"])
  })

  it("returns empty for leaves", () => {
    expect(collectDescendants("e", sampleTree)).toEqual([])
  })
})

describe("breadcrumbPath", () => {
  it("walks parents to root", () => {
    expect(breadcrumbPath("e", sampleTree)).toEqual([
      "Group",
      "Hamburg",
      "IT",
      "CRM Team",
    ])
  })

  it("returns single-element for root nodes", () => {
    expect(breadcrumbPath("a", sampleTree)).toEqual(["Group"])
  })

  it("returns [] for unknown id", () => {
    expect(breadcrumbPath("zz", sampleTree)).toEqual([])
  })
})

describe("maxDepth", () => {
  it("counts levels below root", () => {
    expect(maxDepth(sampleTree)).toBe(3) // a → b → d → e
  })

  it("returns 0 for empty input", () => {
    expect(maxDepth([])).toBe(0)
  })
})