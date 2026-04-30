import { describe, expect, it } from "vitest"

import type { MethodOverrideRow } from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"

import {
  countEnabledAfterToggle,
  isValidMethodKey,
  resolveMethodAvailability,
  VALID_METHOD_KEYS,
} from "./overrides"

function row(method: ProjectMethod, enabled: boolean): MethodOverrideRow {
  return {
    id: `id-${method}`,
    tenant_id: "t1",
    method_key: method,
    enabled,
    updated_by: "u1",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
  }
}

describe("VALID_METHOD_KEYS", () => {
  it("contains the 7 known methods", () => {
    expect(VALID_METHOD_KEYS).toEqual(
      expect.arrayContaining([
        "scrum",
        "kanban",
        "safe",
        "waterfall",
        "pmi",
        "prince2",
        "vxt2",
      ])
    )
  })
})

describe("isValidMethodKey", () => {
  it("accepts known keys", () => {
    expect(isValidMethodKey("scrum")).toBe(true)
    expect(isValidMethodKey("kanban")).toBe(true)
  })
  it("rejects unknown", () => {
    expect(isValidMethodKey("waterfall-classic")).toBe(false)
    expect(isValidMethodKey("")).toBe(false)
  })
})

describe("resolveMethodAvailability", () => {
  it("defaults to all-enabled when no overrides", () => {
    const result = resolveMethodAvailability([])
    for (const k of VALID_METHOD_KEYS) {
      expect(result[k]).toBe(true)
    }
  })

  it("applies a single disable override", () => {
    const result = resolveMethodAvailability([row("safe", false)])
    expect(result.safe).toBe(false)
    expect(result.scrum).toBe(true)
  })

  it("merges enable + disable overrides", () => {
    const result = resolveMethodAvailability([
      row("safe", false),
      row("vxt2", false),
      row("pmi", true),
    ])
    expect(result.safe).toBe(false)
    expect(result.vxt2).toBe(false)
    expect(result.pmi).toBe(true)
    expect(result.scrum).toBe(true)
  })
})

describe("countEnabledAfterToggle", () => {
  it("simulates a disable on a previously-default-enabled method", () => {
    const count = countEnabledAfterToggle([], "scrum", false)
    expect(count).toBe(VALID_METHOD_KEYS.length - 1) // 6
  })

  it("simulates re-enable when override flips back to true", () => {
    const rows = [row("safe", false), row("vxt2", false)]
    expect(countEnabledAfterToggle(rows, "safe", true)).toBe(
      VALID_METHOD_KEYS.length - 1 // vxt2 still disabled
    )
  })

  it("returns 0 when toggling the last enabled method off", () => {
    const rows: MethodOverrideRow[] = (
      VALID_METHOD_KEYS.filter((k) => k !== "scrum") as ProjectMethod[]
    ).map((k) => row(k, false))
    // Now only scrum is implicitly enabled. Toggle scrum off → 0.
    expect(countEnabledAfterToggle(rows, "scrum", false)).toBe(0)
  })

  it("an explicit override row supersedes the implicit default", () => {
    const rows = [row("scrum", true)]
    expect(countEnabledAfterToggle(rows, "scrum", false)).toBe(
      VALID_METHOD_KEYS.length - 1
    )
  })
})
