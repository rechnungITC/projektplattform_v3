"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { useSprints } from "@/hooks/use-sprints"
import { SPRINT_STATE_LABELS } from "@/types/sprint"
import type { WorkItemWithProfile } from "@/types/work-item"

const NO_SPRINT_VALUE = "__none__"

interface ChangeSprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onChanged: () => void | Promise<void>
}

export function ChangeSprintDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onChanged,
}: ChangeSprintDialogProps) {
  const { sprints } = useSprints(projectId)
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedSprintId, setSelectedSprintId] = React.useState<string | null>(
    item.sprint_id
  )

  React.useEffect(() => {
    if (open) {
      setSelectedSprintId(item.sprint_id)
    }
  }, [open, item.sprint_id])

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/sprint`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprint_id: selectedSprintId }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid]/sprint ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Sprint-Zuordnung fehlgeschlagen", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Sprint aktualisiert")
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Sprint-Zuordnung fehlgeschlagen", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sprint ändern</DialogTitle>
          <DialogDescription>
            Wähle einen Sprint oder hebe die Zuordnung auf.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="sprint-select">Sprint</Label>
          <Select
            value={selectedSprintId ?? NO_SPRINT_VALUE}
            onValueChange={(v) =>
              setSelectedSprintId(v === NO_SPRINT_VALUE ? null : v)
            }
            disabled={submitting}
          >
            <SelectTrigger id="sprint-select">
              <SelectValue placeholder="Sprint wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SPRINT_VALUE}>Kein Sprint</SelectItem>
              {sprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2">
                    {s.name}
                    <Badge variant="outline" className="text-xs">
                      {SPRINT_STATE_LABELS[s.state]}
                    </Badge>
                  </span>
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
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Übernehmen
          </Button>
        </DialogFooter>
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
