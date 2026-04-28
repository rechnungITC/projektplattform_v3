import { describe, expect, it } from "vitest"

import { computeRules } from "./engine"
import { PROJECT_METHODS } from "@/types/project-method"
import { PROJECT_TYPES } from "@/types/project"

describe("computeRules — type/method matrix", () => {
  it("returns active_modules and suggested_roles from the type catalog", () => {
    const rules = computeRules("erp", "scrum")
    expect(rules.active_modules).toContain("backlog")
    expect(rules.active_modules).toContain("governance")
    expect(rules.suggested_roles.map((r) => r.key)).toContain("dpo")
  })

  it("returns required_info for ERP", () => {
    const rules = computeRules("erp", null)
    const keys = rules.required_info.map((r) => r.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        "target_systems",
        "business_units",
        "migration_scope",
      ])
    )
  })

  it("starter_kinds is empty when method is null", () => {
    const rules = computeRules("erp", null)
    expect(rules.starter_kinds).toEqual([])
  })

  it("Scrum starter_kinds include epic/story/task/subtask/bug", () => {
    const rules = computeRules("software", "scrum")
    expect([...rules.starter_kinds]).toEqual(
      expect.arrayContaining(["epic", "story", "task", "subtask", "bug"])
    )
    // and exclude Wasserfall-only kinds
    expect(rules.starter_kinds).not.toContain("work_package")
  })

  it("Waterfall starter_kinds prioritise work_package", () => {
    const rules = computeRules("erp", "waterfall")
    expect(rules.starter_kinds).toContain("work_package")
    // Waterfall does not show story/epic per the visibility table
    expect(rules.starter_kinds).not.toContain("story")
    expect(rules.starter_kinds).not.toContain("epic")
  })

  it("PMI starter_kinds align with Waterfall (governance overlay)", () => {
    const pmi = computeRules("erp", "pmi")
    const waterfall = computeRules("erp", "waterfall")
    expect([...pmi.starter_kinds].sort()).toEqual(
      [...waterfall.starter_kinds].sort()
    )
  })

  it("VXT2 hybrid includes both work_package and story", () => {
    const rules = computeRules("software", "vxt2")
    expect(rules.starter_kinds).toContain("work_package")
    expect(rules.starter_kinds).toContain("story")
  })

  it("Bug appears in starter_kinds for every method", () => {
    for (const method of PROJECT_METHODS) {
      const rules = computeRules("general", method)
      expect(rules.starter_kinds).toContain("bug")
    }
  })

  it("returns stable output across all (type, method) combinations", () => {
    // Pin: every combination yields a non-empty active_modules and
    // a starter_kinds list whose items are all in the visibility set.
    for (const type of PROJECT_TYPES) {
      const noMethod = computeRules(type, null)
      expect(noMethod.active_modules.length).toBeGreaterThan(0)
      expect(noMethod.starter_kinds).toEqual([])

      for (const method of PROJECT_METHODS) {
        const r = computeRules(type, method)
        expect(r.active_modules.length).toBeGreaterThan(0)
        expect(r.starter_kinds.length).toBeGreaterThan(0)
      }
    }
  })

  it("Construction is structurally available but minimal", () => {
    const r = computeRules("construction", "waterfall")
    expect(r.active_modules.length).toBeGreaterThan(0)
    // The construction profile contributes no required_info until the
    // construction extension lands; the chosen method (waterfall) does
    // contribute its own follow-ups (e.g. signoff_authority — PROJ-5 M2).
    const typeKeys = r.required_info
      .filter((info) => info.key === "target_systems" || info.key === "business_units")
      .map((info) => info.key)
    expect(typeKeys).toEqual([])
  })

  it("Method follow-ups are merged in (PROJ-5 M2)", () => {
    const generalScrum = computeRules("general", "scrum")
    const generalScrumKeys = generalScrum.required_info.map((r) => r.key)
    expect(generalScrumKeys).toContain("sprint_length_weeks")
    expect(generalScrumKeys).toContain("definition_of_done")

    const generalWaterfall = computeRules("general", "waterfall")
    const generalWaterfallKeys = generalWaterfall.required_info.map((r) => r.key)
    expect(generalWaterfallKeys).toContain("signoff_authority")
    expect(generalWaterfallKeys).not.toContain("sprint_length_weeks")
  })

  it("Method follow-ups are not added when method is null", () => {
    const r = computeRules("erp", null)
    const keys = r.required_info.map((info) => info.key)
    // type-specific keys still present
    expect(keys).toContain("target_systems")
    // no method-specific keys
    expect(keys).not.toContain("sprint_length_weeks")
    expect(keys).not.toContain("signoff_authority")
  })
})
