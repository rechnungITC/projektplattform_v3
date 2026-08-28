/**
 * PROJ-152 — Fortschrittsanzeige des Orchestrators.
 *
 * Der Auslöser dieser Slice war eine **Verwechslung**, kein Absturz: die
 * Zeile „Stakeholder" stand bei `generiert …` und war von „hängt" nicht zu
 * unterscheiden. Für dieses Modul ist eine lange Wartezeit aber der
 * Normalfall — es ist per Invariante #3 Class-3-gepinnt, darf also nur an
 * ein tenant-eigenes Ollama, und live gemessene erfolgreiche Läufe brauchten
 * 176 s bzw. 253 s.
 *
 * Die Fälle pinnen deshalb beide Hälften: dass die Zeit überhaupt
 * fortschreitet, und dass der *Grund* für die Langsamkeit erscheint, bevor
 * ein Nutzer die Geduld verliert. Ein Test, der nur „irgendein Text steht
 * da" prüft, hätte auch den alten Zustand bestanden.
 */
import "@testing-library/jest-dom/vitest"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RunningText } from "./orchestration-tab"

const HINT = "läuft über Ihr lokales Ollama (Datenschutz)"

/** Ein nacktes `new RegExp(HINT)` waere falsch: die Klammern in "(Datenschutz)" sind
 *  eine Capture-Gruppe, das Muster passt dann NICHT auf den echten Text —
 *  und die negativen Zusagen unten waeren aus dem falschen Grund gruen. */
const hintMatcher = new RegExp(HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

describe("RunningText — Fortschrittsanzeige", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("zählt die vergangene Zeit hoch statt statisch zu stehen", () => {
    const startedAt = Date.now()
    render(<RunningText startedAt={startedAt} />)

    expect(screen.getByText(/generiert … 0 s/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    // Genau das war vorher nicht sichtbar: dass überhaupt etwas passiert.
    expect(screen.getByText(/generiert … 3 s/)).toBeInTheDocument()
  })

  it("nennt jenseits einer Minute Minuten statt dreistelliger Sekunden", () => {
    render(<RunningText startedAt={Date.now()} />)

    act(() => {
      vi.advanceTimersByTime(95_000)
    })

    // 176 s als "176 s" zu lesen ist zumutbar, aber "1:35 min" sagt einem
    // Wartenden mehr über die Größenordnung.
    expect(screen.getByText(/1:35 min/)).toBeInTheDocument()
  })

  it("erklärt erst nach 20 s, warum dieses Modul langsam sein darf", () => {
    render(<RunningText startedAt={Date.now()} slowHint={HINT} />)

    // Vorher nicht: bei einem schnellen Lauf wäre der Hinweis Rauschen und
    // würde die Zeile für alle drei Module unnötig aufblähen.
    expect(screen.queryByText(hintMatcher)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(screen.getByText(hintMatcher)).toBeInTheDocument()
  })

  it("zeigt für Module ohne Hinweis auch nach langer Zeit keinen erfundenen Grund", () => {
    // Gegenprobe: ohne sie belegte der Fall darüber nur, dass irgendwann
    // irgendein Text erscheint — nicht, dass er am Modul hängt.
    render(<RunningText startedAt={Date.now()} />)

    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    expect(screen.getByText(/2:00 min/)).toBeInTheDocument()
    expect(screen.queryByText(hintMatcher)).not.toBeInTheDocument()
  })

  it("meldet den Fortschritt an Hilfstechnologie (aria-live)", () => {
    const { container } = render(<RunningText startedAt={Date.now()} />)
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull()
  })
})
