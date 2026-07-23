"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"

interface Option {
  value: string
  label: string
}

interface Props {
  /** Label shown above the picker. */
  label: string
  id: string
  options: readonly Option[]
  /** Currently-selected values. An empty array means "applies to all". */
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * PROJ-76 — toggle-badge multi-select for method / project-type tags.
 * shadcn `Badge` rendered as accessible toggle buttons; no third-party
 * multiselect. An empty selection reads as "gilt für alle".
 */
export function SkillTagPicker({
  label,
  id,
  options,
  value,
  onChange,
  disabled = false,
}: Props) {
  const toggle = (v: string) => {
    if (disabled) return
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <div className="space-y-2">
      <span id={`${id}-label`} className="text-sm font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((opt) => {
          const selected = value.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(opt.value)}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Badge
                variant={selected ? "default" : "outline"}
                className="cursor-pointer"
              >
                {opt.label}
              </Badge>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length === 0
          ? "Keine Auswahl = gilt für alle."
          : `${value.length} ausgewählt.`}
      </p>
    </div>
  )
}
