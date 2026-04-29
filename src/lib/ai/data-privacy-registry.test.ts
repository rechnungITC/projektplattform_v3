import { describe, expect, it } from "vitest"

import { classifyField, registrySize } from "./data-privacy-registry"

describe("data-privacy-registry", () => {
  it("returns the registered class for a known field", () => {
    expect(classifyField("projects", "name")).toBe(2)
    expect(classifyField("projects", "project_type")).toBe(1)
    expect(classifyField("stakeholders", "name")).toBe(3)
    expect(classifyField("stakeholders", "contact_email")).toBe(3)
    expect(classifyField("profiles", "email")).toBe(3)
  })

  it("defaults to class 3 (safe) for unknown fields", () => {
    expect(classifyField("projects", "made_up_field")).toBe(3)
    expect(classifyField("nonexistent_table", "anything")).toBe(3)
  })

  it("treats responsible_user_id as class 3 across tables (PII link)", () => {
    expect(classifyField("projects", "responsible_user_id")).toBe(3)
    expect(classifyField("work_items", "responsible_user_id")).toBe(3)
    expect(classifyField("risks", "responsible_user_id")).toBe(3)
  })

  it("loads a non-trivial registry", () => {
    expect(registrySize()).toBeGreaterThan(40)
  })
})
