import { describe, expect, it } from "vitest"

import type { AiRunReasonCode } from "@/lib/ai/types"
import { reasonCodeToBanner } from "./reason-code-banner"

const AI_PROVIDERS_SETTINGS = "/settings/tenant/ai-providers"

describe("reasonCodeToBanner (PROJ-137 AC-4 / Decision D)", () => {
  it("maps no_provider to a config-actionable banner", () => {
    const banner = reasonCodeToBanner("no_provider")
    expect(banner?.title).toBe("Kein KI-Provider konfiguriert")
    expect(banner?.action?.href).toBe(AI_PROVIDERS_SETTINGS)
  })

  it("maps class3_blocked to a config-actionable banner", () => {
    const banner = reasonCodeToBanner("class3_blocked")
    expect(banner?.title).toBe(
      "Personenbezogene Daten erfordern einen lokalen Provider",
    )
    expect(banner?.action?.href).toBe(AI_PROVIDERS_SETTINGS)
  })

  it("maps cost_cap_exceeded to a config-actionable banner", () => {
    const banner = reasonCodeToBanner("cost_cap_exceeded")
    expect(banner?.title).toBe("Monatliches KI-Budget erreicht")
    expect(banner?.action?.href).toBe(AI_PROVIDERS_SETTINGS)
  })

  it("maps provider_error to a banner WITHOUT an action (transient)", () => {
    const banner = reasonCodeToBanner("provider_error")
    expect(banner?.title).toBe("KI-Dienst aktuell nicht erreichbar")
    expect(banner?.action).toBeUndefined()
  })

  it("maps external_ai_disabled to a banner WITHOUT an action (env kill-switch)", () => {
    const banner = reasonCodeToBanner("external_ai_disabled")
    expect(banner?.title).toBe("KI-Funktionen sind deaktiviert")
    expect(banner?.action).toBeUndefined()
  })

  it("returns null for null (provider ran → normal empty view, AC-6)", () => {
    expect(reasonCodeToBanner(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(reasonCodeToBanner(undefined)).toBeNull()
  })

  it("the three config-actionable codes all link to the AI-providers settings", () => {
    const actionable: AiRunReasonCode[] = [
      "no_provider",
      "class3_blocked",
      "cost_cap_exceeded",
    ]
    for (const code of actionable) {
      expect(reasonCodeToBanner(code)?.action?.href).toBe(
        AI_PROVIDERS_SETTINGS,
      )
    }
  })

  it("every reason code yields a non-null banner with a title", () => {
    const allCodes: AiRunReasonCode[] = [
      "no_provider",
      "class3_blocked",
      "provider_error",
      "cost_cap_exceeded",
      "external_ai_disabled",
    ]
    for (const code of allCodes) {
      const banner = reasonCodeToBanner(code)
      expect(banner).not.toBeNull()
      expect(banner?.title.length).toBeGreaterThan(0)
      expect(banner?.body.length).toBeGreaterThan(0)
    }
  })
})
