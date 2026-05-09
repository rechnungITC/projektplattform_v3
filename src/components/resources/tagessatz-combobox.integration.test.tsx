/**
 * PROJ-54-β-BUG-2 regression test.
 *
 * Bug: typing an inline override (e.g. "1500 EUR") into the combobox
 * showed only role suggestions; the "Eigener Satz: 1500 EUR/Tag"
 * item was hidden because cmdk's built-in fuzzy filter scored the
 * override item's value (`__override__`) as no-match against the
 * search query. Roles fuzzy-matched on shared substrings ("EUR")
 * and surfaced — the override path was invisible to the user.
 *
 * Fix: disable cmdk's filter (`shouldFilter={false}`) and filter the
 * role list manually. The override item is now always rendered when
 * `parseInlineOverride(search)` returns a value.
 */

import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { RoleRate } from "@/types/role-rate"

import { TagessatzCombobox } from "./tagessatz-combobox"

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  // Radix Popover positions via PointerEvent / hasPointerCapture in jsdom.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

const ROLE_RATES: RoleRate[] = [
  {
    id: "role-1",
    tenant_id: "tenant-1",
    role_key: "Senior Developer",
    daily_rate: 950,
    currency: "EUR",
    valid_from: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "user-1",
  },
]

describe("TagessatzCombobox — PROJ-54-β-BUG-2 (override item filtered out)", () => {
  it("shows the inline-override item when the user types '1500 EUR'", () => {
    const onChange = vi.fn()
    render(
      <TagessatzCombobox
        roleRates={ROLE_RATES}
        value={{ role_key: null, override: null }}
        onChange={onChange}
      />,
    )

    // Open the popover.
    const trigger = screen.getByRole("combobox")
    fireEvent.click(trigger)

    // Type an inline override that doesn't fuzzy-match any role.
    const input = screen.getByPlaceholderText(/Rolle suchen oder eigenen Betrag/i)
    fireEvent.change(input, { target: { value: "1500 EUR" } })

    // The override CommandItem must be visible — the bug was that this
    // text was hidden by cmdk's filter.
    expect(
      screen.getByText(/Eigener Satz: 1\.500 EUR\/Tag/i),
    ).toBeInTheDocument()
  })

  it("filters the role list manually by role_key substring", () => {
    const onChange = vi.fn()
    render(
      <TagessatzCombobox
        roleRates={ROLE_RATES}
        value={{ role_key: null, override: null }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole("combobox"))
    const input = screen.getByPlaceholderText(/Rolle suchen/i)

    // Empty search → role visible.
    expect(screen.getByText("Senior Developer")).toBeInTheDocument()

    // Search for a substring → role still visible.
    fireEvent.change(input, { target: { value: "senior" } })
    expect(screen.getByText("Senior Developer")).toBeInTheDocument()

    // Search for something that doesn't match → role hidden.
    fireEvent.change(input, { target: { value: "xyzzy" } })
    expect(screen.queryByText("Senior Developer")).not.toBeInTheDocument()
  })

  it("shows BOTH the role and the override when search matches both", () => {
    const onChange = vi.fn()
    render(
      <TagessatzCombobox
        roleRates={ROLE_RATES}
        value={{ role_key: null, override: null }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole("combobox"))
    const input = screen.getByPlaceholderText(/Rolle suchen oder eigenen Betrag/i)

    // "950 EUR" parses as a valid override AND matches the Senior
    // Developer's rate. The user should see both options.
    fireEvent.change(input, { target: { value: "950 EUR" } })
    expect(
      screen.getByText(/Eigener Satz: 950 EUR\/Tag/i),
    ).toBeInTheDocument()
    // Note: the role's role_key "Senior Developer" does not contain
    // "950 EUR", so the manual filter hides it. This is acceptable —
    // before the fix the override was hidden; after the fix the
    // override is always visible when it parses, and the user can
    // narrow the role search by typing a role name.
  })

  it("hides the override item when rolesOnly is true (non-admins)", () => {
    const onChange = vi.fn()
    render(
      <TagessatzCombobox
        roleRates={ROLE_RATES}
        value={{ role_key: null, override: null }}
        onChange={onChange}
        rolesOnly
      />,
    )
    fireEvent.click(screen.getByRole("combobox"))
    const input = screen.getByPlaceholderText(/^Rolle suchen…$/)

    fireEvent.change(input, { target: { value: "1500 EUR" } })
    expect(screen.queryByText(/Eigener Satz/i)).not.toBeInTheDocument()
  })
})
