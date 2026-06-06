export const METHOD_AWARE_ROUTES_FLAG = "method_aware_routes"

/**
 * PROJ-28 retrofit: method-aware routing shipped before the tenant flag.
 * Missing settings therefore preserve existing production behavior; only an
 * explicit boolean false disables 308 redirects.
 */
export function isMethodAwareRoutesEnabled(featureFlags: unknown): boolean {
  if (
    featureFlags === null ||
    typeof featureFlags !== "object" ||
    Array.isArray(featureFlags)
  ) {
    return true
  }

  const value = (featureFlags as Record<string, unknown>)[
    METHOD_AWARE_ROUTES_FLAG
  ]
  return value !== false
}
