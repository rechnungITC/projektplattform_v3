/**
 * PROJ-Y-3 — WizardClient: hold navigation when the transition autosave fails.
 *
 * Bug (found by the same PROJ-94 investigation that hit the M&A step render
 * crash, 2026-07-28): `goToStep()` auto-saved the draft on a forward
 * transition but advanced the step regardless of whether `persistDraft()`
 * succeeded:
 *
 *     await persistDraft(form.getValues(), { silent: true })
 *     setStep(target)   // ran even when persistDraft returned null
 *
 * On a network/500 error or an optimistic-lock conflict, `persistDraft`
 * returns null (and has already surfaced an error toast / conflict banner),
 * yet the user still progressed to the next step on top of a stale/failed
 * server draft. The finalize path (`onCreate`) and `onCancelSaveAndExit`
 * already guarded on the null return; the transition path did not.
 *
 * Fix: `goToStep` advances only when `persistDraft` returns a saved draft.
 * These tests pin both directions: a rejecting `saveDraft` holds the user on
 * the current step; a resolving `saveDraft` still advances.
 *
 * The child step components mount Radix Select/Popover/DatePicker that jsdom
 * can't drive, and the guard validates the FORM (not the child JSX), so the
 * steps are replaced with trivial `data-testid` stand-ins to keep the test
 * focused on WizardClient's transition logic.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const TENANT = "11111111-1111-4111-8111-111111111111"
const USER = "22222222-2222-4222-8222-222222222222"
const RESP = "33333333-3333-4333-8333-333333333333"

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: USER },
    currentTenant: { id: TENANT },
  }),
}))

vi.mock("@/hooks/use-wizard-overrides", () => ({
  useWizardOverrides: () => ({
    projectTypeOverrides: new Map(),
    methodEnabled: {},
    hasMethodOverrides: false,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const saveDraft = vi.fn()
const getDraft = vi.fn()
class DraftConflictError extends Error {
  current: { id: string; updated_at: string; data: unknown }
  constructor(current: { id: string; updated_at: string; data: unknown }) {
    super("conflict")
    this.name = "DraftConflictError"
    this.current = current
  }
}
vi.mock("@/lib/wizard/draft-storage", () => ({
  DraftConflictError,
  saveDraft: (...a: unknown[]) => saveDraft(...a),
  getDraft: (...a: unknown[]) => getDraft(...a),
  finalizeDraft: vi.fn(),
  discardDraft: vi.fn(),
}))

// Seed the form valid on the basics step so validateStep("basics") passes
// synchronously at mount (no draft-hydration race). Keeps the real
// visibleWizardSteps / WIZARD_STEP_LABELS.
vi.mock("@/types/wizard", async (orig) => {
  const actual = await orig<typeof import("@/types/wizard")>()
  return {
    ...actual,
    emptyWizardData: (id: string) => ({
      ...actual.emptyWizardData(id),
      name: "ERP-Migration 2026",
      responsible_user_id: RESP,
    }),
  }
})

// Trivial step stand-ins — the transition guard doesn't depend on their JSX.
vi.mock("./step-basics", () => ({
  StepBasics: () => <div data-testid="step-basics" />,
}))
vi.mock("./step-type", () => ({
  StepType: () => <div data-testid="step-type" />,
}))
vi.mock("./step-method", () => ({ StepMethod: () => <div /> }))
vi.mock("./step-followups", () => ({ StepFollowups: () => <div /> }))
vi.mock("./step-ma-foundation", () => ({ StepMaFoundation: () => <div /> }))
vi.mock("./step-ki-backlog", () => ({ StepKiBacklog: () => <div /> }))
vi.mock("./step-clarifying", () => ({ StepClarifying: () => <div /> }))
vi.mock("./step-review", () => ({ StepReview: () => <div /> }))

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

beforeEach(() => {
  saveDraft.mockReset()
  getDraft.mockReset()
})

async function loadWizard() {
  const mod = await import("./wizard-client")
  return mod.WizardClient
}

describe("WizardClient — PROJ-Y-3 hold navigation on failed autosave", () => {
  it("stays on the current step when the transition autosave rejects", async () => {
    saveDraft.mockRejectedValue(new Error("network down"))
    const WizardClient = await loadWizard()
    render(<WizardClient />)

    expect(await screen.findByTestId("step-basics")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }))

    // The save WAS attempted on the transition...
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1))
    // ...but it failed, so navigation is held: still basics, type never mounts.
    await waitFor(() =>
      expect(screen.queryByTestId("step-type")).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId("step-basics")).toBeInTheDocument()
  })

  it("holds navigation on an optimistic-lock conflict (persistDraft returns null)", async () => {
    saveDraft.mockRejectedValue(
      new DraftConflictError({
        id: "draft-1",
        updated_at: "2026-08-04T00:00:00.000Z",
        data: {},
      }),
    )
    const WizardClient = await loadWizard()
    render(<WizardClient />)

    expect(await screen.findByTestId("step-basics")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }))

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.queryByTestId("step-type")).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId("step-basics")).toBeInTheDocument()
  })

  it("advances to the next step when the transition autosave succeeds", async () => {
    saveDraft.mockResolvedValue({
      id: "draft-1",
      updated_at: "2026-08-04T00:01:00.000Z",
    })
    const WizardClient = await loadWizard()
    render(<WizardClient />)

    expect(await screen.findByTestId("step-basics")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }))

    // Save succeeded → navigation proceeds to the type step.
    expect(await screen.findByTestId("step-type")).toBeInTheDocument()
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })
})
