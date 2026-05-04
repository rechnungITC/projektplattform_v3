"use client"

import { CalendarPlus } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { extendApprovalDeadline } from "@/lib/decisions/approval-api"

interface ExtendDeadlineDialogProps {
  projectId: string
  decisionId: string
  currentDeadline: string | null
  onExtended: () => void
}

/**
 * PROJ-31 follow-up — pushes the approval deadline forward.
 * Server enforces: forward-only, min +1 day, max +90 days.
 */
export function ExtendDeadlineDialog({
  projectId,
  decisionId,
  currentDeadline,
  onExtended,
}: ExtendDeadlineDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // Min picker value = current deadline + 1 day, or tomorrow if no deadline yet.
  const minDate = React.useMemo(() => {
    const base = currentDeadline ? new Date(currentDeadline) : new Date()
    base.setUTCDate(base.getUTCDate() + 1)
    return base.toISOString().slice(0, 10)
  }, [currentDeadline])

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill on open
      setDraft(minDate)
    }
  }, [open, minDate])

  const handleSubmit = async () => {
    if (!draft) return
    setSubmitting(true)
    try {
      const iso = new Date(`${draft}T23:59:59.000Z`).toISOString()
      await extendApprovalDeadline(projectId, decisionId, iso)
      toast.success("Frist verlängert")
      setOpen(false)
      onExtended()
    } catch (err) {
      toast.error("Frist-Verlängerung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarPlus className="mr-1 h-4 w-4" aria-hidden />
          Frist verlängern
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Frist verlängern</DialogTitle>
          <DialogDescription>
            Schiebt die Genehmigungsfrist nach hinten. Min. +1 Tag, max. +90
            Tage. Approver werden beim nächsten Cron-Lauf erneut erinnert
            (sofern die neue Frist im Reminder-Fenster liegt).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="extend-deadline-input">Neue Frist</Label>
          <Input
            id="extend-deadline-input"
            type="date"
            min={minDate}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={submitting}
            className="w-48"
          />
          {currentDeadline && (
            <p className="text-xs text-muted-foreground">
              Aktuell:{" "}
              {new Date(currentDeadline).toLocaleDateString("de-DE")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!draft || submitting}
          >
            Verlängern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
