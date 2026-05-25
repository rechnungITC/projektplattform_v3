import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CycleAttemptOverlay } from "./cycle-attempt-overlay"

describe("CycleAttemptOverlay", () => {
  it("renders title and first 3 cycle-path-node labels", () => {
    render(
      <CycleAttemptOverlay
        cycle={{
          detected_at_node_id: "phase:1",
          path: ["phase:1", "sprint:2", "phase:3", "sprint:4", "phase:5"],
        }}
        nodeLabels={{
          "phase:1": "P1",
          "sprint:2": "S2",
          "phase:3": "P3",
          "sprint:4": "S4",
          "phase:5": "P5",
        }}
        onFocus={() => {}}
        onDismiss={() => {}}
      />,
    )
    expect(
      screen.getByText(/Zyklus im Abhängigkeitsgraph erkannt/),
    ).toBeInTheDocument()
    // First 3 visible.
    expect(screen.getByText("P1")).toBeInTheDocument()
    expect(screen.getByText("S2")).toBeInTheDocument()
    expect(screen.getByText("P3")).toBeInTheDocument()
    // 4th + 5th rolled into +N counter.
    expect(screen.getByText(/…\+2/)).toBeInTheDocument()
  })

  it("renders the source-node-label preamble when source_node_id is set", () => {
    render(
      <CycleAttemptOverlay
        cycle={{
          detected_at_node_id: "phase:1",
          path: ["phase:1", "sprint:2"],
          source_node_id: "phase:1",
        }}
        nodeLabels={{ "phase:1": "Phase 1", "sprint:2": "Sprint 2" }}
        onFocus={() => {}}
        onDismiss={() => {}}
      />,
    )
    const overlay = screen.getByTestId("cycle-attempt-overlay")
    expect(overlay).toHaveTextContent(/auf .*Phase 1.* blockiert/)
  })

  it("calls onFocus with the path when 'Path im Graph fokussieren' is clicked", () => {
    const onFocus = vi.fn()
    render(
      <CycleAttemptOverlay
        cycle={{
          detected_at_node_id: "phase:1",
          path: ["phase:1", "sprint:2"],
        }}
        onFocus={onFocus}
        onDismiss={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId("cycle-attempt-overlay-focus"))
    expect(onFocus).toHaveBeenCalledWith(["phase:1", "sprint:2"])
  })

  it("calls onDismiss when 'Verstanden, ausblenden' is clicked", () => {
    const onDismiss = vi.fn()
    render(
      <CycleAttemptOverlay
        cycle={{
          detected_at_node_id: "phase:1",
          path: ["phase:1"],
        }}
        onFocus={() => {}}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByTestId("cycle-attempt-overlay-dismiss"))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("disables the focus button when the path is empty", () => {
    render(
      <CycleAttemptOverlay
        cycle={{ detected_at_node_id: "phase:1", path: [] }}
        onFocus={() => {}}
        onDismiss={() => {}}
      />,
    )
    const btn = screen.getByTestId(
      "cycle-attempt-overlay-focus",
    ) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
