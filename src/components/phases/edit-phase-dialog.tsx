"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { DatePickerField } from "@/components/projects/date-picker-field"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Phase } from "@/types/phase"
import { dateToIsoDate } from "@/lib/dates/iso-date"

const editPhaseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name ist erforderlich")
      .max(255, "Name darf höchstens 255 Zeichen lang sein"),
    description: z
      .string()
      .max(5000, "Beschreibung darf höchstens 5000 Zeichen lang sein")
      .optional()
      .or(z.literal("")),
    planned_start: z.date().nullable().optional(),
    planned_end: z.date().nullable().optional(),
  })
  .refine(
    (values) => {
      if (!values.planned_start || !values.planned_end) return true
      return values.planned_end >= values.planned_start
    },
    {
      message: "Enddatum muss am oder nach dem Startdatum liegen",
      path: ["planned_end"],
    }
  )

type EditPhaseValues = z.infer<typeof editPhaseSchema>

interface EditPhaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phase: Phase
  onSaved: () => void | Promise<void>
}

export function EditPhaseDialog({
  open,
  onOpenChange,
  projectId,
  phase,
  onSaved,
}: EditPhaseDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const defaultValues = React.useMemo<EditPhaseValues>(
    () => ({
      name: phase.name,
      description: phase.description ?? "",
      planned_start: phase.planned_start ? parseIsoDate(phase.planned_start) : null,
      planned_end: phase.planned_end ? parseIsoDate(phase.planned_end) : null,
    }),
    [phase]
  )

  const form = useForm<EditPhaseValues>({
    resolver: zodResolver(editPhaseSchema),
    defaultValues,
  })

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  const onSubmit = async (values: EditPhaseValues) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        planned_start: dateToIsoDate(values.planned_start),
        planned_end: dateToIsoDate(values.planned_end),
      }

      const response = await fetch(
        `/api/projects/${projectId}/phases/${phase.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/phases/[pid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Phase konnte nicht aktualisiert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Phase aktualisiert")
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Phase konnte nicht aktualisiert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Phase bearbeiten</DialogTitle>
          <DialogDescription>
            Stammdaten ändern. Status und Sequenznummer werden separat
            gepflegt.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input maxLength={255} disabled={submitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      maxLength={5000}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="planned_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geplanter Start</FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        disabled={submitting}
                        placeholder="Datum wählen"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="planned_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geplantes Ende</FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        minDate={form.watch("planned_start") ?? null}
                        disabled={submitting}
                        placeholder="Datum wählen"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </Form>
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
      error?: string | { message?: string; code?: string; field?: string }
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
