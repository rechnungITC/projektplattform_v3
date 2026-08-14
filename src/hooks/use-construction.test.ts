import { describe, expect, it } from "vitest"

import {
  buildSectionTree,
  flattenSectionTree,
  forbiddenParentIds,
} from "@/hooks/use-construction"
import type { ConstructionSection } from "@/types/construction"

// PROJ-45-α — the pure tree helpers. The database owns cycle rejection and
// orphan prevention; what is asserted here is that the VIEW cannot lose a row
// and cannot offer a move that is guaranteed to fail.

function s(
  id: string,
  parent_id: string | null,
  label: string,
  sort_order = 0
): ConstructionSection {
  return {
    id,
    tenant_id: "t",
    project_id: "p",
    parent_id,
    label,
    description: null,
    sort_order,
    path: null,
    created_at: "",
    updated_at: "",
  }
}

describe("buildSectionTree", () => {
  it("nests children under their parent and stamps the depth", () => {
    const tree = buildSectionTree([
      s("a", null, "Haus A"),
      s("b", "a", "2. OG"),
      s("c", "b", "Whg 3"),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].children[0].label).toBe("Whg 3")
    expect(flattenSectionTree(tree).map((n) => n.depth)).toEqual([0, 1, 2])
  })

  it("sorts siblings by sort_order, then by label", () => {
    const tree = buildSectionTree([
      s("a", null, "Zeta", 10),
      s("b", null, "Alpha", 10),
      s("c", null, "Erste", 1),
    ])
    expect(tree.map((n) => n.label)).toEqual(["Erste", "Alpha", "Zeta"])
  })

  it("surfaces an orphan at root level instead of dropping it", () => {
    // A row whose parent is not in the list (e.g. filtered away) must stay
    // visible — silently swallowing it would hide real data.
    const tree = buildSectionTree([s("a", null, "Haus A"), s("x", "missing", "Waise")])
    expect(tree.map((n) => n.label).sort()).toEqual(["Haus A", "Waise"])
  })

  it("keeps the same label under different parents apart", () => {
    const tree = buildSectionTree([
      s("a", null, "Haus A"),
      s("b", null, "Haus B"),
      s("a1", "a", "2. OG"),
      s("b1", "b", "2. OG"),
    ])
    expect(flattenSectionTree(tree).filter((n) => n.label === "2. OG")).toHaveLength(2)
  })
})

describe("forbiddenParentIds", () => {
  const rows = [
    s("a", null, "Haus A"),
    s("b", "a", "2. OG"),
    s("c", "b", "Whg 3"),
    s("d", null, "Haus B"),
  ]

  it("blocks the node itself and its whole subtree", () => {
    const blocked = forbiddenParentIds(rows, "a")
    expect([...blocked].sort()).toEqual(["a", "b", "c"])
  })

  it("leaves unrelated branches selectable", () => {
    expect(forbiddenParentIds(rows, "a").has("d")).toBe(false)
  })

  it("blocks only itself for a leaf", () => {
    expect([...forbiddenParentIds(rows, "c")]).toEqual(["c"])
  })
})
