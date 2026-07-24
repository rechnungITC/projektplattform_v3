import yaml from "js-yaml"
import { describe, expect, it } from "vitest"

import { serializeSkillMarkdown } from "./serialize"

// PROJ-76 — proves the generated .md has parseable YAML frontmatter
// (ADR skills-data-model.md follow-up; satisfies spec AC "parseable YAML").

describe("serializeSkillMarkdown", () => {
  it("produces a --- fenced frontmatter block that round-trips through a YAML parser", () => {
    const md = serializeSkillMarkdown(
      { name: "Risk Coach", description: "Guides risk phrasing" },
      {
        frontmatter: {
          temperature: 0.4,
          allowed_kinds: ["risk", "task"],
          tone: "concise",
          model_overrides: { class1: "claude-opus-4-8" },
        },
        markdown_content: "# Body\nDo the thing.",
      }
    )

    expect(md.startsWith("---\n")).toBe(true)
    const parts = md.split("\n---\n")
    expect(parts).toHaveLength(2)

    const front = parts[0].replace(/^---\n/, "")
    const parsed = yaml.load(front) as Record<string, unknown>
    expect(parsed.name).toBe("Risk Coach")
    expect(parsed.description).toBe("Guides risk phrasing")
    expect(parsed.temperature).toBe(0.4)
    expect(parsed.allowed_kinds).toEqual(["risk", "task"])
    expect(parsed.tone).toBe("concise")
    expect(parsed.model_overrides).toEqual({ class1: "claude-opus-4-8" })
    expect(parts[1]).toContain("Do the thing.")
  })

  it("omits empty/nullish behaviour keys but always keeps name + description", () => {
    const md = serializeSkillMarkdown(
      { name: "Bare", description: "" },
      { frontmatter: { temperature: null, allowed_kinds: [], tone: "" }, markdown_content: "" }
    )
    const front = md.split("\n---\n")[0].replace(/^---\n/, "")
    const parsed = yaml.load(front) as Record<string, unknown>
    expect(parsed.name).toBe("Bare")
    expect("description" in parsed).toBe(true)
    expect("temperature" in parsed).toBe(false)
    expect("allowed_kinds" in parsed).toBe(false)
    expect("tone" in parsed).toBe(false)
  })

  it("escapes YAML-hostile values via js-yaml.dump (no hand-rolled quoting)", () => {
    const md = serializeSkillMarkdown(
      { name: "Weird: value #1", description: "line one\nline two" },
      { frontmatter: {}, markdown_content: "x" }
    )
    const front = md.split("\n---\n")[0].replace(/^---\n/, "")
    const parsed = yaml.load(front) as Record<string, unknown>
    expect(parsed.name).toBe("Weird: value #1")
    expect(parsed.description).toBe("line one\nline two")
  })
})
