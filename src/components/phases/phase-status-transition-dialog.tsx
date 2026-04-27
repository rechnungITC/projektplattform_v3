"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  ALLOWED_PHASE_TRANSITIONS,
  PHASE_STATUS_LABELS,
  PHASE_STATUSES,
  type PhaseStatus,
} from "@/types/phase"

const transitionSchema = z.object({
  to_status: z.enum(PHASE_STATUSES),
  comment: z
    .string()
    .max(500, "Kommentar darf höchstens 500 Zeichen lang sein")
    .optional()
    .or(z.literal("")),
})

type TransitionValues = z.infer<typeof transitionSchema>

interface PhaseStatusTransitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phaseId: string
  phaseName: string
  currentStatus: PhaseStatus
  initialToStatus?: PhaseStatus
  onTransitioned: () => void | Promise<void>
}

export function PhaseStatusTransitionDialog({
  open,
  onOpenChange,
  projectId,
  phaseId,
  phaseName,
  currentStatus,
  initialToStatus,
  onTransitioned,
}: PhaseStatusTransitionDialogProps) {
  const allowed = ALLOWED_PHASE_TRANSITIONS[currentStatus]
  const noTransitions = allowed.length === 0

  const [submitting, setSubmitting] = React.useState(false)

  const defaultTarget =
    initialToStatus && allowed.includes(initialToStatus)
      ? initialToStatus
      : allowed[0]

  const form = useForm<TransitionValues>({
    resolver: zodResolver(transitionSchema),
    defaultValues: {
      to_status: (defaultTarget ?? currentStatus) as PhaseStatus,
      comment: "",
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        to_status: (defaultTarget ?? currentStatus) as PhaseStatus,
        comment: "",
      })
    }
  }, [open, form, defaultTarget, currentStatus])

  const watchedTarget = form.watch("to_status")

  const onSubmit = async (values: TransitionValues) => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/phases/${phaseId}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to_status: values.to_status,
            comment:
              values.comment && values.comment.length > 0
                ? values.comment
                : null,
          }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/phases/[pid]/transition ist noch nicht implementiert.",
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
        description: `${phaseName} → ${PHASE_STATUS_LABELS[values.to_status]}.`,
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
          <DialogTitle>Phasenstatus ändern</DialogTitle>
          <DialogDescription>
            Aktueller Status:{" "}
            <strong>{PHASE_STATUS_LABELS[currentStatus]}</strong>
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
                            {PHASE_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedTarget === "completed" ? (
                <Alert>
                  <Info className="h-4 w-4" aria-hidden />
                  <AlertDescription>
                    Compliance-Gate-Check wird ausgelöst (PROJ-18 — folgt).
                  </AlertDescription>
                </Alert>
              ) : null}

              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kommentar (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={500}
                        placeholder="Warum ändert sich der Status?"
                        disabled={submitting}
                        {...field}
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
