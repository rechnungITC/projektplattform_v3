import { describe, expect, it } from "vitest"

import {
  isValidProjectTypeKey,
  ProjectTypeOverrideSchema,
  resolveProjectTypeProfile,
  VALID_PROJECT_TYPE_KEYS,
} from "./overrides"

describe("VALID_PROJECT_TYPE_KEYS", () => {
  it("contains the 4 known types", () => {
    expect(VALID_PROJECT_TYPE_KEYS).toEqual([
      "erp",
      "construction",
      "software",
      "general",
    ])
  })
})

describe("isValidProjectTypeKey", () => {
  it("accepts known", () => {
    expect(isValidProjectTypeKey("erp")).toBe(true)
    expect(isValidProjectTypeKey("software")).toBe(true)
  })
  it("rejects unknown", () => {
    expect(isValidProjectTypeKey("agile")).toBe(false)
    expect(isValidProjectTypeKey("")).toBe(false)
  })
})

describe("ProjectTypeOverrideSchema", () => {
  it("accepts an empty object", () => {
    expect(ProjectTypeOverrideSchema.safeParse({}).success).toBe(true)
  })

  it("accepts standard_roles + required_info", () => {
    const ok = {
      standard_roles: [{ key: "lead", label_de: "Lead" }],
      required_info: [{ key: "scope", label_de: "Scope" }],
    }
    expect(ProjectTypeOverrideSchema.safeParse(ok).success).toBe(true)
  })

  it("rejects unknown top-level keys (whitelist)", () => {
    const bad = { document_templates: ["something"] }
    expect(ProjectTypeOverrideSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects roles without label_de", () => {
    const bad = { standard_roles: [{ key: "lead" }] }
    expect(ProjectTypeOverrideSchema.safeParse(bad).success).toBe(false)
  })
})

describe("resolveProjectTypeProfile", () => {
  it("returns the catalog entry when no override", () => {
    const profile = resolveProjectTypeProfile("erp", null)
    expect(profile).not.toBeNull()
    expect(profile?.key).toBe("erp")
    expect(profile?.standard_roles.length).toBeGreaterThan(0)
  })

  it("replaces standard_roles when overridden", () => {
    const profile = resolveProjectTypeProfile("erp", {
      standard_roles: [{ key: "custom", label_de: "Custom Lead" }],
    })
    expect(profile?.standard_roles).toEqual([
      { key: "custom", label_de: "Custom Lead" },
    ])
  })

  it("keeps required_info from base when only roles overridden", () => {
    const baseRequired = resolveProjectTypeProfile("erp", null)?.required_info
    const profile = resolveProjectTypeProfile("erp", {
      standard_roles: [{ key: "x", label_de: "X" }],
    })
    expect(profile?.required_info).toEqual(baseRequired)
  })

  it("returns null for an unknown type_key", () => {
    // @ts-expect-error testing runtime guard
    expect(resolveProjectTypeProfile("nonexistent", null)).toBeNull()
  })
})
