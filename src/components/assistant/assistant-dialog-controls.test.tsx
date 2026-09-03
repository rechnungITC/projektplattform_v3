import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { AssistantDialogState } from "@/lib/assistant/dialog-state"

import { AssistantDialogControls } from "./assistant-dialog-controls"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"

const PROJECT_REVIEW_STATE: AssistantDialogState = {
  schema_version: 1,
  revision: 4,
  pending_intent: "project_create_draft",
  phase: "reviewing",
  expires_at: "2099-08-21T12:30:00.000Z",
  started_project_id: null,
  requested_slot: null,
  candidate_project_ids: [],
  slots: {
    name: "Apollo",
    project_type: "software",
    project_method: "scrum",
    description: "Rechnungsimport modernisieren",
    skipped: [],
  },
}

function renderControls(
  dialogState: AssistantDialogState = PROJECT_REVIEW_STATE,
  projectChoices: Array<{ id: string; name: string; lifecycle_status: string }> = [],
) {
  const props = {
    dialogState,
    projectChoices,
    busy: false,
    onProjectChoice: vi.fn(),
    onApproveProject: vi.fn(),
    onCorrectProjectField: vi.fn(),
    onCancel: vi.fn(),
  }
  render(<AssistantDialogControls {...props} />)
  return props
}

describe("AssistantDialogControls", () => {
  it("zeigt die strukturierte Projektzusammenfassung ohne ein Projekt anzulegen", () => {
    const { onApproveProject } = renderControls()

    expect(screen.getByRole("region", { name: "Projektentwurf prüfen" })).toHaveTextContent(
      "Apollo",
    )
    expect(screen.getByRole("region", { name: "Projektentwurf prüfen" })).toHaveTextContent(
      "Software",
    )
    expect(screen.getByRole("region", { name: "Projektentwurf prüfen" })).toHaveTextContent(
      "Scrum",
    )
    expect(screen.getByText("Noch nicht angelegt")).toBeInTheDocument()
    expect(onApproveProject).not.toHaveBeenCalled()
  })

  it("gibt eine Namenskorrektur erst nach Übernehmen strukturiert weiter", () => {
    const { onCorrectProjectField } = renderControls()

    fireEvent.click(screen.getByRole("button", { name: "Name ändern" }))
    fireEvent.change(screen.getByLabelText("Name korrigieren"), {
      target: { value: "Apollo Next" },
    })
    expect(onCorrectProjectField).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }))
    expect(onCorrectProjectField).toHaveBeenCalledWith("name", "Apollo Next")
  })

  it("trennt Freigabe und Abbruch in ausdrückliche Schaltflächen", () => {
    const { onApproveProject, onCancel } = renderControls()

    fireEvent.click(
      screen.getByRole("button", { name: "Wizard-Entwurf vorbereiten" }),
    )
    expect(onApproveProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Auftrag abbrechen" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("setzt eine mehrdeutige Projektauswahl fort, statt zu navigieren", () => {
    const state: AssistantDialogState = {
      schema_version: 1,
      revision: 2,
      pending_intent: "work_item_create_draft",
      phase: "choosing_project",
      expires_at: "2099-08-21T12:30:00.000Z",
      started_project_id: null,
      requested_slot: "project",
      candidate_project_ids: [PROJECT_ID],
      slots: {
        requested_kind: "story",
        title: "Rechnungsimport",
        description: null,
        project_query: "Apollo",
        project_id: null,
      },
    }
    const { onProjectChoice } = renderControls(state, [
      { id: PROJECT_ID, name: "Apollo", lifecycle_status: "active" },
    ])

    fireEvent.click(screen.getByRole("button", { name: "Apollo" }))
    expect(onProjectChoice).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("bietet auch während einer Rückfrage einen Abbruch an", () => {
    const collecting: AssistantDialogState = {
      ...PROJECT_REVIEW_STATE,
      phase: "collecting",
      requested_slot: "description",
    }
    const { onCancel } = renderControls(collecting)

    fireEvent.click(screen.getByRole("button", { name: "Auftrag abbrechen" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
