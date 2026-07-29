import { describe, it, expect } from "vitest"

import {
  diffFrontmatter,
  hasAllowedActionsChange,
  hasFrontmatterChanges,
} from "@/lib/skills/frontmatter-diff"

describe("PROJ-141-β2 (M-8) — frontmatter-diff", () => {
  it("returns no changes when active and target are byte-identical", () => {
    const fm = {
      allowed_actions: ["propose"],
      allowed_kinds: ["work_item"],
      temperature: 0.2,
      tone: "concise",
      model_overrides: { anthropic: "claude-sonnet-4-6" },
    }
    const diffs = diffFrontmatter(fm, fm)
    expect(hasFrontmatterChanges(diffs)).toBe(false)
    expect(hasAllowedActionsChange(diffs)).toBe(false)
    expect(diffs.every((d) => d.added.length === 0 && d.removed.length === 0)).toBe(
      true
    )
  })

  it("flags allowed_actions change and lists added/removed items", () => {
    const active = { allowed_actions: ["propose", "critique"] }
    const target = { allowed_actions: ["propose", "generate"] }
    const diffs = diffFrontmatter(active, target)
    expect(hasAllowedActionsChange(diffs)).toBe(true)
    const aa = diffs.find((d) => d.key === "allowed_actions")!
    expect(aa.added).toEqual(["generate"])
    expect(aa.removed).toEqual(["critique"])
    expect(aa.changed).toBe(true)
  })

  it("treats null and undefined as empty for lists", () => {
    const diffs = diffFrontmatter(
      { allowed_actions: undefined, allowed_kinds: null },
      { allowed_actions: [], allowed_kinds: [] }
    )
    expect(hasFrontmatterChanges(diffs)).toBe(false)
  })

  it("dedupes and normalises string-lists before comparing", () => {
    const active = { allowed_actions: ["propose", "propose", "critique"] }
    const target = { allowed_actions: ["critique", "propose"] }
    const diffs = diffFrontmatter(active, target)
    expect(hasAllowedActionsChange(diffs)).toBe(false)
  })

  it("diffs kv-maps as sorted key=value lines", () => {
    const active = { model_overrides: { anthropic: "claude-3-opus" } }
    const target = { model_overrides: { anthropic: "claude-sonnet-4-6" } }
    const diffs = diffFrontmatter(active, target)
    const mo = diffs.find((d) => d.key === "model_overrides")!
    expect(mo.changed).toBe(true)
    expect(mo.added).toEqual(["anthropic=claude-sonnet-4-6"])
    expect(mo.removed).toEqual(["anthropic=claude-3-opus"])
  })

  it("diffs scalar tone as add/remove pair", () => {
    const diffs = diffFrontmatter({ tone: "concise" }, { tone: "friendly" })
    const t = diffs.find((d) => d.key === "tone")!
    expect(t.added).toEqual(["friendly"])
    expect(t.removed).toEqual(["concise"])
  })

  it("normalises temperature to string for comparison", () => {
    const same = diffFrontmatter({ temperature: 0.2 }, { temperature: 0.2 })
    expect(hasFrontmatterChanges(same)).toBe(false)

    const diff = diffFrontmatter({ temperature: 0.2 }, { temperature: 0.5 })
    const t = diff.find((d) => d.key === "temperature")!
    expect(t.changed).toBe(true)
    expect(t.added).toEqual(["0.5"])
    expect(t.removed).toEqual(["0.2"])
  })

  it("handles setting a previously-unset scalar (removed side is empty)", () => {
    const diffs = diffFrontmatter({}, { tone: "concise" })
    const t = diffs.find((d) => d.key === "tone")!
    expect(t.changed).toBe(true)
    expect(t.added).toEqual(["concise"])
    expect(t.removed).toEqual([])
  })

  it("returns one FieldDiff per declared frontmatter field, in stable order", () => {
    const diffs = diffFrontmatter({}, {})
    expect(diffs.map((d) => d.key)).toEqual([
      "allowed_actions",
      "allowed_kinds",
      "temperature",
      "tone",
      "model_overrides",
    ])
  })
})
