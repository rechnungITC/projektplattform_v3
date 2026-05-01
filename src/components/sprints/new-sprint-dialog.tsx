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
import { dateToIsoDate } from "@/lib/dates/iso-date"

const newSprintSchema = z
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

type NewSprintValues = z.infer<typeof newSprintSchema>

interface NewSprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: () => void | Promise<void>
}

export function NewSprintDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: NewSprintDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<NewSprintValues>({
    resolver: zodResolver(newSprintSchema),
    defaultValues: {
      name: "",
      goal: "",
      start_date: null,
      end_date: null,
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        goal: "",
        start_date: null,
        end_date: null,
      })
    }
  }, [open, form])

  const onSubmit = async (values: NewSprintValues) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        goal:
          values.goal && values.goal.length > 0 ? values.goal.trim() : null,
        start_date: dateToIsoDate(values.start_date),
        end_date: dateToIsoDate(values.end_date),
      }

      const response = await fetch(`/api/projects/${projectId}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/sprints ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Sprint konnte nicht angelegt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Sprint angelegt")
      await onCreated()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Sprint konnte nicht angelegt werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neuer Sprint</DialogTitle>
          <DialogDescription>
            Status startet immer mit „Geplant&ldquo;. Aktivierung später über das
            Status-Dialog.
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
                    <Input
                      maxLength={255}
                      disabled={submitting}
                      placeholder="z.B. Sprint 7"
                      {...field}
                    />
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
                Sprint anlegen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
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
