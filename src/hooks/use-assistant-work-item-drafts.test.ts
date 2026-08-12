/**
 * PROJ-144 — Fehlerübersetzung und Mutatoren der Entwurfsliste.
 *
 * Die Routen antworten auf Englisch (Entwicklersicht, Logs), die Oberfläche ist
 * deutsch. Übersetzt wird deshalb über den stabilen `code`, nicht über die
 * Meldung — ein durchgereichtes „Kind 'story' is not visible in method
 * 'waterfall'." hilft im Meeting niemandem. Diese Tests pinnen die Zuordnung,
 * damit ein umbenannter Code nicht still auf den Sammelfall zurückfällt.
 *
 * Besonders wichtig ist `draft_not_open` (HTTP 409): das ist der Doppelklick-
 * bzw. Zweiter-Tab-Fall. Er darf nicht wie ein technischer Fehlschlag klingen,
 * denn das Work-Item ist in dem Moment bereits angelegt.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { messageForDraftError } from "./use-assistant-work-item-drafts"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("messageForDraftError", () => {
  it("erklärt den verbrauchten Entwurf statt von einem Fehler zu sprechen", () => {
    expect(messageForDraftError("draft_not_open", 409)).toBe(
      "Dieser Entwurf wurde bereits verwendet oder wird gerade angelegt.",
    )
  })

  it("benennt fehlendes Schreibrecht konkret", () => {
    expect(messageForDraftError("forbidden", 403)).toBe(
      "Dir fehlt das Schreibrecht in diesem Projekt.",
    )
  })

  it("übersetzt die Methoden-Verletzung fachlich", () => {
    expect(messageForDraftError("method_violation", 422)).toBe(
      "Diese Art passt nicht zur Methode des Projekts.",
    )
  })

  it("führt beide Eltern-Codes auf dieselbe Handlungsanweisung", () => {
    const expected =
      "Dieses Element braucht ein übergeordnetes Element — bitte im Backlog anlegen."
    expect(messageForDraftError("invalid_parent", 422)).toBe(expected)
    expect(messageForDraftError("invalid_parent_kind", 422)).toBe(expected)
  })

  it("nennt beim unbekannten Code wenigstens den Status", () => {
    expect(messageForDraftError("something_new", 500)).toBe(
      "Anlage fehlgeschlagen (HTTP 500).",
    )
    expect(messageForDraftError(undefined, 502)).toBe(
      "Anlage fehlgeschlagen (HTTP 502).",
    )
  })
})
