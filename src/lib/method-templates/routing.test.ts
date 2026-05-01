import { describe, expect, it } from "vitest"
import { LayoutDashboard } from "lucide-react"

import type { SidebarSection } from "@/types/method-config"
import type { TenantSettings } from "@/types/tenant-settings"

import { getMethodConfig } from "./index"
import {
  filterSectionsByModules,
  getCanonicalSlug,
  getMethodSlug,
  getProjectSectionHref,
  isSectionActive,
  parseSectionFromPathname,
  resolveMethodAwareRedirect,
} from "./routing"

const PROJECT_ID = "00000000-0000-0000-0000-000000000001"
const PREFIX = `/projects/${PROJECT_ID}`

describe("getMethodSlug", () => {
  it("returns the tabPath when no routeSlug override is set", () => {
    expect(getMethodSlug("backlog", "scrum")).toBe("backlog")
  })

  it("returns the routeSlug override when set on the method", () => {
    expect(getMethodSlug("releases", "scrum")).toBe("releases")
    expect(getMethodSlug("releases", "safe")).toBe("releases")
    expect(getMethodSlug("phases", "waterfall")).toBe("phasen")
    expect(getMethodSlug("phases", "pmi")).toBe("phasen")
    expect(getMethodSlug("phases", "prince2")).toBe("phasen")
    expect(getMethodSlug("phases", "vxt2")).toBe("phasen")
    expect(getMethodSlug("work-packages", "waterfall")).toBe("arbeitspakete")
    expect(getMethodSlug("work-packages", "pmi")).toBe("arbeitspakete")
    expect(getMethodSlug("work-packages", "prince2")).toBe("arbeitspakete")
  })

  it("returns null for a section the method does not declare", () => {
    expect(getMethodSlug("phases", "scrum")).toBeNull()
    expect(getMethodSlug("backlog", "waterfall")).toBeNull()
    expect(getMethodSlug("releases", "waterfall")).toBeNull()
  })

  it("returns the empty string for the overview section (root URL)", () => {
    expect(getMethodSlug("overview", "scrum")).toBe("")
  })

  it("uses the neutral fallback when method is null", () => {
    expect(getMethodSlug("backlog", null)).toBe("backlog")
    expect(getMethodSlug("planning", null)).toBe("planung")
  })
})

describe("getCanonicalSlug", () => {
  it("always returns the tabPath, ignoring any routeSlug", () => {
    expect(getCanonicalSlug("backlog", "scrum")).toBe("backlog")
  })

  it("returns the canonical (folder) slug for sections with a routeSlug alias", () => {
    expect(getCanonicalSlug("work-packages", "waterfall")).toBe("backlog")
    expect(getCanonicalSlug("phases", "waterfall")).toBe("planung")
    expect(getCanonicalSlug("releases", "scrum")).toBe("planung")
  })

  it("returns null for unknown section in method", () => {
    expect(getCanonicalSlug("nope", "scrum")).toBeNull()
  })
})

describe("getProjectSectionHref", () => {
  it("returns /projects/[id] for the overview section", () => {
    expect(getProjectSectionHref(PROJECT_ID, "overview", "scrum")).toBe(PREFIX)
  })

  it("returns /projects/[id]/<slug> for a regular section", () => {
    expect(getProjectSectionHref(PROJECT_ID, "backlog", "scrum")).toBe(
      `${PREFIX}/backlog`,
    )
  })

  it("uses the routeSlug alias when present", () => {
    expect(getProjectSectionHref(PROJECT_ID, "phases", "waterfall")).toBe(
      `${PREFIX}/phasen`,
    )
    expect(getProjectSectionHref(PROJECT_ID, "work-packages", "waterfall")).toBe(
      `${PREFIX}/arbeitspakete`,
    )
    expect(getProjectSectionHref(PROJECT_ID, "releases", "scrum")).toBe(
      `${PREFIX}/releases`,
    )
  })

  it("returns /projects/[id] as a fallback for unknown sections", () => {
    expect(getProjectSectionHref(PROJECT_ID, "made-up-section", "scrum")).toBe(
      PREFIX,
    )
  })

  it("uses neutral fallback when method is null", () => {
    expect(getProjectSectionHref(PROJECT_ID, "backlog", null)).toBe(
      `${PREFIX}/backlog`,
    )
  })
})

describe("parseSectionFromPathname", () => {
  it("returns 'overview' for the bare project root", () => {
    expect(parseSectionFromPathname(PREFIX, PROJECT_ID, "scrum")).toBe(
      "overview",
    )
  })

  it("returns 'overview' for the project root with trailing slash", () => {
    expect(parseSectionFromPathname(`${PREFIX}/`, PROJECT_ID, "scrum")).toBe(
      "overview",
    )
  })

  it("resolves a canonical slug to the matching section in the active method", () => {
    expect(
      parseSectionFromPathname(`${PREFIX}/backlog`, PROJECT_ID, "scrum"),
    ).toBe("backlog")
  })

  it("resolves a sub-route under a section (deeper path)", () => {
    expect(
      parseSectionFromPathname(
        `${PREFIX}/backlog/abc-item-id`,
        PROJECT_ID,
        "scrum",
      ),
    ).toBe("backlog")
  })

  it("ignores query strings and hash fragments", () => {
    expect(
      parseSectionFromPathname(
        `${PREFIX}/backlog?phase=p1#deep`,
        PROJECT_ID,
        "scrum",
      ),
    ).toBe("backlog")
  })

  it("returns null when the pathname is not under /projects/[id]", () => {
    expect(parseSectionFromPathname("/dashboard", PROJECT_ID, "scrum")).toBeNull()
  })

  it("returns null for an unknown slug", () => {
    expect(
      parseSectionFromPathname(`${PREFIX}/totally-unknown`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("falls back to a global scan for slugs the active method doesn't declare", () => {
    // PRINCE2 has the `governance` section; when a Scrum project is
    // somehow on /governance (stale URL pre-method-change), the global
    // scan still resolves the section id so the active-state lights up
    // until middleware redirects.
    expect(
      parseSectionFromPathname(`${PREFIX}/governance`, PROJECT_ID, "scrum"),
    ).toBe("approvals")
  })

  it("disambiguates the `planung` slug per active method (Scrum vs Waterfall)", () => {
    expect(
      parseSectionFromPathname(`${PREFIX}/planung`, PROJECT_ID, "scrum"),
    ).toBe("releases")
    expect(
      parseSectionFromPathname(`${PREFIX}/planung`, PROJECT_ID, "waterfall"),
    ).toBe("phases")
  })

  it("resolves a method-specific routeSlug to its section id", () => {
    expect(
      parseSectionFromPathname(`${PREFIX}/arbeitspakete`, PROJECT_ID, "waterfall"),
    ).toBe("work-packages")
    expect(
      parseSectionFromPathname(`${PREFIX}/phasen`, PROJECT_ID, "waterfall"),
    ).toBe("phases")
    expect(
      parseSectionFromPathname(`${PREFIX}/releases`, PROJECT_ID, "scrum"),
    ).toBe("releases")
  })

  it("global-scans foreign-method aliases when active method does not declare them", () => {
    // /arbeitspakete in a Scrum project — Scrum has no work-packages
    // section; the global scan finds it in Waterfall and returns the
    // section id so active-state still resolves until middleware
    // 308-redirects.
    expect(
      parseSectionFromPathname(`${PREFIX}/arbeitspakete`, PROJECT_ID, "scrum"),
    ).toBe("work-packages")
  })
})

describe("isSectionActive", () => {
  it("matches the canonical slug to its section id", () => {
    expect(
      isSectionActive(`${PREFIX}/backlog`, PROJECT_ID, "backlog", "scrum"),
    ).toBe(true)
  })

  it("returns false when the section ids differ", () => {
    expect(
      isSectionActive(`${PREFIX}/backlog`, PROJECT_ID, "stakeholder", "scrum"),
    ).toBe(false)
  })

  it("matches overview at the root URL", () => {
    expect(
      isSectionActive(PREFIX, PROJECT_ID, "overview", "scrum"),
    ).toBe(true)
  })

  it("does not bleed across projects", () => {
    expect(
      isSectionActive(
        `/projects/00000000-0000-0000-0000-000000000002/backlog`,
        PROJECT_ID,
        "backlog",
        "scrum",
      ),
    ).toBe(false)
  })
})

describe("filterSectionsByModules", () => {
  const overview: SidebarSection = {
    id: "overview",
    label: "Übersicht",
    icon: LayoutDashboard,
    tabPath: "",
  }
  const risks: SidebarSection = {
    id: "risks",
    label: "Risiken",
    icon: LayoutDashboard,
    tabPath: "risiken",
    requiresModule: "risks",
  }
  const budget: SidebarSection = {
    id: "budget",
    label: "Budget",
    icon: LayoutDashboard,
    tabPath: "budget",
    requiresModule: "budget",
  }
  const sections = [overview, risks, budget]

  function settingsWith(active: TenantSettings["active_modules"]): TenantSettings {
    return {
      tenant_id: "t",
      active_modules: active,
      privacy_defaults: { default_class: 1 },
      ai_provider_config: { external_provider: "none" },
      retention_overrides: {},
      budget_settings: { default_currency: "EUR" },
      output_rendering_settings: { ki_narrative_enabled: false },
      created_at: "",
      updated_at: "",
    }
  }

  it("keeps sections without a requiresModule gate", () => {
    const result = filterSectionsByModules([overview], settingsWith([]))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("overview")
  })

  it("filters out sections whose required module is inactive", () => {
    const result = filterSectionsByModules(
      sections,
      settingsWith(["risks"]),
    )
    expect(result.map((s) => s.id)).toEqual(["overview", "risks"])
  })

  it("keeps everything when settings is null (fail-open)", () => {
    const result = filterSectionsByModules(sections, null)
    expect(result.map((s) => s.id)).toEqual(["overview", "risks", "budget"])
  })

  it("keeps everything when settings is undefined (fail-open)", () => {
    const result = filterSectionsByModules(sections, undefined)
    expect(result).toHaveLength(3)
  })
})

describe("resolveMethodAwareRedirect", () => {
  it("returns null for non-project pathnames", () => {
    expect(resolveMethodAwareRedirect("/dashboard", PROJECT_ID, "scrum")).toBeNull()
  })

  it("returns null for the project root", () => {
    expect(resolveMethodAwareRedirect(PREFIX, PROJECT_ID, "scrum")).toBeNull()
  })

  it("returns null when the slug already matches the method", () => {
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/backlog`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("returns null for unknown slugs (no section)", () => {
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/some-bogus`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("redirects canonical slug to the method's routeSlug", () => {
    const r = resolveMethodAwareRedirect(
      `${PREFIX}/backlog`,
      PROJECT_ID,
      "waterfall",
    )
    expect(r).not.toBeNull()
    expect(r?.fromSlug).toBe("backlog")
    expect(r?.toSlug).toBe("arbeitspakete")
    expect(r?.destination).toBe(`${PREFIX}/arbeitspakete`)
    expect(r?.sectionId).toBe("work-packages")
  })

  it("redirects /planung to /releases in a Scrum project", () => {
    const r = resolveMethodAwareRedirect(
      `${PREFIX}/planung`,
      PROJECT_ID,
      "scrum",
    )
    expect(r?.toSlug).toBe("releases")
    expect(r?.destination).toBe(`${PREFIX}/releases`)
  })

  it("redirects foreign-method alias back to the active method's slug", () => {
    // /arbeitspakete in a Scrum project → Scrum has section
    // "work-packages"? No — Scrum's sidebarSections has no
    // "work-packages" entry. So Scrum has no slug to redirect TO; the
    // helper returns null. The middleware will then 404 (or fall
    // through to the canonical Backlog page if such a route exists).
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/arbeitspakete`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("does not redirect when slug equals routeSlug", () => {
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/arbeitspakete`, PROJECT_ID, "waterfall"),
    ).toBeNull()
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/releases`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("preserves query and hash through the redirect destination", () => {
    const r = resolveMethodAwareRedirect(
      `${PREFIX}/backlog`,
      PROJECT_ID,
      "waterfall",
      "?phase=p1",
    )
    expect(r?.destination).toBe(`${PREFIX}/arbeitspakete?phase=p1`)
  })

  it("preserves sub-paths under the section through the redirect", () => {
    const r = resolveMethodAwareRedirect(
      `${PREFIX}/backlog/some-item-id`,
      PROJECT_ID,
      "waterfall",
    )
    expect(r?.destination).toBe(`${PREFIX}/arbeitspakete/some-item-id`)
  })
})

describe("module-gating matrix (8 methods × 6 modules)", () => {
  const ALL_MODULES = [
    "risks",
    "decisions",
    "ai_proposals",
    "communication",
    "vendor",
    "budget",
  ] as const

  const ALL_METHODS = [
    "scrum",
    "safe",
    "kanban",
    "waterfall",
    "pmi",
    "prince2",
    "vxt2",
    null,
  ] as const

  function settingsWith(active: readonly string[]): TenantSettings {
    return {
      tenant_id: "t",
      active_modules: active as TenantSettings["active_modules"],
      privacy_defaults: { default_class: 1 },
      ai_provider_config: { external_provider: "none" },
      retention_overrides: {},
      budget_settings: { default_currency: "EUR" },
      output_rendering_settings: { ki_narrative_enabled: false },
      created_at: "",
      updated_at: "",
    }
  }

  // End-to-end matrix: for every method × module pair, toggling the
  // module off via filterSectionsByModules drops exactly the section
  // gated by that module from the rendered sidebar list. Verifies the
  // chain method-template → SidebarSection.requiresModule → filter.
  for (const method of ALL_METHODS) {
    const methodLabel = method ?? "null"
    const config = getMethodConfig(method)

    for (const moduleKey of ALL_MODULES) {
      it(`${methodLabel} template: ${moduleKey} module gates exactly its section`, () => {
        const allOn = filterSectionsByModules(
          config.sidebarSections,
          settingsWith(ALL_MODULES),
        )
        const off = filterSectionsByModules(
          config.sidebarSections,
          settingsWith(ALL_MODULES.filter((m) => m !== moduleKey)),
        )
        const dropped = allOn.filter((s) => !off.includes(s))
        // Every method template must declare the gated section.
        expect(dropped).toHaveLength(1)
        expect(dropped[0].requiresModule).toBe(moduleKey)
      })
    }

    it(`${methodLabel} template: every PROJ-17 module is represented exactly once`, () => {
      const required = config.sidebarSections
        .map((s) => s.requiresModule)
        .filter((m): m is (typeof ALL_MODULES)[number] => m != null)
      // Deduplication check.
      expect(new Set(required).size).toBe(required.length)
      // Coverage check — every PROJ-17 module appears.
      for (const m of ALL_MODULES) {
        expect(required, `${methodLabel} must gate ${m}`).toContain(m)
      }
    })
  }
})
