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
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
  type WorkItemWithProfile,
} from "@/types/work-item"

interface ChangeStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onChanged: () => void | Promise<void>
}

export function ChangeStatusDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onChanged,
}: ChangeStatusDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedStatus, setSelectedStatus] = React.useState<WorkItemStatus>(
    item.status
  )

  React.useEffect(() => {
    if (open) {
      setSelectedStatus(item.status)
    }
  }, [open, item.status])

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: selectedStatus }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid]/status ist noch nicht implementiert.",
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
        description: `${item.title} → ${WORK_ITEM_STATUS_LABELS[selectedStatus]}.`,
      })
      await onChanged()
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
          <DialogTitle>Status ändern</DialogTitle>
          <DialogDescription>
            Aktuell: <strong>{WORK_ITEM_STATUS_LABELS[item.status]}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="status-select">Neuer Status</Label>
          <Select
            value={selectedStatus}
            onValueChange={(v) => setSelectedStatus(v as WorkItemStatus)}
            disabled={submitting}
          >
            <SelectTrigger id="status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {WORK_ITEM_STATUS_LABELS[s]}
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
            disabled={submitting || selectedStatus === item.status}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Setzen
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
