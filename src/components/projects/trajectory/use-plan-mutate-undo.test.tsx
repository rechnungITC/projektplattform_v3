import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PlanMutateUndoToast } from "./use-plan-mutate-undo"

describe("PlanMutateUndoToast", () => {
  it("renders the idle variant with title, sub-line and live countdown", () => {
    render(
      <PlanMutateUndoToast
        variant="idle"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={29}
        onUndoClick={() => {}}
      />,
    )
    const toast = screen.getByTestId("plan-mutate-undo-toast")
    expect(toast).toHaveAttribute("data-variant", "idle")
    expect(toast).toHaveTextContent("Plan übernommen · 4 Knoten geändert")
    expect(toast).toHaveTextContent("Sprint 3 verschoben um +2 Tage")
    expect(
      screen.getByTestId("plan-mutate-undo-action"),
    ).toHaveTextContent("Rückgängig (29s)")
  })

  it("renders the loading variant", () => {
    render(
      <PlanMutateUndoToast
        variant="loading"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={0}
      />,
    )
    const toast = screen.getByTestId("plan-mutate-undo-toast")
    expect(toast).toHaveAttribute("data-variant", "loading")
    expect(toast).toHaveTextContent("Wird rückgängig gemacht…")
  })

  it("renders the success variant", () => {
    render(
      <PlanMutateUndoToast
        variant="success"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={0}
      />,
    )
    expect(screen.getByTestId("plan-mutate-undo-toast")).toHaveTextContent(
      "Plan rückgängig · 4 Knoten wiederhergestellt",
    )
  })

  it("renders the 409 conflict variant with details action", () => {
    const onDetails = vi.fn()
    render(
      <PlanMutateUndoToast
        variant="conflict"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={0}
        conflictedCount={2}
        onConflictDetailsClick={onDetails}
      />,
    )
    expect(screen.getByTestId("plan-mutate-undo-toast")).toHaveTextContent(
      "Undo nicht möglich — 2 Konflikt-Knoten",
    )
    fireEvent.click(screen.getByTestId("plan-mutate-undo-conflict-details"))
    expect(onDetails).toHaveBeenCalledOnce()
  })

  it("renders the 5xx error variant with retry action", () => {
    const onRetry = vi.fn()
    render(
      <PlanMutateUndoToast
        variant="error"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={0}
        onRetryClick={onRetry}
      />,
    )
    expect(screen.getByTestId("plan-mutate-undo-toast")).toHaveTextContent(
      "Undo fehlgeschlagen — bitte erneut versuchen",
    )
    fireEvent.click(screen.getByTestId("plan-mutate-undo-retry"))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("fires the onUndoClick callback on Rückgängig click", () => {
    const onUndo = vi.fn()
    render(
      <PlanMutateUndoToast
        variant="idle"
        affectedCount={4}
        sourceNodeLabel="Sprint 3"
        shiftDays={2}
        secondsLeft={20}
        onUndoClick={onUndo}
      />,
    )
    fireEvent.click(screen.getByTestId("plan-mutate-undo-action"))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})
