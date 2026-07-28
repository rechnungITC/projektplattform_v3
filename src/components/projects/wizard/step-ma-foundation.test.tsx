/**
 * PROJ-94 — StepMaFoundation regression test.
 *
 * Bug (2026-07-28): `<FormLabel>Investitionsrahmen</FormLabel>` was used on
 * the outer group `<div>` — not inside a `<FormField>`. FormLabel calls
 * useFormField(), which throws when no FormField context is present, so
 * rendering the M&A wizard step crashed with "useFormField should be used
 * within <FormField>" and the user saw the generic error page.
 *
 * Fix: replaced the div+FormLabel group container with a semantic
 * <fieldset><legend>. This test pins the contract so a future revert
 * cannot land silently: rendering the step within a real FormProvider must
 * not throw, and the "Investitionsrahmen" group title must render as a
 * <legend>.
 *
 * The existing tests/PROJ-94-ma-foundation.spec.ts covers auth-gates + the
 * project-room card, but never opens the wizard step in-UI, which is why
 * the render crash slipped past CI.
 */

import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { useForm, FormProvider } from "react-hook-form"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { WizardData } from "@/types/wizard"
import { emptyMaFoundationData } from "@/types/ma-project"

// PROJ-96 — StepMaFoundation loads templates via useEffect on mount.
// Empty array keeps the picker rendered without an async API call.
vi.mock("@/lib/ma-project/templates-api", () => ({
  listMaProjectTemplates: vi.fn().mockResolvedValue([]),
}))

// ResponsibleUserPicker hits an API and mounts a Popover — mock to a plain
// input so the test stays purely about StepMaFoundation's JSX structure.
vi.mock("@/components/projects/responsible-user-picker", () => ({
  ResponsibleUserPicker: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <input
      data-testid="responsible-user-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

// jsdom lacks ResizeObserver; shadcn Popover / Radix Select read it on mount.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

// Dynamic import AFTER the vi.mock() calls so the mocks take effect.
async function loadStep() {
  const mod = await import("./step-ma-foundation")
  return mod.StepMaFoundation
}

function Harness() {
  const form = useForm<WizardData>({
    defaultValues: {
      name: "",
      description: "",
      project_number: "",
      planned_start_date: null,
      planned_end_date: null,
      responsible_user_id: "",
      project_type: "ma",
      project_method: null,
      type_specific_data: {},
      // ki_backlog + clarifying blocks live on WizardData but aren't touched
      // by this step; cast keeps the harness independent of unrelated shape
      // changes on those sibling blocks.
      ma_foundation: emptyMaFoundationData(),
    } as unknown as WizardData,
  })
  const StepMaFoundationLazy = (globalThis as unknown as {
    __StepMaFoundation: React.ComponentType<{ tenantId: string }>
  }).__StepMaFoundation
  return (
    <FormProvider {...form}>
      <StepMaFoundationLazy tenantId="tenant-e2e" />
    </FormProvider>
  )
}

describe("StepMaFoundation — PROJ-94 render regression (FormLabel-in-FormField)", () => {
  beforeAll(async () => {
    const StepMaFoundation = await loadStep()
    ;(globalThis as unknown as {
      __StepMaFoundation: typeof StepMaFoundation
    }).__StepMaFoundation = StepMaFoundation
  })

  it("renders without throwing when mounted in a real FormProvider", () => {
    // The bug was a render-time throw. If a future edit puts a bare
    // <FormLabel> outside a <FormField>, this render() call throws with
    // "useFormField should be used within <FormField>" and the test fails.
    expect(() => render(<Harness />)).not.toThrow()
  })

  it("renders the 'Investitionsrahmen' group as a <legend>", () => {
    render(<Harness />)
    // The fix replaced div+FormLabel with fieldset+legend for semantic
    // grouping. Screen readers announce "Investitionsrahmen" as the
    // fieldset group name when focusing the inner amount/currency/note
    // inputs.
    const legend = screen.getByText("Investitionsrahmen")
    expect(legend).toBeInTheDocument()
    expect(legend.tagName).toBe("LEGEND")
    expect(legend.closest("fieldset")).not.toBeNull()
  })

  it("keeps the sponsor and deal-rationale labels as real FormLabels (unchanged)", () => {
    render(<Harness />)
    // Sanity: this step still has proper per-field labels for the other
    // inputs; only the group-title label was moved to <legend>.
    expect(screen.getByText("Sponsor *")).toBeInTheDocument()
    expect(screen.getByText("Deal-Rationale")).toBeInTheDocument()
    expect(screen.getByText("Deal-Variante")).toBeInTheDocument()
  })
})
