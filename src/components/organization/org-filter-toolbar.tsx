"use client"

import { Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  ORGANIZATION_UNIT_TYPES,
  ORGANIZATION_UNIT_TYPE_LABELS,
  type Location,
  type OrganizationUnitType,
} from "@/types/organization"

export interface OrgFilterState {
  search: string
  types: OrganizationUnitType[]
  locationIds: string[]
  showInactive: boolean
  showVendors: boolean
}

interface OrgFilterToolbarProps {
  filters: OrgFilterState
  onChange: (next: OrgFilterState) => void
  locations: Location[]
  /** True only when in Tree-tab; in the table-tab vendors aren't relevant. */
  vendorsToggleAvailable?: boolean
  /** Total visible vs hidden — caller passes for the "X von Y" display. */
  visibleCount?: number
  totalCount?: number
}

export function OrgFilterToolbar({
  filters,
  onChange,
  locations,
  vendorsToggleAvailable = true,
  visibleCount,
  totalCount,
}: OrgFilterToolbarProps) {
  function toggleType(type: OrganizationUnitType) {
    const next = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type]
    onChange({ ...filters, types: next })
  }

  function toggleLocation(id: string) {
    const next = filters.locationIds.includes(id)
      ? filters.locationIds.filter((x) => x !== id)
      : [...filters.locationIds, id]
    onChange({ ...filters, locationIds: next })
  }

  const activeFilterCount =
    filters.types.length +
    filters.locationIds.length +
    (filters.showInactive ? 1 : 0) +
    (filters.search.trim() ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(e) =>
              onChange({ ...filters, search: e.target.value })
            }
            placeholder="Name, Code, Beschreibung suchen…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="org-show-inactive" className="text-sm">
            Inaktive zeigen
          </Label>
          <Switch
            id="org-show-inactive"
            checked={filters.showInactive}
            onCheckedChange={(v) =>
              onChange({ ...filters, showInactive: v })
            }
          />
        </div>
        {vendorsToggleAvailable ? (
          <div className="flex items-center gap-3">
            <Label htmlFor="org-show-vendors" className="text-sm">
              Vendors einblenden
            </Label>
            <Switch
              id="org-show-vendors"
              checked={filters.showVendors}
              onCheckedChange={(v) =>
                onChange({ ...filters, showVendors: v })
              }
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Typen:</span>
        {ORGANIZATION_UNIT_TYPES.map((t) => {
          const active = filters.types.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
              aria-pressed={active}
            >
              {ORGANIZATION_UNIT_TYPE_LABELS[t]}
            </button>
          )
        })}
      </div>

      {locations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Standorte:</span>
          {locations
            .filter((l) => l.is_active)
            .map((l) => {
              const active = filters.locationIds.includes(l.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLocation(l.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                  aria-pressed={active}
                >
                  {l.name}
                </button>
              )
            })}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {visibleCount != null && totalCount != null
            ? `${visibleCount} von ${totalCount} Einheiten sichtbar`
            : null}
        </span>
        {activeFilterCount > 0 ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeFilterCount} Filter aktiv</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  search: "",
                  types: [],
                  locationIds: [],
                  showInactive: false,
                  showVendors: filters.showVendors,
                })
              }
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
