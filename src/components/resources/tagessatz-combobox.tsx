"use client"

/**
 * PROJ-54-β — Tagessatz-Combobox.
 *
 * Single input that lets a tenant-admin pick from the existing role_rates
 * catalog ("Senior Developer — 950 €/Tag") OR type an inline override
 * ("1500 EUR" → daily_rate=1500, currency=EUR). Three semantics:
 *
 *   1. Selection from the catalog
 *      → selectedRoleKey: string, override: null
 *      → resource resolves via stakeholder.role_key + role_rates
 *
 *   2. Inline override typed as `<amount> <currency>` (e.g. "1500 EUR")
 *      → selectedRoleKey: null, override: { amount, currency }
 *      → resource gets daily_rate_override directly
 *
 *   3. Empty
 *      → selectedRoleKey: null, override: null
 *      → resource has no rate; banner / validation kicks in upstream
 *
 * The component is presentation + parser only. Validation, persistence
 * and admin-permission gating happen in the parent form.
 */

import { Check, ChevronsUpDown, Sparkles } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { RoleRate } from "@/types/role-rate"
import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export interface OverrideValue {
  daily_rate: number
  currency: string
}

export interface TagessatzComboboxValue {
  /** Role chosen from the role_rates catalog. NULL when an override is used or nothing selected. */
  role_key: string | null
  /** Inline override entered by the user. NULL when a role is chosen or nothing selected. */
  override: OverrideValue | null
}

interface TagessatzComboboxProps {
  /** Latest applicable rates from the tenant role_rates catalog. */
  roleRates: ReadonlyArray<RoleRate>
  /** Currently selected value. Pass `{ role_key: null, override: null }` for "empty". */
  value: TagessatzComboboxValue
  /** Called whenever the user picks a role, types an override, or clears. */
  onChange: (next: TagessatzComboboxValue) => void
  /**
   * When true, the inline-override hint + parsing are disabled — only role
   * selection is allowed. Drives AC-12 (non-admins see role-only UX).
   */
  rolesOnly?: boolean
  disabled?: boolean
  /**
   * Empty-state message in the dropdown when search produces no role
   * matches and no inline-override could be parsed.
   */
  emptyHint?: string
}

const CURRENCY_PATTERN =
  /^\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(EUR|USD|CHF|GBP|JPY|€|\$|£|¥)?\s*$/i

function parseInlineOverride(input: string): OverrideValue | null {
  const m = CURRENCY_PATTERN.exec(input)
  if (!m) return null
  const amount = Number.parseFloat(m[1]!.replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const symbol = (m[2] ?? "EUR").toUpperCase()
  const currency =
    symbol === "€"
      ? "EUR"
      : symbol === "$"
        ? "USD"
        : symbol === "£"
          ? "GBP"
          : symbol === "¥"
            ? "JPY"
            : symbol
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return null
  }
  return { daily_rate: amount, currency }
}

function formatRate(daily: number, currency: string): string {
  return `${daily.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}/Tag`
}

/**
 * Reduce role_rates to one "latest applicable" entry per role_key, sorted
 * alphabetically. Mirrors the SQL helper's resolution semantics for UX.
 */
function latestRatesByRoleKey(
  rates: ReadonlyArray<RoleRate>,
): RoleRate[] {
  const today = new Date().toISOString().slice(0, 10)
  const byKey = new Map<string, RoleRate>()
  for (const r of rates) {
    if (r.valid_from > today) continue
    const seen = byKey.get(r.role_key)
    if (!seen || r.valid_from > seen.valid_from) {
      byKey.set(r.role_key, r)
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.role_key.localeCompare(b.role_key, "de"),
  )
}

export function TagessatzCombobox({
  roleRates,
  value,
  onChange,
  rolesOnly = false,
  disabled = false,
  emptyHint = "Keine Rolle gefunden — Tippe einen Betrag, z.B. '1500 EUR'.",
}: TagessatzComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const latestRates = React.useMemo(
    () => latestRatesByRoleKey(roleRates),
    [roleRates],
  )

  const inlineOverride = React.useMemo(() => {
    if (rolesOnly) return null
    const trimmed = search.trim()
    if (trimmed.length === 0) return null
    return parseInlineOverride(trimmed)
  }, [search, rolesOnly])

  const triggerLabel = (() => {
    if (value.override) {
      return `Eigener Satz — ${formatRate(value.override.daily_rate, value.override.currency)}`
    }
    if (value.role_key) {
      const rate = latestRates.find((r) => r.role_key === value.role_key)
      if (rate) {
        return `${rate.role_key} — ${formatRate(rate.daily_rate, rate.currency)}`
      }
      return `${value.role_key} — Tagessatz fehlt`
    }
    return "Tagessatz wählen oder eintippen"
  })()

  function pickRole(rate: RoleRate) {
    onChange({ role_key: rate.role_key, override: null })
    setSearch("")
    setOpen(false)
  }

  function pickOverride(parsed: OverrideValue) {
    onChange({ role_key: null, override: parsed })
    setSearch("")
    setOpen(false)
  }

  function clear() {
    onChange({ role_key: null, override: null })
    setSearch("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between",
            !value.override && !value.role_key && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {value.override ? (
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : null}
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder={
              rolesOnly
                ? "Rolle suchen…"
                : "Rolle suchen oder eigenen Betrag, z.B. '1500 EUR' …"
            }
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyHint}</CommandEmpty>
            {latestRates.length > 0 ? (
              <CommandGroup heading="Aus dem Rollen-Katalog">
                {latestRates.map((rate) => {
                  const isSelected =
                    value.role_key === rate.role_key && !value.override
                  return (
                    <CommandItem
                      key={rate.id}
                      value={`${rate.role_key} ${rate.daily_rate} ${rate.currency}`}
                      onSelect={() => pickRole(rate)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-1 items-baseline justify-between gap-3">
                        <span className="truncate font-medium">{rate.role_key}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRate(rate.daily_rate, rate.currency)}
                        </span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
            {inlineOverride ? (
              <CommandGroup heading="Eigener Satz">
                <CommandItem
                  value="__override__"
                  onSelect={() => pickOverride(inlineOverride)}
                >
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                  <div className="flex flex-1 items-baseline justify-between gap-3">
                    <span className="truncate">
                      Eigener Satz: {formatRate(inlineOverride.daily_rate, inlineOverride.currency)}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Override
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {(value.role_key || value.override) ? (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={clear}>
                  <span className="text-muted-foreground">Auswahl entfernen</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Exported for unit testing the parser in isolation.
export { parseInlineOverride as __parseInlineOverrideForTest }
