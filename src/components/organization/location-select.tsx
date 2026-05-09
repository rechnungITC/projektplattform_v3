"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Location } from "@/types/organization"

interface LocationSelectProps {
  value: string | null
  onChange: (next: string | null) => void
  locations: ReadonlyArray<Location>
  placeholder?: string
  disabled?: boolean
}

const NONE_VALUE = "__none__"

/**
 * PROJ-62 — simple location picker for the Org-Edit-Dialog.
 *
 * Locations are usually a small list per tenant; a Select-with-search
 * is overkill. Falls back to "Kein Standort" when value is null.
 */
export function LocationSelect({
  value,
  onChange,
  locations,
  placeholder = "Kein Standort",
  disabled = false,
}: LocationSelectProps) {
  return (
    <Select
      value={value ?? NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {locations
          .filter((l) => l.is_active)
          .map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
              {l.city ? ` — ${l.city}` : ""}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
