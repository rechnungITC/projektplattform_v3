"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { DatePickerField } from "@/components/projects/date-picker-field"
import { Button } from "@/components/ui/button"
import { dateToIsoDate } from "@/lib/dates/iso-date"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ALLOWED_MILESTONE_TRANSITIONS,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  type MilestoneStatus,
} from "@/types/milestone"

const milestoneStatusSchema = z
  .object({
    to_status: z.enum(MILESTONE_STATUSES),
    actual_date: z.date().nullable().optional(),
  })
  .refine(
    (values) => {
      if (values.to_status === "achieved") {
        return values.actual_date instanceof Date
      }
      return true
    },
    {
      message: "Beim Status „Erreicht“ ist ein Ist-Datum erforderlich",
      path: ["actual_date"],
    }
  )

type MilestoneStatusValues = z.infer<typeof milestoneStatusSchema>

interface MilestoneStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  milestoneId: string
  milestoneName: string
  currentStatus: MilestoneStatus
  /** Existing actual_date (e.g. when fixing data on an already-achieved row). */
  initialActualDate?: string | null
  initialToStatus?: MilestoneStatus
  onTransitioned: () => void | Promise<void>
}

export function MilestoneStatusDialog({
  open,
  onOpenChange,
  projectId,
  milestoneId,
  milestoneName,
  currentStatus,
  initialActualDate,
  initialToStatus,
  onTransitioned,
}: MilestoneStatusDialogProps) {
  const allowed = ALLOWED_MILESTONE_TRANSITIONS[currentStatus]
  const noTransitions = allowed.length === 0

  const [submitting, setSubmitting] = React.useState(false)

  const defaultTarget =
    initialToStatus && allowed.includes(initialToStatus)
      ? initialToStatus
      : allowed[0]

  const form = useForm<MilestoneStatusValues>({
    resolver: zodResolver(milestoneStatusSchema),
    defaultValues: {
      to_status: (defaultTarget ?? currentStatus) as MilestoneStatus,
      actual_date: initialActualDate ? parseIsoDate(initialActualDate) : new Date(),
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        to_status: (defaultTarget ?? currentStatus) as MilestoneStatus,
        actual_date: initialActualDate
          ? parseIsoDate(initialActualDate)
          : new Date(),
      })
    }
  }, [open, form, defaultTarget, currentStatus, initialActualDate])

  const watchedTarget = form.watch("to_status")

  const onSubmit = async (values: MilestoneStatusValues) => {
    setSubmitting(true)
    try {
      const payload: Record<string, string | null> = {
        status: values.to_status,
        actual_date:
          values.to_status === "achieved"
            ? dateToIsoDate(values.actual_date)
            : null,
      }

      const response = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/milestones/[mid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Status konnte nicht geändert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Status geändert", {
        description: `${milestoneName} → ${MILESTONE_STATUS_LABELS[values.to_status]}.`,
      })
      await onTransitioned()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Status konnte nicht geändert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meilensteinstatus ändern</DialogTitle>
          <DialogDescription>
            Aktueller Status:{" "}
            <strong>{MILESTONE_STATUS_LABELS[currentStatus]}</strong>
          </DialogDescription>
        </DialogHeader>

        {noTransitions ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aus diesem Status sind aktuell keine Übergänge möglich.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Schließen
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="to_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Neuer Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allowed.map((status) => (
                          <SelectItem key={status} value={status}>
                            {MILESTONE_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedTarget === "achieved" ? (
                <FormField
                  control={form.control}
                  name="actual_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ist-Datum</FormLabel>
                      <FormControl>
                        <DatePickerField
                          value={field.value ?? null}
                          onChange={(d) => field.onChange(d)}
                          disabled={submitting}
                          placeholder="Datum wählen"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                  )}
                  Status setzen
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function parseIsoDate(value: string): Date {
  const [yearStr, monthStr, dayStr] = value.slice(0, 10).split("-")
  return new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Anfrage fehlgeschlagen (${response.status})`
    }
    return data.message ?? `Anfrage fehlgeschlagen (${response.status})`
  } catch {
    return `Anfrage fehlgeschlagen (${response.status})`
  }
}
