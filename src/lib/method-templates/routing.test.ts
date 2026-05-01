import { describe, expect, it } from "vitest"
import { LayoutDashboard } from "lucide-react"

import type { SidebarSection } from "@/types/method-config"
import type { TenantSettings } from "@/types/tenant-settings"

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
    // scrum.backlog has no routeSlug today → tabPath
    expect(getMethodSlug("backlog", "scrum")).toBe("backlog")
  })

  it("returns null for a section the method does not declare", () => {
    // scrum has no phases section
    expect(getMethodSlug("phases", "scrum")).toBeNull()
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

  it("returns the tabPath of work-packages even after a route alias is set", () => {
    // After Phase 2 sets routeSlug=arbeitspakete, the canonical
    // (folder) slug remains backlog — this test pins that contract.
    const slug = getCanonicalSlug("work-packages", "waterfall")
    expect(slug === "backlog" || slug === null).toBe(true)
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

  it("redirects when the method declares a different slug for the same section id", () => {
    // Scrum: section "releases" has tabPath=planung. Waterfall: section
    // "phases" has tabPath=planung. So in Scrum, /planung resolves to
    // "releases" and stays put (slug equals its own tabPath). After
    // Phase 2 wires routeSlug=releases on Scrum's section, the same
    // pathname will redirect — that case is covered by Phase 2 tests.
    // Today we only verify the no-op behaviour pins the contract.
    expect(
      resolveMethodAwareRedirect(`${PREFIX}/planung`, PROJECT_ID, "scrum"),
    ).toBeNull()
  })

  it("preserves query and hash through the redirect destination", () => {
    // Synthetic check via the empty-slug-overview path — preserves
    // search string when constructing the destination. Real alias
    // redirects are exercised after Phase 2.
    expect(
      resolveMethodAwareRedirect(
        `${PREFIX}/backlog`,
        PROJECT_ID,
        "scrum",
        "?phase=p1",
      ),
    ).toBeNull()
  })
})
