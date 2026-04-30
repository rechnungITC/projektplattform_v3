import { describe, expect, it } from "vitest"

import { resolveEffects, expectedChildKinds } from "./trigger"
import type { ComplianceTag } from "./types"

function makeTag(overrides: Partial<ComplianceTag> = {}): ComplianceTag {
  return {
    id: "tag-1",
    tenant_id: "tenant-1",
    key: "iso-9001",
    display_name: "ISO 9001",
    description: null,
    is_active: true,
    default_child_kinds: ["task"],
    template_keys: ["iso-9001-form"],
    is_platform_default: true,
    created_at: "2026-04-29T00:00:00Z",
    updated_at: "2026-04-29T00:00:00Z",
    ...overrides,
  }
}

describe("resolveEffects", () => {
  it("returns one effect per active tag with a matching template firePhase", () => {
    const tag = makeTag()
    const effects = resolveEffects([tag], "created")
    expect(effects).toHaveLength(1)
    expect(effects[0].tagId).toBe("tag-1")
    expect(effects[0].tagKey).toBe("iso-9001")
    expect(effects[0].phase).toBe("created")
    expect(effects[0].templates).toHaveLength(1)
    expect(effects[0].templates[0].key).toBe("iso-9001-form")
  })

  it("filters out inactive tags", () => {
    const tag = makeTag({ is_active: false })
    expect(resolveEffects([tag], "created")).toHaveLength(0)
  })

  it("filters out tags with no template matching the phase", () => {
    const tag = makeTag()
    // Templates fire on "created"; "in_progress" matches none for ISO 9001.
    expect(resolveEffects([tag], "in_progress")).toHaveLength(0)
  })

  it("ignores unknown template_keys silently (no effect emitted)", () => {
    const tag = makeTag({ template_keys: ["nope-i-dont-exist"] })
    // Engine emits effects only when there's actual work to do — a tag
    // pointing at a missing template produces no effect.
    expect(resolveEffects([tag], "created")).toHaveLength(0)
  })

  it("returns no effects when tag has no templates at all", () => {
    const tag = makeTag({ template_keys: [], default_child_kinds: ["task"] })
    expect(resolveEffects([tag], "created")).toHaveLength(0)
  })

  it("handles multiple tags with mixed activity", () => {
    const t1 = makeTag()
    const t2 = makeTag({
      id: "tag-2",
      key: "dsgvo",
      template_keys: ["dsgvo-form"],
    })
    const t3 = makeTag({ id: "tag-3", key: "onboarding", is_active: false })
    const effects = resolveEffects([t1, t2, t3], "created")
    expect(effects.map((e) => e.tagKey).sort()).toEqual(["dsgvo", "iso-9001"])
  })
})

describe("expectedChildKinds", () => {
  it("merges default_child_kinds with template childKinds, deduplicated", () => {
    const tag = makeTag()
    const kinds = expectedChildKinds(tag)
    expect(kinds).toContain("task")
    // ISO 9001 template's childKind is also 'task' → still just one entry.
    expect(kinds).toEqual(["task"])
  })

  it("returns the M365 work_package kind from its template", () => {
    const tag = makeTag({
      key: "microsoft-365-intro",
      default_child_kinds: [],
      template_keys: ["m365-intro-form"],
    })
    expect(expectedChildKinds(tag)).toEqual(["work_package"])
  })

  it("merges when defaults differ from templates", () => {
    const tag = makeTag({
      default_child_kinds: ["story"],
      template_keys: ["iso-9001-form"], // childKind = task
    })
    const kinds = expectedChildKinds(tag).sort()
    expect(kinds).toEqual(["story", "task"])
  })
})
