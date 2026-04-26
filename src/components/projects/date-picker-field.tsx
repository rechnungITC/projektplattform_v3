"use client"

import { format } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerFieldProps {
  value: Date | null | undefined
  onChange: (date: Date | null) => void
  /** Optional minimum selectable date (e.g. start_date for the end-date picker). */
  minDate?: Date | null
  disabled?: boolean
  placeholder?: string
  id?: string
  ariaLabel?: string
  className?: string
}

/**
 * Date picker — a Popover-wrapped Calendar trigger button with optional clear.
 * Uses native browser date formatting when date-fns is unavailable.
 */
export function DatePickerField({
  value,
  onChange,
  minDate,
  disabled = false,
  placeholder = "Pick a date",
  id,
  ariaLabel,
  className,
}: DatePickerFieldProps) {
  const formatted = value ? formatDate(value) : null

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
            {formatted ?? placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => onChange(d ?? null)}
            disabled={(date) => {
              if (!minDate) return false
              return date < minDate
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

function formatDate(date: Date): string {
  try {
    return format(date, "PPP")
  } catch {
    return date.toISOString().slice(0, 10)
  }
}
