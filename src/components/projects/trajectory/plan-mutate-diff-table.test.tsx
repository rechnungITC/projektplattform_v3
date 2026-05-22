import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  PlanMutateDiffTable,
  type AffectedRow,
} from "./plan-mutate-diff-table"

function row(over: Partial<AffectedRow> = {}): AffectedRow {
  return {
    node_id: "phase:1",
    node_kind: "phase",
    node_label: "Phase 1",
    field: "start_date",
    before: { kind: "exact", value: "2026-06-01" },
    after: { kind: "exact", value: "2026-06-05" },
    severity: "neutral",
    masked: false,
    ...over,
  }
}

describe("PlanMutateDiffTable", () => {
  it("renders the empty banner when no affected rows are passed", () => {
    render(
      <PlanMutateDiffTable
        affected={[]}
        costClearView={false}
        projectId="p1"
      />,
    )
    expect(screen.getByTestId("plan-mutate-diff-empty")).toBeInTheDocument()
    expect(screen.queryByTestId("plan-mutate-diff-table")).not.toBeInTheDocument()
  })

  it("renders 5 columns in the header (Knoten/Feld/Vorher/Δ/Nachher)", () => {
    render(
      <PlanMutateDiffTable
        affected={[row()]}
        costClearView
        projectId="p1"
      />,
    )
    expect(screen.getByText("Knoten")).toBeInTheDocument()
    expect(screen.getByText("Feld")).toBeInTheDocument()
    expect(screen.getByText("Vorher")).toBeInTheDocument()
    expect(screen.getByText("Δ")).toBeInTheDocument()
    expect(screen.getByText("Nachher")).toBeInTheDocument()
  })

  it("masks cost cells with *** when costClearView is false", () => {
    render(
      <PlanMutateDiffTable
        affected={[
          row({
            field: "cost_estimate",
            masked: true,
            before: { kind: "masked", value: null },
            after: { kind: "exact", value: { bucket: "more" } },
          }),
        ]}
        costClearView={false}
        projectId="p1"
      />,
    )
    // *** appears in both before and after cells.
    const stars = screen.getAllByText("***")
    expect(stars.length).toBeGreaterThanOrEqual(2)
    // Aggregate-bucket label.
    expect(screen.getByText(/höherer Aufwand/)).toBeInTheDocument()
  })

  it("renders Class-3 footnote link when masked cost rows exist", () => {
    render(
      <PlanMutateDiffTable
        affected={[
          row({
            field: "cost_estimate",
            masked: true,
            before: { kind: "masked", value: null },
            after: { kind: "exact", value: { bucket: "even" } },
          }),
        ]}
        costClearView={false}
        projectId="p1"
      />,
    )
    expect(screen.getByTestId("class-three-request-link")).toBeInTheDocument()
  })

  it("shows overflow counter when affected > maxVisibleRows", () => {
    const many = Array.from({ length: 55 }, (_, i) =>
      row({ node_id: `phase:${i}`, node_label: `Phase ${i}` }),
    )
    render(
      <PlanMutateDiffTable
        affected={many}
        costClearView
        projectId="p1"
        maxVisibleRows={50}
      />,
    )
    expect(screen.getByTestId("plan-mutate-diff-overflow")).toHaveTextContent(
      "+5 weitere Knoten",
    )
  })

  it("highlights conflicted rows when ids are passed", () => {
    const r1 = row({ node_id: "phase:1" })
    const r2 = row({ node_id: "phase:2" })
    render(
      <PlanMutateDiffTable
        affected={[r1, r2]}
        costClearView
        projectId="p1"
        conflictedNodeIds={new Set(["phase:1"])}
      />,
    )
    const rows = screen.getAllByTestId("plan-mutate-diff-row")
    // Conflicted row carries bg-destructive/10 class.
    expect(rows[0].className).toContain("bg-destructive/10")
    expect(rows[1].className).not.toContain("bg-destructive/10")
  })
})
