/**
 * PROJ-151-α — AC-151.11: eine leere Antwort muss einen Grund nennen.
 *
 * Der Test prüft ausdrücklich BEIDE Richtungen: dass ein Grund erscheint, wo
 * einer nötig ist — und dass bei einer echten Antwort KEINER erscheint. Ohne
 * die zweite Hälfte wäre ein Hinweis auf jeder Antwort ebenfalls „grün".
 */

import { describe, expect, it } from "vitest"

import { reasonToNotice } from "./reason-notice"

const ok = { status: "success", reason_code: null, answer_text: "Die Phase endet im Mai." }

describe("reasonToNotice", () => {
  it("schweigt bei einer echten Antwort", () => {
    expect(reasonToNotice(ok)).toBeNull()
  })

  it("nennt jeden bekannten Grund mit Titel und Erklärung", () => {
    const codes = [
      "no_provider",
      "class3_blocked",
      "cost_cap_exceeded",
      "provider_error",
      "external_ai_disabled",
    ]
    for (const code of codes) {
      const n = reasonToNotice({ status: "error", reason_code: code, answer_text: "" })
      expect(n, code).not.toBeNull()
      expect(n!.title.length, code).toBeGreaterThan(0)
      expect(n!.body.length, code).toBeGreaterThan(0)
    }
  })

  it("sagt bei Class-3 zu, dass NICHT extern gesendet wurde", () => {
    const n = reasonToNotice({ status: "external_blocked", reason_code: "class3_blocked", answer_text: "" })
    expect(n!.body).toMatch(/nie an ein externes|nur an ein lokales/i)
  })

  it("lässt eine leere Antwort ohne Grund nicht unkommentiert", () => {
    // Selten, aber Schweigen wäre hier schlimmer als eine unscharfe Meldung.
    const n = reasonToNotice({ status: "success", reason_code: null, answer_text: "   " })
    expect(n).not.toBeNull()
  })

  it("erfindet keinen Hinweis für einen unbekannten Grund bei vorhandener Antwort", () => {
    expect(
      reasonToNotice({ status: "success", reason_code: "etwas_neues", answer_text: "Text" }),
    ).toBeNull()
  })
})
