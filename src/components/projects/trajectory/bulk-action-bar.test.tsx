import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BulkActionBar, computeKindMix } from "./bulk-action-bar"

describe("BulkActionBar", () => {
  it("does not render when selectedCount=0", () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        kindMix={[]}
        onClear={() => {}}
        onBulkShift={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders count + kind-mix summary at N=3 (2 Phasen · 1 Sprint)", () => {
    render(
      <BulkActionBar
        selectedCount={3}
        kindMix={[
          { label: "Phasen", count: 2 },
          { label: "Sprint", count: 1 },
        ]}
        onClear={() => {}}
        onBulkShift={() => {}}
      />,
    )
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument()
    expect(screen.getByTestId("bulk-action-bar-count")).toHaveTextContent(
      /3 Knoten ausgewählt/,
    )
    expect(screen.getByTestId("bulk-action-bar-mix")).toHaveTextContent(
      "2 Phasen · 1 Sprint",
    )
  })

  it("renders count without mix line when kindMix is empty", () => {
    render(
      <BulkActionBar
        selectedCount={1}
        kindMix={[]}
        onClear={() => {}}
        onBulkShift={() => {}}
      />,
    )
    expect(screen.getByTestId("bulk-action-bar-count")).toHaveTextContent(
      /1 Knoten ausgewählt/,
    )
    expect(screen.queryByTestId("bulk-action-bar-mix")).not.toBeInTheDocument()
  })

  it("calls onClear when 'Alle deselektieren' is clicked", () => {
    const onClear = vi.fn()
    render(
      <BulkActionBar
        selectedCount={2}
        kindMix={[{ label: "Phasen", count: 2 }]}
        onClear={onClear}
        onBulkShift={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId("bulk-action-bar-clear"))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it("exposes the bulk-shift trigger button", () => {
    render(
      <BulkActionBar
        selectedCount={2}
        kindMix={[{ label: "Phasen", count: 2 }]}
        onClear={() => {}}
        onBulkShift={() => {}}
      />,
    )
    expect(screen.getByTestId("bulk-action-bar-shift")).toBeInTheDocument()
  })

  it("carries the bulk-actions region landmark for a11y", () => {
    render(
      <BulkActionBar
        selectedCount={1}
        kindMix={[]}
        onClear={() => {}}
        onBulkShift={() => {}}
      />,
    )
    const bar = screen.getByTestId("bulk-action-bar")
    expect(bar).toHaveAttribute("role", "region")
    expect(bar).toHaveAttribute("aria-label", "Bulk-Aktionen")
  })
})

describe("computeKindMix", () => {
  it("returns empty array when no ids match", () => {
    const map = new Map<string, "phase" | "sprint">()
    expect(computeKindMix([], map)).toEqual([])
    expect(computeKindMix(["foo"], map)).toEqual([])
  })

  it("counts phases and sprints with singular/plural labels", () => {
    const map = new Map<string, "phase" | "sprint">([
      ["a", "phase"],
      ["b", "sprint"],
      ["c", "phase"],
    ])
    expect(computeKindMix(["a", "b", "c"], map)).toEqual([
      { label: "Phasen", count: 2 },
      { label: "Sprint", count: 1 },
    ])
  })

  it("uses singular labels at count=1", () => {
    const map = new Map<string, "phase" | "sprint">([
      ["a", "phase"],
      ["b", "sprint"],
    ])
    expect(computeKindMix(["a", "b"], map)).toEqual([
      { label: "Phase", count: 1 },
      { label: "Sprint", count: 1 },
    ])
  })
})
