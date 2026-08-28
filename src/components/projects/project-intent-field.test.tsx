/**
 * PROJ-153-α — Tests für das Vorhaben-Feld.
 *
 * Der Kern ist **eine Unterscheidung**, nicht ein Zähler: das Feld ist
 * optional, und der Hinweis muss sich wie ein Angebot lesen, nicht wie eine
 * Pflicht. Wer kein Vorhaben schreiben will, soll nicht das Gefühl bekommen,
 * ein Formular unvollständig zu lassen.
 *
 * Zweiter Kern: die Zahl wird **importiert, nicht abgeschrieben**. Eine zweite
 * Zahl im Frontend wäre stille Drift gegenüber dem serverseitigen Tor.
 */
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { INTENT_MIN_HUMAN_CHARS } from "@/lib/ai/intent-substance"

import {
  PROJECT_INTENT_LABEL,
  ProjectIntentField,
  describeIntentProgress,
} from "./project-intent-field"

describe("describeIntentProgress", () => {
  it("nennt beim leeren Feld nur die Möglichkeit, nicht den Rückstand", () => {
    // „0 von 400" würde ein leeres optionales Feld wie einen Fehler aussehen
    // lassen. Genau diese Verwechslung ist der Grund für zwei Textfassungen.
    const p = describeIntentProgress(0)
    expect(p.reached).toBe(false)
    expect(p.text).not.toMatch(/^0 von/)
    expect(p.text).toContain(String(INTENT_MIN_HUMAN_CHARS))
  })

  it("zeigt den Fortschritt, sobald jemand angefangen hat", () => {
    const p = describeIntentProgress(120)
    expect(p.text).toContain("120")
    expect(p.text).toContain(String(INTENT_MIN_HUMAN_CHARS))
    expect(p.reached).toBe(false)
  })

  it("wechselt die Aussage beim Erreichen — und nennt dann keine Zahl mehr", () => {
    const p = describeIntentProgress(INTENT_MIN_HUMAN_CHARS)
    expect(p.reached).toBe(true)
    expect(p.text).not.toContain(String(INTENT_MIN_HUMAN_CHARS))
  })

  it("nutzt die Schwelle des Servers, keine eigene Zahl", () => {
    // Gegenprobe gegen abgeschriebene Konstanten: eine Länge knapp UNTER der
    // importierten Schwelle darf nicht als erreicht gelten. Stünde im
    // Frontend eine andere Zahl, fiele genau dieser Fall.
    expect(describeIntentProgress(INTENT_MIN_HUMAN_CHARS - 1).reached).toBe(false)
    expect(describeIntentProgress(INTENT_MIN_HUMAN_CHARS).reached).toBe(true)
  })
})

describe("ProjectIntentField", () => {
  it("heißt „Vorhaben\" und ist als optional gekennzeichnet", () => {
    // Der alte Name war „Beschreibung (optional)" — er hat nicht gesagt,
    // wofür das Feld gebraucht wird, und genau deshalb blieb es kurz.
    expect(PROJECT_INTENT_LABEL).toContain("Vorhaben")
    expect(PROJECT_INTENT_LABEL).toContain("optional")
  })

  it("lädt zum Schreiben ein statt eine Ja/Nein-Frage zu stellen", () => {
    render(<ProjectIntentField value="" onChange={() => {}} />)
    const box = screen.getByRole("textbox")
    const placeholder = box.getAttribute("placeholder") ?? ""
    // Der alte Platzhalter war „Worum geht es in diesem Projekt?" — eine
    // Frage, auf die ein Satz die vollständige Antwort ist.
    expect(placeholder).toMatch(/Umfang|Rahmenbedingungen/)
    expect(placeholder.length).toBeGreaterThan(60)
  })

  it("reicht Eingaben durch und aktualisiert den Hinweis", () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ProjectIntentField value="" onChange={onChange} />,
    )
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ablösung des Altsystems" },
    })
    expect(onChange).toHaveBeenCalledWith("Ablösung des Altsystems")

    rerender(<ProjectIntentField value={"x".repeat(150)} onChange={onChange} />)
    expect(screen.getByText(/150 von/)).toBeInTheDocument()
  })

  it("meldet den Hinweis an Hilfstechnologie", () => {
    const { container } = render(
      <ProjectIntentField value="abc" onChange={() => {}} />,
    )
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull()
  })

  it("zählt getrimmt — Leerzeichen sind kein Vorhaben", () => {
    render(<ProjectIntentField value={"   ".repeat(200)} onChange={() => {}} />)
    // Bei reiner Leerzeichen-Eingabe bleibt es beim Leer-Text, nicht beim
    // Fortschritts-Text: 600 Zeichen Weißraum sind kein ausführliches Vorhaben.
    expect(screen.getByText(/^Ab \d+ Zeichen/)).toBeInTheDocument()
  })
})
