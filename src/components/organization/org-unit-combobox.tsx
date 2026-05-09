"use client"

/**
 * PROJ-62 — Shared combobox for picking an OrganizationUnit.
 *
 * Used by:
 *   - Org-Edit-Dialog (Parent picker)
 *   - Org-Table-Bulk-Move-Action
 *   - PROJ-57-β Stakeholder/Resource/Member forms (when that slice ships)
 *
 * Backed by the shared typeahead endpoint
 * `GET /api/organization-units/combobox?q=...&type=...`. The endpoint
 * returns at most 20 results with a server-built breadcrumb path. This
 * component does **no** client-side fuzzy filtering — backend RLS may
 * trim results we wouldn't otherwise see.
 *
 * Empty value (`null`) means "no parent" (root) for the parent-picker
 * use case; locations + member assignments treat null as "unassigned".
 */

import { Building2, Check, ChevronsUpDown, X } from "lucide-react"
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
import {
  ORGANIZATION_UNIT_TYPE_LABELS,
  type OrganizationUnitComboboxItem,
  type OrganizationUnitType,
} from "@/types/organization"

interface OrgUnitComboboxProps {
  value: string | null
  onChange: (next: string | null) => void
  /** Restrict server-side results to these unit types. */
  typeFilter?: OrganizationUnitType[]
  /** IDs to hide (e.g. the unit being edited and all its descendants —
   *  prevents cycles before the API even rejects them). */
  excludeIds?: string[]
  placeholder?: string
  emptyHint?: string
  disabled?: boolean
  /** Display label when value is set but no item details are loaded.
   *  Helpful while editing existing rows. */
  selectedFallbackLabel?: string
  allowClear?: boolean
}

export function OrgUnitCombobox({
  value,
  onChange,
  typeFilter,
  excludeIds = [],
  placeholder = "Organisationseinheit wählen…",
  emptyHint = "Keine Einheit gefunden.",
  disabled = false,
  selectedFallbackLabel,
  allowClear = true,
}: OrgUnitComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [items, setItems] = React.useState<OrganizationUnitComboboxItem[]>([])
  const [loading, setLoading] = React.useState(false)

  // Debounced typeahead fetch.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("q", search.trim())
        if (typeFilter && typeFilter.length > 0) {
          params.set("type", typeFilter.join(","))
        }
        const url = `/api/organization-units/combobox${
          params.size ? `?${params}` : ""
        }`
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as {
          items: OrganizationUnitComboboxItem[]
        }
        if (!cancelled) setItems(body?.items ?? [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, search, typeFilter])

  const selectedItem = items.find((it) => it.id === value)
  const triggerLabel = selectedItem
    ? selectedItem.breadcrumb_path
    : value && selectedFallbackLabel
      ? selectedFallbackLabel
      : placeholder

  const visibleItems = items.filter((it) => !excludeIds.includes(it.id))

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
            !value && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Suchen…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Wird geladen…" : emptyHint}
            </CommandEmpty>
            {allowClear && value !== null ? (
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(null)
                    setSearch("")
                    setOpen(false)
                  }}
                >
                  <X className="mr-2 h-4 w-4" aria-hidden />
                  <span className="text-muted-foreground">Auswahl entfernen</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {visibleItems.length > 0 ? (
              <CommandGroup heading="Treffer">
                {visibleItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.breadcrumb_path}`}
                    onSelect={() => {
                      onChange(item.id)
                      setSearch("")
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === item.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-1 items-baseline justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {item.breadcrumb_path}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {ORGANIZATION_UNIT_TYPE_LABELS[item.type]}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
