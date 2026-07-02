/**
 * PROJ-92 — Azure EU-region allowlist tests.
 *
 * Pins the exact allowed set (AC-92.2). If someone widens the list, this test
 * must be updated deliberately — that is the documented gate against silently
 * allowing a non-EU region.
 */

import { describe, expect, it } from "vitest"

import {
  AZURE_EU_REGIONS,
  isEuAzureRegion,
  normalizeAzureRegion,
} from "./azure-region-allowlist"

describe("PROJ-92 — Azure EU-region allowlist", () => {
  it("pins the exact allowed EU region set", () => {
    expect([...AZURE_EU_REGIONS].sort()).toEqual(
      ["germanywestcentral", "northeurope", "swedencentral", "westeurope"].sort(),
    )
  })

  it("accepts each allowed region", () => {
    for (const r of AZURE_EU_REGIONS) {
      expect(isEuAzureRegion(r), r).toBe(true)
    }
  })

  it("rejects common non-EU regions", () => {
    for (const r of [
      "eastus",
      "westus",
      "eastus2",
      "uksouth",
      "japaneast",
      "australiaeast",
      "switzerlandnorth", // EU-adjacent but NOT in the Data-Boundary allowlist
    ]) {
      expect(isEuAzureRegion(r), r).toBe(false)
    }
  })

  it("normalizes casing and whitespace before matching", () => {
    expect(isEuAzureRegion("  West Europe ")).toBe(true)
    expect(isEuAzureRegion("WESTEUROPE")).toBe(true)
    expect(normalizeAzureRegion("  Germany West Central ")).toBe(
      "germanywestcentral",
    )
  })

  it("rejects empty / garbage input", () => {
    expect(isEuAzureRegion("")).toBe(false)
    expect(isEuAzureRegion("   ")).toBe(false)
    expect(isEuAzureRegion("not-a-region")).toBe(false)
  })
})
