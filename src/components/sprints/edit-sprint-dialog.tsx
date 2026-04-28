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
import type { Sprint } from "@/types/sprint"
import { dateToIsoDate } from "@/lib/dates/iso-date"

const editSprintSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name ist erforderlich")
      .max(255, "Name darf höchstens 255 Zeichen lang sein"),
    goal: z
      .string()
      .max(2000, "Sprint-Ziel zu lang")
      .optional()
      .or(z.literal("")),
    start_date: z.date().nullable().optional(),
    end_date: z.date().nullable().optional(),
  })
  .refine(
    (values) => {
      if (!values.start_date || !values.end_date) return true
      return values.end_date >= values.start_date
    },
    {
      message: "Enddatum muss am oder nach dem Startdatum liegen",
      path: ["end_date"],
    }
  )

type EditSprintValues = z.infer<typeof editSprintSchema>

interface EditSprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  sprint: Sprint
  onSaved: () => void | Promise<void>
}

export function EditSprintDialog({
  open,
  onOpenChange,
  projectId,
  sprint,
  onSaved,
}: EditSprintDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<EditSprintValues>({
    resolver: zodResolver(editSprintSchema),
    defaultValues: {
      name: sprint.name,
      goal: sprint.goal ?? "",
      start_date: parseIsoDate(sprint.start_date),
      end_date: parseIsoDate(sprint.end_date),
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: sprint.name,
        goal: sprint.goal ?? "",
        start_date: parseIsoDate(sprint.start_date),
        end_date: parseIsoDate(sprint.end_date),
      })
    }
  }, [open, sprint, form])

  const onSubmit = async (values: EditSprintValues) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        goal:
          values.goal && values.goal.length > 0 ? values.goal.trim() : null,
        start_date: dateToIsoDate(values.start_date),
        end_date: dateToIsoDate(values.end_date),
      }

      const response = await fetch(
        `/api/projects/${projectId}/sprints/${sprint.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/sprints/[sid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Sprint konnte nicht aktualisiert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Sprint gespeichert")
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Sprint konnte nicht aktualisiert werden", {
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
          <DialogTitle>Sprint bearbeiten</DialogTitle>
          <DialogDescription>
            Status wird im separaten Status-Dialog gewechselt.
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
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sprint-Ziel</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      maxLength={2000}
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
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
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
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ende</FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        minDate={form.watch("start_date") ?? null}
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
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function parseIsoDate(iso: string | null): Date | null {
  if (!iso) return null
  const [yearStr, monthStr, dayStr] = iso.slice(0, 10).split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
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
