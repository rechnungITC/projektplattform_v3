import "@testing-library/jest-dom/vitest"

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Skill } from "@/types/skill"
import { emptyWizardData, type WizardData } from "@/types/wizard"

import {
  StepProjectContext,
  synchronizeSkillCoverage,
} from "./step-project-context"

const listSkills = vi.fn<() => Promise<Skill[]>>()

vi.mock("@/lib/skills/api", () => ({
  listSkills: () => listSkills(),
}))

const SKILL_ID = "11111111-1111-4111-8111-111111111111"
const VERSION_1 = "22222222-2222-4222-8222-222222222222"
const VERSION_2 = "33333333-3333-4333-8333-333333333333"

function skill(versionId: string, name = "Projekt-Risiken"): Skill {
  return {
    id: SKILL_ID,
    tenant_id: "44444444-4444-4444-8444-444444444444",
    name,
    slug: "projekt-risiken",
    description: "",
    category: "cross_cutting",
    method_tags: [],
    project_type_tags: [],
    is_active: true,
    current_version_id: versionId,
    created_by: null,
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
  }
}

function Harness({
  withSkill = false,
  withLegacyClarification = false,
}: {
  withSkill?: boolean
  withLegacyClarification?: boolean
}) {
  const defaults = emptyWizardData("55555555-5555-4555-8555-555555555555")
  defaults.name = "ERP-Einführung"
  defaults.description = "Ablösung des Altsystems"
  defaults.project_type = "erp"
  defaults.project_method = "waterfall"
  if (withSkill) {
    defaults.skills.assignments = [
      { skill_id: SKILL_ID, assignment_source: "auto_cross_cutting" },
    ]
  }
  if (withLegacyClarification) {
    defaults.clarifying = {
      answers: [
        {
          question: "Welche Systeme sind betroffen?",
          answer: "SAP und das Data Warehouse",
          gap_tag: "Systemlandschaft",
        },
      ],
      status: "ready",
    }
  }
  const form = useForm<WizardData>({ defaultValues: defaults })
  const context = useWatch({ control: form.control, name: "project_context" })
  return (
    <FormProvider {...form}>
      <StepProjectContext />
      <output data-testid="context-output">{JSON.stringify(context)}</output>
    </FormProvider>
  )
}

describe("StepProjectContext — PROJ-Y-5a manual-first UI", () => {
  beforeEach(() => {
    listSkills.mockReset()
    listSkills.mockResolvedValue([])
  })

  it("keeps the shared context path available with zero selected skills", async () => {
    render(<Harness />)

    expect(await screen.findByText("Keine Skills ausgewählt")).toBeInTheDocument()
    expect(screen.getByTestId("project-context-manual-status")).toHaveTextContent(
      /erfasst, nicht KI-analysiert/i,
    )
    await waitFor(() => {
      expect(screen.getByTestId("context-output")).toHaveTextContent(
        "Ablösung des Altsystems",
      )
    })
  })

  it("persists a manual answer with user provenance and summary", async () => {
    render(<Harness />)
    await screen.findByText("Keine Skills ausgewählt")

    fireEvent.change(screen.getByLabelText("Projektkontext ergänzen"), {
      target: { value: "Der Go-live darf nicht im Quartalsabschluss liegen." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aussage übernehmen" }))

    await waitFor(() => {
      const output = screen.getByTestId("context-output")
      expect(output).toHaveTextContent("Der Go-live darf nicht")
      expect(output).toHaveTextContent("user_answer")
      expect(output).toHaveTextContent("captured_not_ai_analyzed")
    })
  })

  it("absorbs legacy kickoff clarification into the same retained context", async () => {
    render(<Harness withLegacyClarification />)
    await screen.findByText("Keine Skills ausgewählt")

    await waitFor(() => {
      const output = screen.getByTestId("context-output")
      expect(output).toHaveTextContent("Welche Systeme sind betroffen?")
      expect(output).toHaveTextContent("SAP und das Data Warehouse")
      expect(output).toHaveTextContent("Frühere Kickoff-Rückfrage")
    })
  })

  it("can finish shared context without inventing a default skill", async () => {
    render(<Harness />)
    await screen.findByText("Keine Skills ausgewählt")

    fireEvent.click(
      screen.getByRole("button", { name: "Kontextdialog abschließen" }),
    )
    await waitFor(() => {
      expect(screen.getByTestId("context-output")).toHaveTextContent(
        '"finished":true',
      )
    })
    expect(screen.getByTestId("context-output")).toHaveTextContent(
      '"skill_coverage":[]',
    )
  })

  it("shows the exact client-visible version for a selected skill", async () => {
    listSkills.mockResolvedValue([skill(VERSION_1)])
    render(<Harness withSkill />)

    expect(await screen.findByText("Projekt-Risiken")).toBeInTheDocument()
    expect(screen.getByText(`Version: ${VERSION_1}`)).toBeInTheDocument()
    expect(screen.getAllByText("Klärung nötig").length).toBeGreaterThan(0)
  })
})

describe("synchronizeSkillCoverage", () => {
  it("marks an old version stale and opens the newly selected version", () => {
    const previous = synchronizeSkillCoverage(
      [],
      [{ skill_id: SKILL_ID, assignment_source: "manual_pm" }],
      [skill(VERSION_1)],
    )
    previous[0].state = "sufficient"

    const next = synchronizeSkillCoverage(
      previous,
      [{ skill_id: SKILL_ID, assignment_source: "manual_pm" }],
      [skill(VERSION_2)],
    )

    expect(next).toEqual([
      expect.objectContaining({
        skill_version_id: VERSION_1,
        state: "sufficient",
        stale: true,
      }),
      expect.objectContaining({
        skill_version_id: VERSION_2,
        state: "needs_clarification",
        stale: false,
      }),
    ])
  })

  it("keeps a removed skill as stale provenance", () => {
    const previous = synchronizeSkillCoverage(
      [],
      [{ skill_id: SKILL_ID, assignment_source: "manual_pm" }],
      [skill(VERSION_1)],
    )
    const next = synchronizeSkillCoverage(previous, [], [skill(VERSION_1)])
    expect(next[0]).toMatchObject({ skill_id: SKILL_ID, stale: true })
  })
})
