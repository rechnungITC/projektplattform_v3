/**
 * PROJ-92 — Azure OpenAI EU-region allowlist (CIA-locked as a server constant).
 *
 * Tenants may only register an Azure OpenAI resource whose region is in the
 * EU. This is a hard gate at save time: a non-EU region is refused and the
 * config is never persisted. The list is a deliberate server constant (not a
 * DB table) so it stays reviewable in code and cannot be widened by data.
 *
 * Update path: to add a region, extend AZURE_EU_REGIONS below, add it to the
 * allowlist test's expected set, and note the compliance rationale in the PR.
 * Keep this list to regions Microsoft documents as inside the EU Data Boundary.
 */

/** EU Azure regions permitted for Azure OpenAI resources. */
export const AZURE_EU_REGIONS = [
  "westeurope",
  "germanywestcentral",
  "northeurope",
  "swedencentral",
] as const

export type AzureEuRegion = (typeof AZURE_EU_REGIONS)[number]

/**
 * True iff `region` is an allowed EU Azure region. Case-insensitive and
 * whitespace-tolerant so that "West Europe" / " westeurope " normalize;
 * Azure region ids are lowercase, space-free, so we strip both.
 */
export function isEuAzureRegion(region: string): region is AzureEuRegion {
  const normalized = normalizeAzureRegion(region)
  return (AZURE_EU_REGIONS as readonly string[]).includes(normalized)
}

/** Normalize a user-entered region to the canonical Azure id form. */
export function normalizeAzureRegion(region: string): string {
  return region.trim().toLowerCase().replace(/\s+/g, "")
}
