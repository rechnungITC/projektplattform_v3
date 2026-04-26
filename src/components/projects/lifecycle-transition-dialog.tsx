"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

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
  ALLOWED_TRANSITIONS,
  LIFECYCLE_STATUS_LABELS,
  type LifecycleStatus,
} from "@/types/project"

const transitionSchema = z.object({
  to_status: z.enum(["draft", "active", "paused", "completed", "canceled"]),
  comment: z
    .string()
    .max(2000, "Comment must be 2000 characters or fewer")
    .optional()
    .or(z.literal("")),
})

type TransitionValues = z.infer<typeof transitionSchema>

interface LifecycleTransitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  currentStatus: LifecycleStatus
  /** Optional pre-selected target status (e.g. clicked from dropdown). */
  initialToStatus?: LifecycleStatus
  onTransitioned: () => void | Promise<void>
}

export function LifecycleTransitionDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  currentStatus,
  initialToStatus,
  onTransitioned,
}: LifecycleTransitionDialogProps) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus]
  const noTransitions = allowed.length === 0

  const [submitting, setSubmitting] = React.useState(false)

  const defaultTarget =
    initialToStatus && allowed.includes(initialToStatus)
      ? initialToStatus
      : allowed[0]

  const form = useForm<TransitionValues>({
    resolver: zodResolver(transitionSchema),
    defaultValues: {
      to_status: (defaultTarget ?? currentStatus) as LifecycleStatus,
      comment: "",
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        to_status: (defaultTarget ?? currentStatus) as LifecycleStatus,
        comment: "",
      })
    }
  }, [open, form, defaultTarget, currentStatus])

  const onSubmit = async (values: TransitionValues) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_status: values.to_status,
          comment:
            values.comment && values.comment.length > 0 ? values.comment : null,
        }),
      })

      if (response.status === 404) {
        toast.warning("Transition endpoint pending implementation", {
          description:
            "Backend route POST /api/projects/[id]/transition is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not change status", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Status updated", {
        description: `${projectName} → ${LIFECYCLE_STATUS_LABELS[values.to_status]}.`,
      })
      await onTransitioned()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not change status", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change lifecycle status</DialogTitle>
          <DialogDescription>
            Current status:{" "}
            <strong>{LIFECYCLE_STATUS_LABELS[currentStatus]}</strong>
          </DialogDescription>
        </DialogHeader>

        {noTransitions ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This project is in a terminal state. No further transitions are
              available.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Close
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
                    <FormLabel>New status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a new status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allowed.map((status) => (
                          <SelectItem key={status} value={status}>
                            {LIFECYCLE_STATUS_LABELS[status]}
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
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comment</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Why is this status changing?"
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
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                  )}
                  Confirm transition
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
      error?: string | { message?: string; code?: string; field?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Request failed (${response.status})`
    }
    return data.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
