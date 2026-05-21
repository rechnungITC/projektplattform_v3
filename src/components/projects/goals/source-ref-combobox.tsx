"use client"

/**
 * PROJ-65 ε.3a — SourceRefCombobox (F-PROJ-65-22 lock).
 *
 * Single Combobox with Section-Headern für Phasen / Meilensteine /
 * "Keine Quelle". Verhindert User-Confusion gegenüber zwei separaten
 * Pickers. Folgt PROJ-57/PROJ-62 Combobox-Pattern.
 */

import { Check, ChevronsUpDown, Flag, Link2Off, Map } from "lucide-react"
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

export interface SourceRefOption {
  id: string
  label: string
  kind: "phase" | "milestone"
}

export interface SourceRefValue {
  kind: "phase" | "milestone" | "none"
  id: string | null
}

interface SourceRefComboboxProps {
  phases: SourceRefOption[]
  milestones: SourceRefOption[]
  value: SourceRefValue
  onChange: (value: SourceRefValue) => void
  disabled?: boolean
  ariaLabel?: string
}

export function SourceRefCombobox({
  phases,
  milestones,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Quelle für Goal",
}: SourceRefComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const display = React.useMemo(() => {
    if (value.kind === "none") return "Keine Quelle"
    if (value.kind === "phase") {
      const p = phases.find((opt) => opt.id === value.id)
      return p ? `Phase: ${p.label}` : "Phase (gelöscht)"
    }
    const m = milestones.find((opt) => opt.id === value.id)
    return m ? `Meilenstein: ${m.label}` : "Meilenstein (gelöscht)"
  }, [value, phases, milestones])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between font-normal"
          data-testid="source-ref-combobox-trigger"
        >
          <span className="truncate">{display}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Suche oder auswählen…" />
          <CommandList>
            <CommandEmpty>Keine Treffer.</CommandEmpty>
            {phases.length > 0 && (
              <CommandGroup heading="Phasen">
                {phases.map((opt) => {
                  const selected =
                    value.kind === "phase" && value.id === opt.id
                  return (
                    <CommandItem
                      key={`phase:${opt.id}`}
                      value={`phase ${opt.label}`}
                      onSelect={() => {
                        onChange({ kind: "phase", id: opt.id })
                        setOpen(false)
                      }}
                    >
                      <Map className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="truncate">{opt.label}</span>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {milestones.length > 0 && (
              <CommandGroup heading="Meilensteine">
                {milestones.map((opt) => {
                  const selected =
                    value.kind === "milestone" && value.id === opt.id
                  return (
                    <CommandItem
                      key={`milestone:${opt.id}`}
                      value={`milestone ${opt.label}`}
                      onSelect={() => {
                        onChange({ kind: "milestone", id: opt.id })
                        setOpen(false)
                      }}
                    >
                      <Flag className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="truncate">{opt.label}</span>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            <CommandGroup heading="Keine Quelle">
              <CommandItem
                value="keine quelle"
                onSelect={() => {
                  onChange({ kind: "none", id: null })
                  setOpen(false)
                }}
              >
                <Link2Off className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span>Kein Source-Ref</span>
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    value.kind === "none" ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
