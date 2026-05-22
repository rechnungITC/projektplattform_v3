import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PlanMutateConflictBanner } from "./plan-mutate-conflict-banner"

describe("PlanMutateConflictBanner", () => {
  it("renders the conflict title and conflict count", () => {
    render(
      <PlanMutateConflictBanner
        conflictedNodeIds={["phase:1"]}
        nodeLabels={{ "phase:1": "Phase 1" }}
        onReload={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(
      screen.getByText(/Plan-Konflikt — andere Bearbeitung erkannt/),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 Knoten wurde/)).toBeInTheDocument()
    expect(screen.getByText(/Phase 1/)).toBeInTheDocument()
  })

  it("shows first 3 names + extra count for many conflicts", () => {
    render(
      <PlanMutateConflictBanner
        conflictedNodeIds={["a", "b", "c", "d", "e"]}
        nodeLabels={{ a: "A", b: "B", c: "C", d: "D", e: "E" }}
        onReload={() => {}}
        onCancel={() => {}}
      />,
    )
    const banner = screen.getByTestId("plan-mutate-conflict-banner")
    expect(banner).toHaveTextContent("A, B, C")
    expect(banner).toHaveTextContent("+2 weitere")
  })

  it("calls onReload on 'Neuen Stand laden' click", () => {
    const onReload = vi.fn()
    render(
      <PlanMutateConflictBanner
        conflictedNodeIds={["phase:1"]}
        onReload={onReload}
        onCancel={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId("plan-mutate-conflict-reload"))
    expect(onReload).toHaveBeenCalledOnce()
  })

  it("calls onCancel on 'Abbrechen' click", () => {
    const onCancel = vi.fn()
    render(
      <PlanMutateConflictBanner
        conflictedNodeIds={["phase:1"]}
        onReload={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByTestId("plan-mutate-conflict-cancel"))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("disables the reload button while reloading=true", () => {
    render(
      <PlanMutateConflictBanner
        conflictedNodeIds={["phase:1"]}
        onReload={() => {}}
        onCancel={() => {}}
        reloading
      />,
    )
    const btn = screen.getByTestId(
      "plan-mutate-conflict-reload",
    ) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn).toHaveTextContent("Lade neuen Stand…")
  })
})
