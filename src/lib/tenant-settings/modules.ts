/**
 * PROJ-17 — module gating helpers.
 *
 * UI components and API routes call `isModuleActive(settings, key)` to
 * decide whether a feature surface should be visible / callable. The
 * helper short-circuits sensibly when the settings object is missing
 * (e.g. during initial render or for tenants that pre-date PROJ-17 if
 * the backfill missed them) — defaulting to "active" so the platform
 * stays usable.
 */

import type { ModuleKey, TenantSettings } from "@/types/tenant-settings"
import { TOGGLEABLE_MODULES } from "@/types/tenant-settings"

/**
 * Returns true if the module is enabled for the tenant. Modules that are
 * not in the `active_modules` list are considered disabled — *unless*
 * the settings object is missing entirely, in which case we fail open
 * (UI doesn't suddenly hide everything because of a transient load).
 */
export function isModuleActive(
  settings: TenantSettings | null | undefined,
  module: ModuleKey
): boolean {
  if (!settings) return true
  return settings.active_modules.includes(module)
}

/**
 * Returns the set of toggleable modules that are currently active. Used
 * by the settings UI to render the Switches.
 */
export function activeToggleableModules(
  settings: TenantSettings | null | undefined
): ModuleKey[] {
  if (!settings) return [...TOGGLEABLE_MODULES]
  return TOGGLEABLE_MODULES.filter((m) =>
    settings.active_modules.includes(m)
  )
}
