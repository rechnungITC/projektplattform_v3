import { describe, expect, it } from "vitest"

import type { TenantSettings } from "@/types/tenant-settings"

import { activeToggleableModules, isModuleActive } from "./modules"

function settings(modules: TenantSettings["active_modules"]): TenantSettings {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    active_modules: modules,
    privacy_defaults: { default_class: 3 },
    ai_provider_config: { external_provider: "none" },
    retention_overrides: {},
    created_at: "2026-04-29T00:00:00Z",
    updated_at: "2026-04-29T00:00:00Z",
  }
}

describe("isModuleActive", () => {
  it("returns true when the module is in the active list", () => {
    expect(isModuleActive(settings(["risks", "decisions"]), "risks")).toBe(true)
  })

  it("returns false when the module is missing from the list", () => {
    expect(
      isModuleActive(settings(["decisions", "audit_reports"]), "risks")
    ).toBe(false)
  })

  it("fails open when settings is null/undefined", () => {
    expect(isModuleActive(null, "risks")).toBe(true)
    expect(isModuleActive(undefined, "ai_proposals")).toBe(true)
  })
})

describe("activeToggleableModules", () => {
  it("returns the intersection of toggleable + active", () => {
    const result = activeToggleableModules(
      settings(["risks", "ai_proposals", "vendor"])
    )
    expect(result).toEqual(["risks", "ai_proposals"])
  })

  it("returns all toggleable modules when settings is null", () => {
    expect(activeToggleableModules(null)).toEqual([
      "risks",
      "decisions",
      "ai_proposals",
      "audit_reports",
      "communication",
      "resources",
    ])
  })
})
