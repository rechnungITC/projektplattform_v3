import { describe, expect, it } from "vitest"

import {
  resolveNewCandidates,
  resolveSkillsForProject,
} from "@/lib/project-skills/resolve"
import type { Skill, SkillCategory } from "@/types/skill"

// PROJ-78 — Auflösungs-Logik. Reine Funktion → keine Mocks nötig.

let seq = 0
function skill(
  category: SkillCategory,
  overrides: Partial<Skill> = {}
): Skill {
  seq += 1
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    tenant_id: "t1",
    name: `Skill ${seq}`,
    slug: `skill-${seq}`,
    description: "",
    category,
    method_tags: [],
    project_type_tags: [],
    is_active: true,
    current_version_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("resolveSkillsForProject", () => {
  it("matches a method skill whose method_tags contain the project method", () => {
    const s = skill("method", { method_tags: ["scrum"] })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "scrum",
      projectType: "erp",
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_method")
    expect(out[0].reason).toBe("Methode: Scrum")
  })

  it("does NOT match a method skill tagged for a different method", () => {
    const s = skill("method", { method_tags: ["waterfall"] })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "scrum",
      projectType: "erp",
    })
    expect(out).toHaveLength(0)
  })

  it("treats an EMPTY tag array as 'applies to all' (PROJ-76 vocabulary)", () => {
    const s = skill("method", { method_tags: [] })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "waterfall",
      projectType: "erp",
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_method")
  })

  it("matches a project_type skill by project_type_tags", () => {
    const s = skill("project_type", { project_type_tags: ["ma"] })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "scrum",
      projectType: "ma",
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_project_type")
    expect(out[0].reason).toBe("Projekttyp: M&A")
  })

  it("always includes cross_cutting skills regardless of method/type", () => {
    const s = skill("cross_cutting")
    const out = resolveSkillsForProject({
      skills: [s],
      method: null,
      projectType: null,
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_cross_cutting")
    expect(out[0].reason).toBe("Übergreifend")
  })

  it("excludes inactive skills defensively", () => {
    const s = skill("cross_cutting", { is_active: false })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "scrum",
      projectType: "erp",
    })
    expect(out).toHaveLength(0)
  })

  it("de-duplicates and keeps the FIRST match in priority order method > project_type > cross_cutting", () => {
    // Same id reached via two routes — must appear once, tagged auto_method.
    const shared = skill("method", { method_tags: ["scrum"] })
    const alsoCross: Skill = { ...shared, category: "cross_cutting" }
    const out = resolveSkillsForProject({
      skills: [shared, alsoCross],
      method: "scrum",
      projectType: "erp",
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_method")
  })

  it("orders results method → project_type → cross_cutting", () => {
    const m = skill("method", { method_tags: ["scrum"] })
    const t = skill("project_type", { project_type_tags: ["erp"] })
    const c = skill("cross_cutting")
    const out = resolveSkillsForProject({
      // deliberately shuffled input
      skills: [c, t, m],
      method: "scrum",
      projectType: "erp",
    })
    expect(out.map((o) => o.assignment_source)).toEqual([
      "auto_method",
      "auto_project_type",
      "auto_cross_cutting",
    ])
  })

  it("with a NULL method, only tag-less method skills match", () => {
    const tagged = skill("method", { method_tags: ["scrum"] })
    const untagged = skill("method", { method_tags: [] })
    const out = resolveSkillsForProject({
      skills: [tagged, untagged],
      method: null,
      projectType: "erp",
    })
    expect(out).toHaveLength(1)
    expect(out[0].skill.id).toBe(untagged.id)
    expect(out[0].reason).toBe("Methode: gilt für alle")
  })

  it("returns an empty array when the catalog is empty (informational, not an error)", () => {
    expect(
      resolveSkillsForProject({ skills: [], method: "scrum", projectType: "erp" })
    ).toEqual([])
  })

  it("ignores a skill whose category does not match its tag axis", () => {
    // A cross_cutting skill carrying method_tags is still cross_cutting.
    const s = skill("cross_cutting", { method_tags: ["waterfall"] })
    const out = resolveSkillsForProject({
      skills: [s],
      method: "scrum",
      projectType: "erp",
    })
    expect(out).toHaveLength(1)
    expect(out[0].assignment_source).toBe("auto_cross_cutting")
  })
})

describe("resolveNewCandidates", () => {
  it("returns only skills that are not yet assigned (purely additive)", () => {
    const a = skill("cross_cutting")
    const b = skill("cross_cutting")
    const out = resolveNewCandidates(
      { skills: [a, b], method: "scrum", projectType: "erp" },
      [a.id]
    )
    expect(out).toHaveLength(1)
    expect(out[0].skill.id).toBe(b.id)
  })

  it("returns nothing when everything matching is already assigned", () => {
    const a = skill("cross_cutting")
    const out = resolveNewCandidates(
      { skills: [a], method: "scrum", projectType: "erp" },
      [a.id]
    )
    expect(out).toEqual([])
  })

  it("never proposes an inactive skill even if unassigned", () => {
    const a = skill("cross_cutting", { is_active: false })
    const out = resolveNewCandidates(
      { skills: [a], method: "scrum", projectType: "erp" },
      []
    )
    expect(out).toEqual([])
  })
})
