/**
 * PROJ-144 — Prüfansicht des Sprach-Entwurfs.
 *
 * Der Grund für diese Datei steht im Tech Design als ausdrückliches
 * /qa-Pflichtrisiko: **der Titel muss korrigierbar sein, sonst ist die
 * Bestätigung Formsache.** Die Spracherkennung hört Fachbegriffe zuverlässig
 * falsch („Rechnungsimport" → „Rechnung Sport"); wäre das Feld nur eine
 * Anzeige, würde der Nutzer den Fehler sehen, aber nichts dagegen tun können
 * und trotzdem bestätigen. Genau das pinnt Fall 1: der korrigierte Titel muss
 * bis in den `confirm`-Aufruf durchreisen.
 *
 * Die anderen Fälle sichern die Zusagen, die man einer Prüfansicht ansehen
 * können muss: vor dem Klick passiert nichts (AC-144.15/16), ein leerer Titel
 * ist nicht bestätigbar, die von der Methode erzwungene Art wird erklärt statt
 * stillschweigend ersetzt (AC-144.8), und ein Fehlschlag lässt den Nutzer
 * korrigieren statt in einem Dauer-Ladezustand hängen.
 */
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { AssistantWorkItemDraftCard } from "./assistant-work-item-draft-card"

const DRAFT = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Rechnung Sport testen",
  description: null,
  target_kind: "story",
  requested_kind: "story",
  kind_was_mapped: false,
  project_id: "22222222-2222-4222-8222-222222222222",
  project_name: "ERP-Rollout",
}

const CREATED = {
  id: "33333333-3333-4333-8333-333333333333",
  project_id: DRAFT.project_id,
  kind: "story",
  title: "Rechnungsimport testen",
}

function setup(overrides: Partial<React.ComponentProps<typeof AssistantWorkItemDraftCard>> = {}) {
  const confirm = vi.fn().mockResolvedValue(CREATED)
  const discard = vi.fn().mockResolvedValue(undefined)
  const onConfirmed = vi.fn()
  const onDiscarded = vi.fn()
  render(
    <AssistantWorkItemDraftCard
      draft={DRAFT}
      confirm={confirm}
      discard={discard}
      onConfirmed={onConfirmed}
      onDiscarded={onDiscarded}
      {...overrides}
    />,
  )
  return { confirm, discard, onConfirmed, onDiscarded }
}

describe("AssistantWorkItemDraftCard", () => {
  it("reicht den korrigierten Titel an die Bestätigung durch", async () => {
    const { confirm, onConfirmed } = setup()

    const titleField = screen.getByLabelText("Titel")
    expect(titleField).toHaveValue("Rechnung Sport testen")

    fireEvent.change(titleField, { target: { value: "Rechnungsimport testen" } })
    fireEvent.click(screen.getByRole("button", { name: /Story anlegen/ }))

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    // Der korrigierte Wert, nicht der diktierte — das ist der ganze Punkt.
    expect(confirm).toHaveBeenCalledWith(DRAFT.id, {
      title: "Rechnungsimport testen",
      description: null,
    })
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(CREATED))
  })

  it("schreibt nichts, solange nicht bestätigt wurde (AC-144.15/16)", () => {
    const { confirm, discard } = setup()

    fireEvent.change(screen.getByLabelText("Titel"), {
      target: { value: "Nur getippt" },
    })

    expect(confirm).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
    expect(screen.getByText("Entwurf — noch nicht angelegt")).toBeInTheDocument()
  })

  it("verhindert die Bestätigung bei leerem Titel", () => {
    const { confirm } = setup()

    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "   " } })

    const button = screen.getByRole("button", { name: /Story anlegen/ })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(confirm).not.toHaveBeenCalled()
  })

  it("erklärt eine von der Methode erzwungene Art (AC-144.8)", () => {
    setup({
      draft: {
        ...DRAFT,
        requested_kind: "story",
        target_kind: "work_package",
        kind_was_mapped: true,
      },
    })

    // Gesagt „Story", angelegt wird ein Arbeitspaket — beides muss dastehen.
    expect(screen.getByText(/Du hast/)).toHaveTextContent("Story")
    expect(screen.getByText(/Du hast/)).toHaveTextContent("Arbeitspaket")
    expect(
      screen.getByRole("button", { name: /Arbeitspaket anlegen/ }),
    ).toBeInTheDocument()
  })

  it("bleibt nach einem Fehlschlag bedienbar", async () => {
    const confirm = vi.fn().mockRejectedValue(new Error("Dir fehlt das Schreibrecht in diesem Projekt."))
    render(
      <AssistantWorkItemDraftCard
        draft={DRAFT}
        confirm={confirm}
        discard={vi.fn()}
        onConfirmed={vi.fn()}
        onDiscarded={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Story anlegen/ }))

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Dir fehlt das Schreibrecht in diesem Projekt.",
      ),
    )
    // Kein Dauer-Ladezustand: erneutes Bestätigen muss möglich bleiben.
    expect(screen.getByRole("button", { name: /Story anlegen/ })).toBeEnabled()
  })

  it("verwirft den Entwurf über den Verwerfen-Pfad (AC-144.19)", async () => {
    const { discard, onDiscarded } = setup()

    fireEvent.click(screen.getByRole("button", { name: /Verwerfen/ }))

    await waitFor(() => expect(discard).toHaveBeenCalledWith(DRAFT.id))
    expect(onDiscarded).toHaveBeenCalledWith(DRAFT.id)
  })
})
