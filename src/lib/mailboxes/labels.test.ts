import { describe, expect, it } from "vitest"

import {
  HOST_ERROR_LABELS,
  PROVIDER_LABELS,
  STATUS_PRESENTATION,
  describeLastCheck,
} from "./labels"
import { MAILBOX_PROVIDERS } from "./validation"

describe("PROJ-158 — jede Kennung hat einen Satz", () => {
  it("kennt alle drei Anbieter", () => {
    // Totaler Record: ein neuer Anbieter kompiliert nicht, bis er einen Text
    // hat. Der Test haelt zusaetzlich fest, dass keiner leer bleibt.
    for (const p of MAILBOX_PROVIDERS) {
      expect(PROVIDER_LABELS[p]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("gibt jedem Zustand einen Ton und einen Text", () => {
    for (const [status, p] of Object.entries(STATUS_PRESENTATION)) {
      expect(p.label.length, status).toBeGreaterThan(0)
      expect(["neutral", "success", "warning", "danger"]).toContain(p.tone)
    }
  })

  it("gibt jedem Fehlerzustand einen naechsten Schritt — ausser dem Erfolg", () => {
    // „Verbunden" braucht keinen Hinweis; alles andere schon, sonst weiss der
    // Nutzer nicht, was er tun soll.
    for (const [status, p] of Object.entries(STATUS_PRESENTATION)) {
      if (status === "connected") {
        expect(p.hint).toBeUndefined()
      } else {
        expect(p.hint?.length ?? 0, status).toBeGreaterThan(0)
      }
    }
  })

  it("unterscheidet abgeschaltetes IMAP klar von einem Anmeldefehler", () => {
    // Der praktisch wichtigste Fall: ohne eigene Meldung sucht man beim
    // Passwort, obwohl der Zugang serverseitig aus ist.
    const disabled = STATUS_PRESENTATION.mailbox_disabled
    const auth = STATUS_PRESENTATION.auth_failed
    expect(disabled.label).not.toBe(auth.label)
    expect(disabled.hint).toContain("Passwort")
    expect(disabled.hint).toContain("Anbieter")
  })

  it("erklaert bei einer internen Adresse, was zu tun ist", () => {
    expect(HOST_ERROR_LABELS.host_reserved).toContain("interne")
    expect(HOST_ERROR_LABELS.host_malformed).toContain("https://")
  })
})

describe("PROJ-158 — der Zustand wird nie ohne Zeitpunkt gezeigt", () => {
  it("benennt „noch nie geprueft\" statt eines leeren Feldes", () => {
    expect(describeLastCheck(null)).toBe("noch nie geprüft")
  })

  it("nennt Datum und Uhrzeit", () => {
    const text = describeLastCheck("2026-09-01T08:30:00.000Z")
    expect(text).toContain("zuletzt geprüft am")
    expect(text).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/)
  })

  it("faellt bei kaputtem Zeitstempel nicht auf ein erfundenes Datum zurueck", () => {
    expect(describeLastCheck("keine-zeit")).toBe("Prüfzeitpunkt unbekannt")
  })
})
