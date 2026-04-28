/**
 * PROJ-3 — operation-mode and AI-block configuration.
 *
 * Two server-side env switches that shape deployment topology:
 *
 *   OPERATION_MODE         "shared" | "standalone"   (default: "shared")
 *   EXTERNAL_AI_DISABLED   "true"   | anything else  (default: false)
 *
 * Read at boot in server components / route handlers; the resolved value is
 * passed down to client components as plain props (we don't expose either
 * variable via NEXT_PUBLIC_ — neither is needed in the browser, and the AI
 * block is security-relevant).
 *
 * Defaults are deliberate: a missing or empty env var must not change the
 * behaviour of an already-running SaaS deployment.
 */

export type OperationMode = "shared" | "standalone"

export const OPERATION_MODES: readonly OperationMode[] = [
  "shared",
  "standalone",
] as const

/**
 * Resolve the deployment mode. Anything other than the literal `"standalone"`
 * (case-insensitive, trimmed) resolves to `"shared"` so that typos and empty
 * values fail safely toward the SaaS default.
 */
export function getOperationMode(): OperationMode {
  const raw = process.env.OPERATION_MODE?.trim().toLowerCase() ?? ""
  return raw === "standalone" ? "standalone" : "shared"
}

export function isStandalone(): boolean {
  return getOperationMode() === "standalone"
}

/**
 * Hard kill-switch for outbound calls to external LLM providers. PROJ-12
 * will check this before loading any external provider. Independent of the
 * operation mode: a SaaS tenant can also opt-in to the block for
 * compliance reasons. Class-3 redaction (PROJ-12) remains the primary
 * defense; this is the second, blanket layer.
 */
export function isExternalAIBlocked(): boolean {
  return process.env.EXTERNAL_AI_DISABLED?.trim().toLowerCase() === "true"
}

/**
 * One-shot snapshot for passing to client components that need both flags
 * at once (e.g. a future PROJ-12 KI-tab needs to know the AI block; the
 * tenant switcher needs to know the mode).
 */
export interface OperationModeSnapshot {
  mode: OperationMode
  externalAiBlocked: boolean
}

export function getOperationModeSnapshot(): OperationModeSnapshot {
  return {
    mode: getOperationMode(),
    externalAiBlocked: isExternalAIBlocked(),
  }
}
