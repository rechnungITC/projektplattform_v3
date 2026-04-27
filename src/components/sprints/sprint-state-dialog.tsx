"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ALLOWED_SPRINT_STATE_TRANSITIONS,
  SPRINT_STATE_LABELS,
  type Sprint,
  type SprintState,
} from "@/types/sprint"

interface SprintStateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  sprint: Sprint
  onChanged: () => void | Promise<void>
}

export function SprintStateDialog({
  open,
  onOpenChange,
  projectId,
  sprint,
  onChanged,
}: SprintStateDialogProps) {
  const allowed = ALLOWED_SPRINT_STATE_TRANSITIONS[sprint.state]
  const noTransitions = allowed.length === 0

  const [submitting, setSubmitting] = React.useState(false)
  const [target, setTarget] = React.useState<SprintState | null>(
    allowed[0] ?? null
  )

  React.useEffect(() => {
    if (open) {
      setTarget(allowed[0] ?? null)
    }
  }, [open, allowed])

  const onSubmit = async () => {
    if (!target) return
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/sprints/${sprint.id}/state`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_state: target }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/sprints/[sid]/state ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Sprint-Status konnte nicht geändert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Sprint-Status geändert", {
        description: `${sprint.name} → ${SPRINT_STATE_LABELS[target]}.`,
      })
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Sprint-Status konnte nicht geändert werden", {
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
          <DialogTitle>Sprint-Status ändern</DialogTitle>
          <DialogDescription>
            Aktuell: <strong>{SPRINT_STATE_LABELS[sprint.state]}</strong>
          </DialogDescription>
        </DialogHeader>

        {noTransitions ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aus diesem Status sind aktuell keine Übergänge möglich.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Schließen</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="sprint-state-select">Neuer Status</Label>
              <Select
                value={target ?? undefined}
                onValueChange={(v) => setTarget(v as SprintState)}
                disabled={submitting}
              >
                <SelectTrigger id="sprint-state-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SPRINT_STATE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button
                type="button"
                onClick={onSubmit}
                disabled={submitting || !target}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Status setzen
              </Button>
            </DialogFooter>
          </>
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
