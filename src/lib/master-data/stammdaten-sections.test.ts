/**
 * PROJ-Y-143k — the Stammdaten grid must agree with the server about which
 * surfaces are open.
 *
 * The tests that matter here are the two negative ones: a tile must not be
 * flagged inactive unless a server gate really closes it (otherwise the UI
 * makes a claim nothing backs), and no tile may disappear (hiding them would
 * make the workspace setting undiscoverable).
 */

import { describe, expect, it } from "vitest"

import {
  resolveStammdatenSections,
  STAMMDATEN_SECTIONS,
  type StammdatenSection,
} from "./stammdaten-sections"
import type { ModuleKey, TenantSettings } from "@/types/tenant-settings"

function settings(active: ModuleKey[]): TenantSettings {
  return { active_modules: active } as unknown as TenantSettings
}

function bySlug(slug: string) {
  return (s: { href: string }) => s.href === `/stammdaten/${slug}`
}

const ALL_MODULES: ModuleKey[] = [
  "construction",
  "risks",
  "decisions",
  "ai_proposals",
  "audit_reports",
  "assistant",
  "connectors",
  "vendor",
  "communication",
  "resources",
  "budget",
  "output_rendering",
  "organization",
]

describe("STAMMDATEN_SECTIONS", () => {
  it("only declares requiresModule where a server gate exists", () => {
    // Kept in lockstep with `requireModuleActive` call sites. Adding a key
    // here is a claim about the server, so this list is pinned exactly: a new
    // entry has to be argued for, not slipped in.
    //
    // Counting call sites is *not* enough to justify an entry, which is how
    // `organization` stayed wrong for three months — it had one gated route
    // (the CSV import) and eleven ungated ones, so any grep for the key found
    // a hit. PROJ-Y-143n gated all twelve handlers; hence the fourth line.
    const gated = STAMMDATEN_SECTIONS.filter((s) => s.requiresModule).map(
      (s) => [s.href, s.requiresModule],
    )
    expect(gated).toEqual([
      ["/stammdaten/resources", "resources"],
      // PROJ-45-α — the catalog routes call requireModuleActive("construction"),
      // so the tile may honestly claim the gate.
      ["/stammdaten/gewerke", "construction"],
      ["/stammdaten/vendors", "vendor"],
      // PROJ-Y-143n — all 12 handlers behind /stammdaten/organisation (units,
      // tree, combobox, locations, landscape, move) now gate on the key.
      ["/stammdaten/organisation", "organization"],
    ])
  })

  it("has a unique href per tile", () => {
    const hrefs = STAMMDATEN_SECTIONS.map((s) => s.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("resolveStammdatenSections", () => {
  it("never drops a tile, whatever the module state", () => {
    for (const active of [ALL_MODULES, [] as ModuleKey[]]) {
      const resolved = resolveStammdatenSections(settings(active))
      expect(resolved).toHaveLength(STAMMDATEN_SECTIONS.length)
      expect(resolved.map((s) => s.href)).toEqual(
        STAMMDATEN_SECTIONS.map((s) => s.href),
      )
    }
  })

  it("flags exactly the tile whose module is off", () => {
    const withoutResources = ALL_MODULES.filter((m) => m !== "resources")
    const resolved = resolveStammdatenSections(settings(withoutResources))

    expect(resolved.find(bySlug("resources"))?.moduleInactive).toBe(true)
    expect(resolved.find(bySlug("vendors"))?.moduleInactive).toBe(false)
    expect(resolved.filter((s) => s.moduleInactive)).toHaveLength(1)
  })

  it("flags every gated tile when all of their modules are off", () => {
    const resolved = resolveStammdatenSections(
      settings(["risks", "decisions", "ai_proposals", "audit_reports"]),
    )
    expect(resolved.filter((s) => s.moduleInactive).map((s) => s.href)).toEqual([
      "/stammdaten/resources",
      "/stammdaten/gewerke",
      "/stammdaten/vendors",
      "/stammdaten/organisation",
    ])
  })

  it("keeps the organisation tile a link while its module is on", () => {
    // PROJ-Y-143n — the tile is admin-only *and* module-gated, the first in
    // this grid to be both. Neither flag may swallow the other: with the
    // module on the tile must stay navigable for an admin.
    const resolved = resolveStammdatenSections(settings(["organization"]))
    const organisation = resolved.find(bySlug("organisation"))
    expect(organisation?.moduleInactive).toBe(false)
    expect(organisation?.adminOnly).toBe(true)
  })

  it("leaves core master data untouched when every module is off", () => {
    const resolved = resolveStammdatenSections(settings([]))
    const core = resolved.filter((s) => !s.requiresModule)

    expect(core.length).toBeGreaterThan(0)
    expect(core.every((s) => s.moduleInactive === false)).toBe(true)
  })

  it("fails open while settings are missing, like isModuleActive", () => {
    // A brief "half your workspace is switched off" flash during load would
    // be worse than briefly over-promising: the gate still answers 404.
    for (const s of [null, undefined]) {
      const resolved = resolveStammdatenSections(s)
      expect(resolved.some((x) => x.moduleInactive)).toBe(false)
    }
  })

  it("keeps adminOnly orthogonal to the module flag", () => {
    const resolved = resolveStammdatenSections(settings([]))
    // Resources is module-gated and *not* admin-only; skills is admin-only
    // and not module-gated. Neither flag may bleed into the other.
    const resources = resolved.find(bySlug("resources"))
    expect(resources?.moduleInactive).toBe(true)
    expect(resources?.adminOnly ?? false).toBe(false)

    const skills = resolved.find(bySlug("skills"))
    expect(skills?.moduleInactive).toBe(false)
    expect(skills?.adminOnly).toBe(true)
  })

  it("accepts an injected section list so the rule is testable in isolation", () => {
    const fixture: StammdatenSection[] = [
      {
        href: "/x",
        icon: () => null,
        title: "X",
        description: "d",
        requiresModule: "budget",
      },
    ]
    expect(
      resolveStammdatenSections(settings(["risks"]), fixture)[0].moduleInactive,
    ).toBe(true)
    expect(
      resolveStammdatenSections(settings(["budget"]), fixture)[0]
        .moduleInactive,
    ).toBe(false)
  })
})
