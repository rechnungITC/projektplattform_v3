import { describe, expect, it } from "vitest"

import type { TreeNodeWithDocument } from "@/types/dms"

import { buildForest } from "./tree"

function node(
  id: string,
  parent_id: string | null,
  node_type: "folder" | "document",
  name: string,
): TreeNodeWithDocument {
  return {
    id,
    tenant_id: "t",
    project_id: "p",
    parent_id,
    node_type,
    name,
    slug: name.toLowerCase(),
    sort_order: 0,
    created_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    deleted_at: null,
    document: node_type === "document" ? { id: `doc-${id}`, mime_type: "application/pdf", size_bytes: 1, original_filename: name } : null,
  }
}

describe("buildForest", () => {
  it("nests children under their parent folder", () => {
    const forest = buildForest([
      node("root", null, "folder", "Legal"),
      node("child", "root", "document", "loi.pdf"),
    ])
    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe("root")
    expect(forest[0].children).toHaveLength(1)
    expect(forest[0].children![0].id).toBe("child")
  })

  it("gives documents null children (leaf) and folders an array", () => {
    const forest = buildForest([
      node("f", null, "folder", "Folder"),
      node("d", null, "document", "file.pdf"),
    ])
    const folder = forest.find((n) => n.id === "f")!
    const doc = forest.find((n) => n.id === "d")!
    expect(folder.children).toEqual([])
    expect(doc.children).toBeNull()
  })

  it("orders folders before documents then alphabetically", () => {
    const forest = buildForest([
      node("d1", null, "document", "zeta.pdf"),
      node("f2", null, "folder", "Beta"),
      node("f1", null, "folder", "Alpha"),
      node("d2", null, "document", "alpha.pdf"),
    ])
    expect(forest.map((n) => n.id)).toEqual(["f1", "f2", "d2", "d1"])
  })

  it("treats nodes with a missing parent as roots (partial fetch safe)", () => {
    const forest = buildForest([node("orphan", "gone", "document", "x.pdf")])
    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe("orphan")
  })
})
