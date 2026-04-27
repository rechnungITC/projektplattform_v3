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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { usePhases } from "@/hooks/use-phases"

const NO_PHASE_VALUE = "__none__"

const newMilestoneSchema = z.object({
  phase_id: z.string().nullable(),
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
  target_date: z.date({ message: "Zieldatum ist erforderlich" }),
})

type NewMilestoneValues = z.infer<typeof newMilestoneSchema>

interface NewMilestoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Pre-select a phase. */
  initialPhaseId?: string | null
  onCreated: () => void | Promise<void>
}

export function NewMilestoneDialog({
  open,
  onOpenChange,
  projectId,
  initialPhaseId,
  onCreated,
}: NewMilestoneDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const { phases } = usePhases(projectId)

  const defaultValues = React.useMemo<NewMilestoneValues>(
    () => ({
      phase_id: initialPhaseId ?? null,
      name: "",
      description: "",
      target_date: undefined as unknown as Date,
    }),
    [initialPhaseId]
  )

  const form = useForm<NewMilestoneValues>({
    resolver: zodResolver(newMilestoneSchema),
    defaultValues,
  })

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  const onSubmit = async (values: NewMilestoneValues) => {
    setSubmitting(true)
    try {
      const payload = {
        phase_id: values.phase_id,
        name: values.name.trim(),
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        target_date: dateToIsoDate(values.target_date),
      }

      const response = await fetch(
        `/api/projects/${projectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/milestones ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Meilenstein konnte nicht angelegt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Meilenstein angelegt")
      await onCreated()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Meilenstein konnte nicht angelegt werden", {
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
          <DialogTitle>Neuer Meilenstein</DialogTitle>
          <DialogDescription>
            Lege Name, Zieldatum und optionale Phasenzuordnung fest.
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
              name="phase_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase</FormLabel>
                  <Select
                    value={field.value ?? NO_PHASE_VALUE}
                    onValueChange={(v) =>
                      field.onChange(v === NO_PHASE_VALUE ? null : v)
                    }
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Phase wählen (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PHASE_VALUE}>
                        Keine Phase
                      </SelectItem>
                      {phases.map((phase) => (
                        <SelectItem key={phase.id} value={phase.id}>
                          {phase.sequence_number}. {phase.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="target_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zieldatum</FormLabel>
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
                Meilenstein anlegen
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
