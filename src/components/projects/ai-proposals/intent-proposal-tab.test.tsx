/**
 * PROJ-153-α — Tests der Prüfansicht.
 *
 * Der Schwerpunkt liegt auf der **Absage**, nicht auf der Liste: live liegen
 * 30 von 31 Projekten unter der Substanz-Schwelle, das ist also die Fläche,
 * die fast jeder Nutzer sieht. Sie am schlechtesten zu prüfen wäre genau
 * verkehrt herum.
 *
 * Zweiter Schwerpunkt: das Herkunftsmerkmal (Lock L2). Es kommt aus dem Zweck
 * und nicht aus der Modellantwort — die Fläche muss es deshalb auch dann
 * zeigen, wenn die Nutzlast so etwas gar nicht enthält.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const triggerMock = vi.fn()
const listMock = vi.fn()
const acceptMock = vi.fn()
const undoMock = vi.fn()

vi.mock("@/lib/ai-proposals/work-items-from-intent-api", () => ({
  triggerWorkItemsFromIntent: (...a: unknown[]) => triggerMock(...a),
  listWorkItemsFromIntentSuggestions: (...a: unknown[]) => listMock(...a),
  acceptWorkItemsFromIntent: (...a: unknown[]) => acceptMock(...a),
  undoWorkItemsFromIntentAccept: (...a: unknown[]) => undoMock(...a),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { IntentProposalTab } from "./intent-proposal-tab"

function draft(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "s-1",
    purpose: "work_items_from_project_intent",
    status: "draft",
    created_at: new Date().toISOString(),
    payload: {
      temp_id: "t_1",
      parent_temp_id: null,
      title: "Datenmigration aus dem Altsystem",
      description: null,
      kind: "story",
      confidence: "high",
      ...over,
    },
  }
}

beforeEach(() => {
  triggerMock.mockReset()
  listMock.mockReset().mockResolvedValue([])
  acceptMock.mockReset()
  undoMock.mockReset()
})

describe("IntentProposalTab", () => {
  it("nennt bei zu dünnem Vorhaben die Zahl statt nur 'zu wenig'", async () => {
    triggerMock.mockResolvedValue({
      status: "substance_rejected",
      run_id: null,
      classification: 1,
      provider: null,
      model_id: null,
      suggestion_ids: [],
      external_blocked: false,
      substance: {
        human_chars: 97,
        answered_count: 0,
        required_chars: 400,
        required_answers: 4,
        message:
          "Ihr Vorhaben umfasst 97 Zeichen; für belastbare Vorschläge werden 400 benötigt.",
      },
    })

    const { getByTestId } = render(<IntentProposalTab projectId="p-1" />)
    getByTestId("intent-generate").click()

    await waitFor(() => {
      expect(screen.getByTestId("intent-substance-rejected")).toBeInTheDocument()
    })
    // Die Zahlen sind die Auskunft. Ohne sie muss der Nutzer raten, wie viel
    // zu wenig — bei der Fläche, die fast jeder sieht.
    expect(screen.getByText(/97 Zeichen/)).toBeInTheDocument()
    expect(screen.getByText(/400/)).toBeInTheDocument()
  })

  it("zeigt das Herkunftsmerkmal, obwohl die Nutzlast keines trägt", async () => {
    // Lock L2: die Herkunft folgt aus dem ZWECK. Stünde sie in der Nutzlast,
    // könnte ein Skill sie fälschen — PROJ-91 hat live belegt, dass das Modell
    // Antwortfelder unter Prompt-Druck kippt.
    listMock.mockResolvedValue([draft()])
    render(<IntentProposalTab projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getByTestId("intent-origin-badge")).toBeInTheDocument()
    })
    expect(screen.getByTestId("intent-origin-badge")).toHaveTextContent(
      /abgeleitet, nicht belegt/,
    )
  })

  it("erklärt ein leeres Ergebnis, statt eine leere Fläche zu zeigen", async () => {
    triggerMock.mockResolvedValue({
      status: "success",
      run_id: "r-1",
      classification: 2,
      provider: "openai",
      model_id: "gpt-4o",
      suggestion_ids: [],
      external_blocked: false,
      reason_code: null,
    })

    const { getByTestId } = render(<IntentProposalTab projectId="p-1" />)
    getByTestId("intent-generate").click()

    await waitFor(() => {
      expect(
        screen.getByText(/keine belastbaren Arbeitspakete/),
      ).toBeInTheDocument()
    })
    // Der Satz muss sagen, dass wenig ein ZULÄSSIGES Ergebnis ist — sonst
    // liest sich die leere Liste wie ein Defekt.
    expect(screen.getByText(/zulässiges Ergebnis/)).toBeInTheDocument()
  })

  it("nennt bei blockiertem Lauf den Grund (PROJ-137)", async () => {
    triggerMock.mockResolvedValue({
      status: "external_blocked",
      run_id: "r-1",
      classification: 3,
      provider: "stub",
      model_id: "stub",
      suggestion_ids: [],
      external_blocked: true,
      reason_code: "class3_blocked",
    })

    const { getByTestId } = render(<IntentProposalTab projectId="p-1" />)
    getByTestId("intent-generate").click()

    await waitFor(() => {
      expect(screen.getByTestId("intent-reason-banner")).toBeInTheDocument()
    })
  })

  it("rückt Kinder ein, ohne die Hierarchie im Browser nachzubauen", async () => {
    listMock.mockResolvedValue([
      draft(),
      { ...draft(), id: "s-2", payload: { ...draft().payload, temp_id: "t_2", parent_temp_id: "t_1", title: "Feldabgleich" } },
    ])
    const { container } = render(<IntentProposalTab projectId="p-1" />)

    await waitFor(() => {
      expect(screen.getAllByTestId("intent-suggestion")).toHaveLength(2)
    })
    const items = container.querySelectorAll("[data-testid='intent-suggestion']")
    expect((items[0] as HTMLElement).style.marginLeft).toBe("0px")
    expect((items[1] as HTMLElement).style.marginLeft).toBe("16px")
  })

  it("übersteht eine zyklische Elternkette ohne Endlosschleife", async () => {
    // Das Schema verhindert Zyklen serverseitig; die Fläche darf sich
    // trotzdem nicht auf eine Zusage verlassen, die sie nicht selbst hält.
    listMock.mockResolvedValue([
      { ...draft(), id: "a", payload: { ...draft().payload, temp_id: "t_a", parent_temp_id: "t_b" } },
      { ...draft(), id: "b", payload: { ...draft().payload, temp_id: "t_b", parent_temp_id: "t_a" } },
    ])
    render(<IntentProposalTab projectId="p-1" />)
    await waitFor(() => {
      expect(screen.getAllByTestId("intent-suggestion")).toHaveLength(2)
    })
  })
})
