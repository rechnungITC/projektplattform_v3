import { describe, expect, it } from "vitest"

import {
  PROJECT_TYPE_CATALOG,
  getProjectTypeProfile,
} from "./catalog"

describe("project type catalog", () => {
  it("has 4 entries: general / erp / software / construction", () => {
    const keys = PROJECT_TYPE_CATALOG.map((p) => p.key).sort()
    expect(keys).toEqual(["construction", "erp", "general", "software"])
  })

  it("ERP profile carries the canonical AC fields", () => {
    const p = getProjectTypeProfile("erp")
    expect(p.standard_modules).toEqual(
      expect.arrayContaining([
        "backlog",
        "planning",
        "members",
        "history",
        "stakeholders",
        "governance",
      ])
    )
    expect(p.standard_roles.map((r) => r.key)).toEqual(
      expect.arrayContaining([
        "project_lead",
        "sponsor",
        "key_user",
        "it_architect",
        "dpo",
      ])
    )
    expect(p.required_info.map((r) => r.key)).toEqual([
      "target_systems",
      "business_units",
      "migration_scope",
    ])
  })

  it("Generic Software profile carries the canonical AC fields", () => {
    const p = getProjectTypeProfile("software")
    expect(p.standard_modules).toEqual(
      expect.arrayContaining([
        "backlog",
        "planning",
        "members",
        "history",
        "releases",
      ])
    )
    expect(p.standard_roles.map((r) => r.key)).toEqual(
      expect.arrayContaining([
        "project_lead",
        "product_owner",
        "scrum_master",
        "developer",
        "qa_lead",
      ])
    )
    expect(p.required_info.map((r) => r.key)).toEqual([
      "target_platforms",
      "tech_stack",
    ])
  })

  it("Construction is marked is_placeholder", () => {
    const p = getProjectTypeProfile("construction")
    expect(p.is_placeholder).toBe(true)
    expect(p.required_info).toEqual([])
  })
})
