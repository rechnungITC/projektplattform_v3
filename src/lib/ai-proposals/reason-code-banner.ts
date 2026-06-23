import type { AiRunReasonCode } from "@/lib/ai/types"

/**
 * PROJ-137 AC-4 / Decision D — single source for the actionable banner
 * that surfaces a machine-readable `ki_runs.reason_code` in the
 * AIProposalDrawer tabs (Backlog / Stakeholder / Risiken).
 *
 * The router returns `reason_code` on every generate response:
 *   - one of the `AiRunReasonCode` values when no/blocked output, or
 *   - `null`/`undefined` when a provider actually ran (incl. a
 *     legitimately-empty result) — that stays the normal empty view
 *     (AC-6), so this util returns `null` for it.
 */

export interface ReasonCodeBanner {
  title: string
  body: string
  /** Omitted when no config action helps (transient service issue or
   *  env kill-switch the tenant admin can't change). */
  action?: { label: string; href: string }
}

const AI_PROVIDERS_SETTINGS = "/settings/tenant/ai-providers"

/** PROJ-137 AC-4: map a machine-readable run reason to an actionable banner.
 *  Returns null for null/undefined (provider ran → normal empty view, AC-6). */
export function reasonCodeToBanner(
  code: AiRunReasonCode | null | undefined,
): ReasonCodeBanner | null {
  switch (code) {
    case "no_provider":
      return {
        title: "Kein KI-Provider konfiguriert",
        body: "Für diesen Lauf war kein KI-Provider verfügbar. Bitte einen Provider-Key hinterlegen.",
        action: {
          label: "Einstellungen → KI-Provider",
          href: AI_PROVIDERS_SETTINGS,
        },
      }
    case "class3_blocked":
      return {
        title: "Personenbezogene Daten erfordern einen lokalen Provider",
        body: "Der Kontext enthält Class-3-Daten, die die Plattform nicht verlassen dürfen. Bitte einen tenant-lokalen Provider (Ollama) hinterlegen.",
        action: {
          label: "Einstellungen → KI-Provider",
          href: AI_PROVIDERS_SETTINGS,
        },
      }
    case "provider_error":
      return {
        title: "KI-Dienst aktuell nicht erreichbar",
        body: "Der gewählte Provider hat nicht geantwortet (Timeout/Fehler). Bitte später erneut versuchen.",
        // no action: transient service issue, not a config problem
      }
    case "cost_cap_exceeded":
      return {
        title: "Monatliches KI-Budget erreicht",
        body: "Das konfigurierte Token-Budget für diesen Monat ist ausgeschöpft.",
        action: {
          label: "Einstellungen → KI-Provider",
          href: AI_PROVIDERS_SETTINGS,
        },
      }
    case "external_ai_disabled":
      return {
        title: "KI-Funktionen sind deaktiviert",
        body: "Externe KI ist in dieser Umgebung per Konfiguration deaktiviert (Admin-Hinweis).",
        // no action: env kill-switch, tenant admin can't change it
      }
    default:
      return null
  }
}