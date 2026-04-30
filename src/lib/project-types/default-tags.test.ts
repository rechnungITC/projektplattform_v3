import { describe, expect, it } from "vitest"

import { getProjectTypeProfile, PROJECT_TYPE_CATALOG } from "./catalog"
import { resolveProjectTypeProfile } from "./overrides"

// PROJ-18 ST-05 — every catalog profile carries `default_tag_keys`, and
// tenant overrides can replace the list.

describe("project-type catalog default_tag_keys", () => {
  it("every catalog entry exposes a default_tag_keys array", () => {
    for (const profile of PROJECT_TYPE_CATALOG) {
      expect(Array.isArray(profile.default_tag_keys)).toBe(true)
    }
  })

  it("ERP defaults include the ISO + DSGVO + vendor tags", () => {
    const erp = getProjectTypeProfile("erp")
    expect(erp.default_tag_keys).toEqual(
      expect.arrayContaining(["iso-9001", "vendor-evaluation", "dsgvo"])
    )
  })

  it("Software defaults include the ISO + change-mgmt tags", () => {
    const sw = getProjectTypeProfile("software")
    expect(sw.default_tag_keys).toEqual(
      expect.arrayContaining(["iso-27001", "change-management"])
    )
  })

  it("General has no defaults (clean slate)", () => {
    const general = getProjectTypeProfile("general")
    expect(general.default_tag_keys).toEqual([])
  })
})

describe("resolveProjectTypeProfile with override", () => {
  it("returns the catalog defaults when override is null", () => {
    const profile = resolveProjectTypeProfile("erp", null)
    expect(profile?.default_tag_keys).toEqual(
      expect.arrayContaining(["iso-9001", "vendor-evaluation", "dsgvo"])
    )
  })

  it("override default_tag_keys replaces catalog list", () => {
    const profile = resolveProjectTypeProfile("erp", {
      default_tag_keys: ["onboarding"],
    })
    expect(profile?.default_tag_keys).toEqual(["onboarding"])
  })

  it("empty override default_tag_keys means 'no defaults' (NOT inherit)", () => {
    const profile = resolveProjectTypeProfile("erp", { default_tag_keys: [] })
    expect(profile?.default_tag_keys).toEqual([])
  })

  it("override that omits default_tag_keys keeps catalog defaults", () => {
    const profile = resolveProjectTypeProfile("erp", {
      standard_roles: [{ key: "x", label_de: "X" }],
    })
    expect(profile?.default_tag_keys).toEqual(
      expect.arrayContaining(["iso-9001", "vendor-evaluation", "dsgvo"])
    )
  })
})
