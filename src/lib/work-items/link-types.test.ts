import { describe, expect, it } from "vitest"

import {
  CANONICAL_LINK_TYPES,
  LINK_TYPE_META,
  LINK_TYPE_PAIRS,
  LINK_TYPES,
  canonicalLinkType,
  getLinkTypeOptions,
  linkTypeLabel,
  resolveLinkHierarchy,
  type WorkItemLinkType,
} from "./link-types"

describe("PROJ-27 — link types registry", () => {
  it("has 13 tokens — 7 canonical + 6 reverse", () => {
    expect(LINK_TYPES).toHaveLength(13)
    expect(CANONICAL_LINK_TYPES).toHaveLength(7)
  })

  it("every reverse token has a canonical counterpart that points back", () => {
    const reverseTokens: WorkItemLinkType[] = [
      "follows",
      "blocked",
      "duplicated",
      "partof",
      "required",
      "delivered_by",
    ]
    for (const rev of reverseTokens) {
      const canonical = LINK_TYPE_PAIRS[rev]
      expect(canonical, `${rev} must have a canonical pair`).not.toBeNull()
      expect(canonical && LINK_TYPE_PAIRS[canonical]).toBe(rev)
    }
  })

  it("`relates` is symmetric and has no reverse", () => {
    expect(LINK_TYPE_PAIRS.relates).toBeNull()
    expect(LINK_TYPE_META.relates.symmetric).toBe(true)
    expect(LINK_TYPE_META.relates.canonical).toBe(true)
  })
})

describe("PROJ-27 — canonicalLinkType()", () => {
  it("returns canonical token unchanged + swap=false for canonical inputs", () => {
    for (const t of CANONICAL_LINK_TYPES) {
      const { type, swap } = canonicalLinkType(t)
      expect(type).toBe(t)
      expect(swap).toBe(false)
    }
  })

  it.each([
    ["follows", "precedes"],
    ["blocked", "blocks"],
    ["duplicated", "duplicates"],
    ["partof", "includes"],
    ["required", "requires"],
    ["delivered_by", "delivers"],
  ] as const)("swaps reverse %s → canonical %s with swap=true", (rev, canon) => {
    const { type, swap } = canonicalLinkType(rev)
    expect(type).toBe(canon)
    expect(swap).toBe(true)
  })

  it("round-trips a reverse token back to its canonical and is idempotent", () => {
    for (const token of LINK_TYPES) {
      const r1 = canonicalLinkType(token)
      const r2 = canonicalLinkType(r1.type)
      expect(r2.type).toBe(r1.type)
      expect(r2.swap).toBe(false)
    }
  })
})

describe("PROJ-27 — linkTypeLabel()", () => {
  it("renders perspective-aware labels for directional tokens", () => {
    expect(linkTypeLabel("delivers", "from")).toBe("Liefert an")
    expect(linkTypeLabel("delivers", "to")).toBe("Wird geliefert von")
    expect(linkTypeLabel("precedes", "from")).toBe("Geht voran")
    expect(linkTypeLabel("precedes", "to")).toBe("Folgt nach")
  })

  it("returns same label from both perspectives for `relates`", () => {
    expect(linkTypeLabel("relates", "from")).toBe(linkTypeLabel("relates", "to"))
  })
})

describe("PROJ-27 — getLinkTypeOptions()", () => {
  it("returns 13 options grouped + lag flag", () => {
    const opts = getLinkTypeOptions()
    expect(opts).toHaveLength(13)
    const precedes = opts.find((o) => o.value === "precedes")
    expect(precedes?.supportsLag).toBe(true)
    expect(precedes?.group).toBe("sequence")
    const delivers = opts.find((o) => o.value === "delivers")
    expect(delivers?.group).toBe("delivery")
    expect(delivers?.supportsLag).toBe(false)
  })
})

describe("PROJ-27 — resolveLinkHierarchy()", () => {
  const projects = new Map([
    ["parent", { id: "parent", parent_project_id: null }],
    ["child-1", { id: "child-1", parent_project_id: "parent" }],
    ["child-2", { id: "child-2", parent_project_id: "parent" }],
    ["unrelated", { id: "unrelated", parent_project_id: null }],
  ])

  it("classifies same-project as 'same'", () => {
    expect(resolveLinkHierarchy("parent", "parent", projects)).toBe("same")
  })

  it("classifies parent → child as 'hierarchy'", () => {
    expect(resolveLinkHierarchy("parent", "child-1", projects)).toBe("hierarchy")
  })

  it("classifies child → parent as 'hierarchy'", () => {
    expect(resolveLinkHierarchy("child-1", "parent", projects)).toBe("hierarchy")
  })

  it("classifies sibling-to-sibling as 'cross'", () => {
    expect(resolveLinkHierarchy("child-1", "child-2", projects)).toBe("cross")
  })

  it("classifies unrelated → unrelated as 'cross'", () => {
    expect(resolveLinkHierarchy("child-1", "unrelated", projects)).toBe("cross")
  })

  it("returns 'cross' when either project is missing", () => {
    expect(resolveLinkHierarchy("parent", "missing", projects)).toBe("cross")
    expect(resolveLinkHierarchy("missing", "parent", projects)).toBe("cross")
  })
})
