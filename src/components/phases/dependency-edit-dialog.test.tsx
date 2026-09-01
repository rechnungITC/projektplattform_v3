import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DependencyEditDialog } from "./dependency-edit-dialog"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/dependencies/api", () => ({
  DependencyApiError: class extends Error {},
  updateDependency: vi.fn(),
  deleteDependency: vi.fn(),
}))

const DEP = {
  id: "d1",
  constraint_type: "SS" as const,
  lag_days: -2,
  fromLabel: "Fundament gießen",
  toLabel: "Rohbau starten",
}

function renderDialog(canEdit: boolean) {
  render(
    <DependencyEditDialog
      projectId="p1"
      dependency={DEP}
      canEdit={canEdit}
      onOpenChange={() => {}}
      onChanged={() => {}}
    />,
  )
}

describe("DependencyEditDialog", () => {
  it("rendert nichts ohne gewählte Kante", () => {
    const { container } = render(
      <DependencyEditDialog
        projectId="p1"
        dependency={null}
        canEdit
        onOpenChange={() => {}}
        onChanged={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("zeigt beide Enden mit Namen statt mit Objektarten", () => {
    renderDialog(true)
    // „work_package → work_package" unterscheidet bei mehreren Kanten nichts.
    expect(
      screen.getByText(/Fundament gießen → Rohbau starten/),
    ).toBeInTheDocument()
  })

  it("übernimmt Typ und Abstand der Kante als Ausgangswert", () => {
    renderDialog(true)
    expect(screen.getByLabelText("Abstand in Tagen")).toHaveValue(-2)
    expect(screen.getByText("Start → Start (SS)")).toBeInTheDocument()
  })

  it("erklärt, was ein negativer Abstand bedeutet", () => {
    renderDialog(true)
    expect(screen.getByText(/Negativ bedeutet Überlappung/)).toBeInTheDocument()
  })

  it("bietet dem Bearbeiter drei Handlungen — Löschen ist nur eine davon", () => {
    renderDialog(true)
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sichern" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Schliessen" })).toBeInTheDocument()
  })

  it("zeigt dem Nicht-Bearbeiter die Werte, aber weder Sichern noch Entfernen", () => {
    renderDialog(false)
    // Die Werte sind lesbar …
    expect(screen.getByLabelText("Abstand in Tagen")).toHaveValue(-2)
    // … aber es gibt nichts zu tun.
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Sichern" })).toBeNull()
    expect(screen.getByText(/Nur Ansicht/)).toBeInTheDocument()
    // Gegenprobe: der Schliessen-Knopf bleibt, sonst wäre der Dialog eine
    // Falle statt einer Ansicht.
    expect(screen.getByRole("button", { name: "Schliessen" })).toBeInTheDocument()
  })

  it("sperrt die Eingabefelder für den Nicht-Bearbeiter", () => {
    renderDialog(false)
    expect(screen.getByLabelText("Abstand in Tagen")).toBeDisabled()
  })
})
