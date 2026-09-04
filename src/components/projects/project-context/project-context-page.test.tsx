import "@testing-library/jest-dom/vitest"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { emptyProjectContextData, type ProjectContextDocumentView } from "@/types/project-context"

import { ProjectContextDocument } from "./project-context-page"

function document(
  transcript: ProjectContextDocumentView["transcript"],
): ProjectContextDocumentView {
  return {
    id: "context-1",
    project_id: "project-1",
    revision_number: 1,
    created_at: "2026-08-31T00:00:00.000Z",
    created_by_name: "Projektleitung",
    confidentiality_level: "confidential",
    context: {
      ...emptyProjectContextData(),
      summary: "Ein bestätigter Kontext.",
      gaps: ["Budgetrahmen ist noch offen."],
      statements: [
        {
          id: "s-1",
          text: "Wasserfall",
          origin: "wizard_selection",
          source_label: "Methode",
          confirmed: true,
          affected_skill_version_ids: [],
        },
      ],
    },
    transcript,
  }
}

describe("ProjectContextDocument", () => {
  it("shows reviewed summary, provenance, gaps and confidentiality", () => {
    render(<ProjectContextDocument document={document([])} />)

    expect(screen.getByText("Ein bestätigter Kontext.")).toBeInTheDocument()
    expect(screen.getByText("Budgetrahmen ist noch offen.")).toBeInTheDocument()
    expect(screen.getByText("Bestätigte Quelle")).toBeInTheDocument()
    expect(screen.getByText("confidential")).toBeInTheDocument()
  })

  it("does not expose transcript content without the narrower permission", () => {
    render(<ProjectContextDocument document={document(null)} />)

    expect(
      screen.getByText(/für deine Rolle nicht freigegeben/),
    ).toBeInTheDocument()
    expect(screen.queryByText("Geheime Rohantwort")).not.toBeInTheDocument()
  })

  it("renders transcript turns only when the backend includes them", () => {
    render(
      <ProjectContextDocument
        document={document([
          {
            id: "turn-1",
            role: "user",
            content: "Geheime Rohantwort",
            status: "complete",
          },
        ])}
      />,
    )

    expect(screen.getByText("Geheime Rohantwort")).toBeInTheDocument()
  })
})
