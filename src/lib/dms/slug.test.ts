import { describe, expect, it } from "vitest"

import { dedupeFilename, dedupeName, slugify } from "./slug"

describe("slugify", () => {
  it("kebab-cases and lowercases", () => {
    expect(slugify("Due Diligence Reports")).toBe("due-diligence-reports")
  })
  it("collapses runs of punctuation to single hyphens", () => {
    expect(slugify("Legal & Tax // 2026!!")).toBe("legal-tax-2026")
  })
  it("strips leading/trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello")
  })
  it("folds diacritics", () => {
    expect(slugify("Übergabe Größe")).toBe("ubergabe-grosse")
  })
  it("falls back to 'untitled' for punctuation-only input", () => {
    expect(slugify("***")).toBe("untitled")
  })
  it("caps length at 200 chars without trailing hyphen", () => {
    const s = slugify("a".repeat(250))
    expect(s.length).toBeLessThanOrEqual(200)
    expect(s.endsWith("-")).toBe(false)
  })
})

describe("dedupeName", () => {
  it("returns base name when slug is free", () => {
    expect(dedupeName("Contracts", [])).toEqual({
      name: "Contracts",
      slug: "contracts",
    })
  })
  it("bumps to (2) on collision", () => {
    expect(dedupeName("Contracts", ["contracts"])).toEqual({
      name: "Contracts (2)",
      slug: "contracts-2",
    })
  })
  it("skips taken suffixes to the next free one", () => {
    expect(dedupeName("Contracts", ["contracts", "contracts-2"])).toEqual({
      name: "Contracts (3)",
      slug: "contracts-3",
    })
  })
  it("trims the base name before slugging", () => {
    expect(dedupeName("  Reports  ", [])).toEqual({
      name: "Reports",
      slug: "reports",
    })
  })
})

describe("dedupeFilename", () => {
  it("keeps the filename when free", () => {
    expect(dedupeFilename("report.pdf", [])).toEqual({
      name: "report.pdf",
      slug: "report-pdf",
    })
  })
  it("inserts the (2) suffix before the extension", () => {
    expect(dedupeFilename("report.pdf", ["report-pdf"])).toEqual({
      name: "report (2).pdf",
      slug: "report-2-pdf",
    })
  })
  it("handles extensionless filenames", () => {
    expect(dedupeFilename("README", ["readme"])).toEqual({
      name: "README (2)",
      slug: "readme-2",
    })
  })
})
