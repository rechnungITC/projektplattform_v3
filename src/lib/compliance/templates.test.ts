import { describe, expect, it } from "vitest"

import {
  TAG_TO_TEMPLATE_KEYS,
  TEMPLATES_BY_KEY,
  lookupTemplate,
  lookupTemplates,
} from "./templates"
import { PLATFORM_DEFAULT_TAG_KEYS } from "./types"

describe("compliance templates", () => {
  it("registers a template for every platform-default tag", () => {
    for (const tagKey of PLATFORM_DEFAULT_TAG_KEYS) {
      const templateKeys = TAG_TO_TEMPLATE_KEYS[tagKey]
      expect(templateKeys.length).toBeGreaterThan(0)
      for (const tk of templateKeys) {
        expect(TEMPLATES_BY_KEY[tk]).toBeDefined()
      }
    }
  })

  it("every template carries a non-empty title, body, childTitle", () => {
    for (const tpl of Object.values(TEMPLATES_BY_KEY)) {
      expect(tpl.title.length).toBeGreaterThan(0)
      expect(tpl.body.length).toBeGreaterThan(0)
      expect(tpl.childTitle.length).toBeGreaterThan(0)
    }
  })

  it("every checklist item has a unique key inside its template", () => {
    for (const tpl of Object.values(TEMPLATES_BY_KEY)) {
      const keys = tpl.checklist.map((c) => c.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it("lookupTemplate returns null for unknown keys", () => {
    expect(lookupTemplate("does-not-exist")).toBeNull()
  })

  it("lookupTemplates silently drops unknown keys", () => {
    const out = lookupTemplates(["iso-9001-form", "ghost", "dsgvo-form"])
    expect(out.map((t) => t.key)).toEqual(["iso-9001-form", "dsgvo-form"])
  })

  it("template firePhase is one of the valid CompliancePhase values", () => {
    for (const tpl of Object.values(TEMPLATES_BY_KEY)) {
      expect(["created", "in_progress", "done"]).toContain(tpl.firePhase)
    }
  })
})
