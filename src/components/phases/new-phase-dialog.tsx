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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const newPhaseSchema = z
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
    sequence_number: z
      .number({ message: "Sequenznummer muss eine Zahl sein" })
      .int("Ganzzahl erforderlich")
      .min(1, "Sequenznummer muss ≥ 1 sein"),
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

type NewPhaseValues = z.infer<typeof newPhaseSchema>

interface NewPhaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Default sequence — typically `max(existing) + 1`. */
  defaultSequenceNumber: number
  onCreated: () => void | Promise<void>
}

export function NewPhaseDialog({
  open,
  onOpenChange,
  projectId,
  defaultSequenceNumber,
  onCreated,
}: NewPhaseDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const defaultValues = React.useMemo<NewPhaseValues>(
    () => ({
      name: "",
      description: "",
      planned_start: null,
      planned_end: null,
      sequence_number: defaultSequenceNumber,
    }),
    [defaultSequenceNumber]
  )

  const form = useForm<NewPhaseValues>({
    resolver: zodResolver(newPhaseSchema),
    defaultValues,
  })

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  const onSubmit = async (values: NewPhaseValues) => {
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
        sequence_number: values.sequence_number,
      }

      const response = await fetch(`/api/projects/${projectId}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/phases ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Phase konnte nicht angelegt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Phase angelegt")
      await onCreated()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Phase konnte nicht angelegt werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Phase</DialogTitle>
          <DialogDescription>
            Definiere Name, Zeitraum und Reihenfolge. Status und Reihenfolge
            kannst du später ändern.
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

            <FormField
              control={form.control}
              name="sequence_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sequenznummer</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      disabled={submitting}
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber
                        field.onChange(Number.isNaN(v) ? 0 : v)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Position in der Timeline. Standardmäßig wird die nächste
                    freie Nummer vorgeschlagen.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                Phase anlegen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function dateToIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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
