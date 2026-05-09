/**
 * PROJ-54-β-BUG-1 regression test.
 *
 * Bug: opening an existing resource with `daily_rate_override = 1000`
 * and pressing Save without touching the combobox previously sent
 * `{daily_rate_override: null, daily_rate_override_currency: null}`
 * to the API and silently nulled the DB row.
 *
 * Fix: only emit override fields on submit when the user actively
 * interacted with the combobox. This file pins that contract.
 */

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

// jsdom has no ResizeObserver; the shadcn Popover (used by the
// TagessatzCombobox) reads it via @radix-ui/react-use-size on mount.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

import type { ResourceInput } from "@/lib/resources/api"
import type { Resource } from "@/types/resource"

import { ResourceForm } from "./resource-form"

const RESOURCE_WITH_OVERRIDE: Resource = {
  id: "34bf1d5c-1966-4e7c-9bc4-e02950438af0",
  tenant_id: "tenant-1",
  source_stakeholder_id: null,
  linked_user_id: null,
  display_name: "Einer der s Kann",
  kind: "internal",
  fte_default: 1,
  availability_default: 1,
  is_active: true,
  daily_rate_override: 1000,
  daily_rate_override_currency: "EUR",
  recompute_status: null,
  created_by: "user-1",
  created_at: "2026-05-06T19:16:39.323742+00:00",
  updated_at: "2026-05-08T12:28:35.481806+00:00",
}

const RESOURCE_WITHOUT_OVERRIDE: Resource = {
  ...RESOURCE_WITH_OVERRIDE,
  id: "ab76f9d4-0a6d-45c0-949f-ee0b656d8677",
  display_name: "P7 Renamed",
  daily_rate_override: null,
  daily_rate_override_currency: null,
}

describe("ResourceForm — PROJ-54-β-BUG-1 (silent override null-out)", () => {
  it("does NOT send override fields when the user saves without touching the combobox (existing override)", async () => {
    const onSubmit = vi.fn(async (_input: ResourceInput) => {})
    render(
      <ResourceForm
        initial={RESOURCE_WITH_OVERRIDE}
        submitting={false}
        onSubmit={onSubmit}
        roleRates={[]}
        isTenantAdmin={true}
      />,
    )

    // Submit the form without touching the combobox at all.
    const form = screen.getByRole("button", { name: /speichern/i }).closest("form")!
    fireEvent.submit(form)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>
    // The whole point of the bug: override fields must NOT be in the
    // payload when untouched. Pre-fix, this used to be `{daily_rate_override: null, ...}`.
    expect(payload).not.toHaveProperty("daily_rate_override")
    expect(payload).not.toHaveProperty("daily_rate_override_currency")
    // Sanity: the rest of the form still submits.
    expect(payload.display_name).toBe(RESOURCE_WITH_OVERRIDE.display_name)
    expect(payload.kind).toBe("internal")
  })

  it("does NOT send override fields when saving an override-less resource untouched", async () => {
    const onSubmit = vi.fn(async (_input: ResourceInput) => {})
    render(
      <ResourceForm
        initial={RESOURCE_WITHOUT_OVERRIDE}
        submitting={false}
        onSubmit={onSubmit}
        roleRates={[]}
        isTenantAdmin={true}
      />,
    )

    const form = screen.getByRole("button", { name: /speichern/i }).closest("form")!
    fireEvent.submit(form)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(payload).not.toHaveProperty("daily_rate_override")
    expect(payload).not.toHaveProperty("daily_rate_override_currency")
  })

  it("does NOT send override fields on Create when user adds a name only", async () => {
    const onSubmit = vi.fn(async (_input: ResourceInput) => {})
    render(
      <ResourceForm
        submitting={false}
        onSubmit={onSubmit}
        roleRates={[]}
        isTenantAdmin={true}
      />,
    )

    const nameInput = screen.getByLabelText(/^name$/i)
    fireEvent.change(nameInput, { target: { value: "Brand New" } })
    const form = screen.getByRole("button", { name: /anlegen/i }).closest("form")!
    fireEvent.submit(form)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(payload).not.toHaveProperty("daily_rate_override")
    expect(payload).not.toHaveProperty("daily_rate_override_currency")
    expect(payload.display_name).toBe("Brand New")
  })
})
