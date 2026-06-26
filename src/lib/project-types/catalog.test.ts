import { describe, expect, it } from "vitest"

import {
  PROJECT_TYPE_CATALOG,
  getProjectTypeProfile,
  isValidMaRoleKey,
  MA_STANDARD_ROLES,
} from "./catalog"

describe("project type catalog", () => {
  it("has 5 entries: general / erp / software / construction / ma", () => {
    const keys = PROJECT_TYPE_CATALOG.map((p) => p.key).sort()
    expect(keys).toEqual(["construction", "erp", "general", "ma", "software"])
  })

  it("M&A profile (PROJ-94/97a) is registered with deal-lead/sponsor roles", () => {
    const p = getProjectTypeProfile("ma")
    expect(p.key).toBe("ma")
    expect(p.label_de).toBe("M&A-Projekt")
    // PROJ-97a renamed `sponsor` → `executive_sponsor` and extended the set.
    expect(p.standard_roles.map((r) => r.key)).toEqual(
      expect.arrayContaining(["deal_lead", "executive_sponsor"])
    )
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

  // PROJ-97a — M&A professional roles ("Fachrollen").
  it("M&A profile exposes the 11 extended professional roles", () => {
    const ma = getProjectTypeProfile("ma")
    expect(ma.standard_roles).toBe(MA_STANDARD_ROLES)
    expect(MA_STANDARD_ROLES).toHaveLength(11)
    expect(MA_STANDARD_ROLES.map((r) => r.key)).toContain("external_advisor")
    expect(MA_STANDARD_ROLES.map((r) => r.key)).toContain("deal_lead")
    // unique keys
    expect(new Set(MA_STANDARD_ROLES.map((r) => r.key)).size).toBe(11)
  })

  it("isValidMaRoleKey accepts catalog keys and rejects unknown ones", () => {
    expect(isValidMaRoleKey("legal_counsel")).toBe(true)
    expect(isValidMaRoleKey("executive_sponsor")).toBe(true)
    expect(isValidMaRoleKey("made_up_role")).toBe(false)
    expect(isValidMaRoleKey("")).toBe(false)
  })
})
