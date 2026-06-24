import { describe, expect, it } from "vitest"

import { buildAccessMatrix } from "./access-matrix"
import type { AccessExplainEntry } from "./advisor-nda-api"

function entry(
  user_id: string,
  has_access: boolean,
  reason: AccessExplainEntry["reason"],
  overrides: Partial<AccessExplainEntry> = {}
): AccessExplainEntry {
  return {
    user_id,
    is_member: true,
    is_external_advisor: false,
    mandate_ok: true,
    nda_ok: true,
    cleared_level: null,
    has_access,
    reason,
    ...overrides,
  }
}

describe("buildAccessMatrix", () => {
  it("pivots a confidential-cleared user into the right cells + capped reason", () => {
    const rows = buildAccessMatrix({
      standard: [entry("u-conf", true, "baseline")],
      confidential: [entry("u-conf", true, "cleared")],
      strict: [entry("u-conf", false, "no_clearance")],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].access).toEqual({
      standard: true,
      confidential: true,
      strict: false,
    })
    expect(rows[0].max_level).toBe("confidential")
    // reason reflects the highest accessible level (positive story)
    expect(rows[0].reason).toBe("cleared")
  })

  it("treats an admin as full-access with admin reason", () => {
    const rows = buildAccessMatrix({
      standard: [entry("admin", true, "admin")],
      confidential: [entry("admin", true, "admin")],
      strict: [entry("admin", true, "admin")],
    })
    expect(rows[0].max_level).toBe("strict")
    expect(rows[0].reason).toBe("admin")
  })

  it("keeps an advisor blocked above standard and surfaces the block reason via cells", () => {
    const rows = buildAccessMatrix({
      standard: [
        entry("adv", true, "baseline", { is_external_advisor: true }),
      ],
      confidential: [
        entry("adv", false, "nda_missing", { is_external_advisor: true }),
      ],
      strict: [
        entry("adv", false, "nda_missing", { is_external_advisor: true }),
      ],
    })
    expect(rows[0].is_external_advisor).toBe(true)
    expect(rows[0].max_level).toBe("standard")
    expect(rows[0].reason).toBe("baseline")
    expect(rows[0].access.confidential).toBe(false)
  })

  it("falls back to a block reason when the user can see nothing", () => {
    const rows = buildAccessMatrix({
      standard: [entry("blocked", false, "mandate_inactive")],
      confidential: [entry("blocked", false, "mandate_inactive")],
      strict: [entry("blocked", false, "mandate_inactive")],
    })
    expect(rows[0].max_level).toBeNull()
    expect(rows[0].reason).toBe("mandate_inactive")
  })

  it("sorts most-privileged users first, then by user_id", () => {
    const rows = buildAccessMatrix({
      standard: [
        entry("z-standard", true, "baseline"),
        entry("a-strict", true, "admin"),
        entry("m-conf", true, "baseline"),
      ],
      confidential: [
        entry("a-strict", true, "admin"),
        entry("m-conf", true, "cleared"),
      ],
      strict: [entry("a-strict", true, "admin")],
    })
    expect(rows.map((r) => r.user_id)).toEqual([
      "a-strict",
      "m-conf",
      "z-standard",
    ])
  })

  it("unions users that appear in only some level responses", () => {
    const rows = buildAccessMatrix({
      standard: [entry("only-standard", true, "baseline")],
      confidential: [entry("only-conf", true, "cleared")],
      strict: [],
    })
    expect(rows.map((r) => r.user_id).sort()).toEqual([
      "only-conf",
      "only-standard",
    ])
    const onlyStandard = rows.find((r) => r.user_id === "only-standard")
    // appears only in the standard response -> no access flag set elsewhere
    expect(onlyStandard?.access).toEqual({
      standard: true,
      confidential: false,
      strict: false,
    })
  })
})
