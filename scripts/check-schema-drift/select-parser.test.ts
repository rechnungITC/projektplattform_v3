import { describe, expect, it } from "vitest"

import { parseSelect } from "./select-parser"

describe("parseSelect", () => {
  it("parses a single column", () => {
    const r = parseSelect("title")
    expect(r.kind).toBe("columns")
    expect(r.columns).toEqual(["title"])
    expect(r.embeddedRelations).toEqual([])
  })

  it("parses a comma-separated list", () => {
    const r = parseSelect("id, title, status")
    expect(r.columns).toEqual(["id", "title", "status"])
    expect(r.embeddedRelations).toHaveLength(0)
  })

  it("strips alias prefix on plain columns", () => {
    const r = parseSelect("display:title, internal:id")
    expect(r.columns).toEqual(["title", "id"])
  })

  it("returns wildcard kind for *", () => {
    const r = parseSelect("*")
    expect(r.kind).toBe("wildcard")
    expect(r.columns).toEqual([])
  })

  it("returns wildcard kind for compound `*, embed(...)` (PostgREST all-plus-embed)", () => {
    const r = parseSelect("*, tag:tags(name)")
    expect(r.kind).toBe("wildcard")
    expect(r.columns).toEqual([])
    expect(r.embeddedRelations).toHaveLength(1)
    expect(r.embeddedRelations[0].relation).toBe("tags")
  })

  it("recognizes a simple embedded relation", () => {
    const r = parseSelect("id, profiles(name)")
    expect(r.columns).toEqual(["id"])
    expect(r.embeddedRelations).toEqual([
      { alias: null, relation: "profiles", innerSelect: "name" },
    ])
  })

  it("recognizes an aliased embedded relation with FK hint", () => {
    const r = parseSelect(
      "id, responsible:profiles!work_items_responsible_user_id_fkey ( id, display_name, email )"
    )
    expect(r.columns).toEqual(["id"])
    expect(r.embeddedRelations).toHaveLength(1)
    expect(r.embeddedRelations[0]).toMatchObject({
      alias: "responsible",
      relation: "profiles",
    })
    // Inner SELECT preserved verbatim (recursive validation = PROJ-42-β).
    expect(r.embeddedRelations[0].innerSelect.trim()).toContain("display_name")
  })

  it("handles nested parens inside embedded relations", () => {
    const r = parseSelect("id, foo(bar(baz))")
    expect(r.columns).toEqual(["id"])
    expect(r.embeddedRelations).toHaveLength(1)
    expect(r.embeddedRelations[0].innerSelect).toBe("bar(baz)")
  })

  it("ignores commas inside parens when splitting at top level", () => {
    const r = parseSelect("id, foo(a, b, c), title")
    expect(r.columns).toEqual(["id", "title"])
    expect(r.embeddedRelations).toHaveLength(1)
    expect(r.embeddedRelations[0].innerSelect).toBe("a, b, c")
  })

  it("trims whitespace and handles multi-line strings", () => {
    const r = parseSelect(`
      id,
      tenant_id,
      project_id,
      title
    `)
    expect(r.columns).toEqual(["id", "tenant_id", "project_id", "title"])
  })

  it("drops empty segments from trailing or doubled commas", () => {
    const r = parseSelect("id, , title,")
    expect(r.columns).toEqual(["id", "title"])
  })

  it("handles real-world useWorkItems SELECT", () => {
    const r = parseSelect(
      "id, tenant_id, project_id, kind, parent_id, phase_id, milestone_id, sprint_id, title, description, status, priority, responsible_user_id, attributes, position, created_from_proposal_id, created_by, created_at, updated_at, is_deleted, outline_path, wbs_code, wbs_code_is_custom, derived_planned_start, derived_planned_end, derived_estimate_hours, responsible:profiles!work_items_responsible_user_id_fkey ( id, display_name, email )"
    )
    expect(r.kind).toBe("columns")
    expect(r.columns).toContain("outline_path")
    expect(r.columns).toContain("wbs_code")
    expect(r.columns).not.toContain("responsible")
    expect(r.embeddedRelations).toHaveLength(1)
    expect(r.embeddedRelations[0].relation).toBe("profiles")
  })
})
