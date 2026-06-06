import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listPhaseComplianceWarnings: vi.fn(),
}))

vi.mock("@/lib/compliance/api", () => ({
  listPhaseComplianceWarnings: mocks.listPhaseComplianceWarnings,
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

import { PhaseStatusTransitionDialog } from "./phase-status-transition-dialog"

const PROJECT_ID = "project-1"
const PHASE_ID = "phase-1"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", vi.fn())
})

describe("PhaseStatusTransitionDialog — PROJ-18 close warning modal", () => {
  it("shows compliance warnings before completing a phase and posts only after confirmation", async () => {
    mocks.listPhaseComplianceWarnings.mockResolvedValue([
      {
        phase: "done",
        tagKey: "iso-9001",
        message: "ISO 9001 checklist is still open.",
        suggestedTemplateKey: "iso-9001-completion",
      },
    ])
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ phase: { id: PHASE_ID } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const onTransitioned = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <PhaseStatusTransitionDialog
        open
        onOpenChange={onOpenChange}
        projectId={PROJECT_ID}
        phaseId={PHASE_ID}
        phaseName="Abnahme"
        currentStatus="in_progress"
        initialToStatus="completed"
        onTransitioned={onTransitioned}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Status setzen" }))

    await waitFor(() =>
      expect(mocks.listPhaseComplianceWarnings).toHaveBeenCalledWith(
        PROJECT_ID,
        PHASE_ID,
      ),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole("dialog", {
        name: "Compliance-Warnungen bestätigen",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("ISO 9001 checklist is still open.")).toBeVisible()

    fireEvent.click(
      screen.getByRole("button", { name: "Trotzdem abschließen" }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}/phases/${PHASE_ID}/transition`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ to_status: "completed", comment: null }),
      }),
    )
    await waitFor(() => expect(onTransitioned).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
