"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import type { WorkItemWithProfile } from "@/types/work-item"

interface DeleteWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onDeleted: () => void | Promise<void>
}

export function DeleteWorkItemDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onDeleted,
}: DeleteWorkItemDialogProps) {
  const canHardDelete = useProjectAccess(projectId, "delete_hard")
  const { items: candidates } = useWorkItems(projectId, { parentId: item.id })
  const [submitting, setSubmitting] = React.useState(false)
  const [hardDelete, setHardDelete] = React.useState(false)

  const childCount = candidates.length

  React.useEffect(() => {
    if (open) {
      setHardDelete(false)
    }
  }, [open])

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const url = hardDelete
        ? `/api/projects/${projectId}/work-items/${item.id}?hard=true`
        : `/api/projects/${projectId}/work-items/${item.id}`

      const response = await fetch(url, { method: "DELETE" })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "DELETE /api/projects/[id]/work-items/[wid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Löschen fehlgeschlagen", { description: message })
        setSubmitting(false)
        return
      }

      toast.success(hardDelete ? "Endgültig gelöscht" : "In den Papierkorb verschoben")
      await onDeleted()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Löschen fehlgeschlagen", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Work Item löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{item.title}</strong> wird{" "}
            {hardDelete
              ? "endgültig entfernt"
              : "in den Papierkorb verschoben (Soft-Delete)"}
            .
          </AlertDialogDescription>
        </AlertDialogHeader>

        {childCount > 0 ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Achtung: {childCount}{" "}
            {childCount === 1
              ? "untergeordnetes Element"
              : "untergeordnete Elemente"}
            . Sie bleiben sichtbar, verlieren aber den Eltern-Bezug
            (Cascade-NULL).
          </div>
        ) : null}

        {canHardDelete ? (
          <div className="flex items-start gap-2">
            <Checkbox
              id="hard-delete"
              checked={hardDelete}
              onCheckedChange={(checked) => setHardDelete(checked === true)}
              disabled={submitting}
            />
            <Label
              htmlFor="hard-delete"
              className="cursor-pointer text-sm leading-snug"
            >
              Endgültig löschen (kein Papierkorb). Nur für Admins.
            </Label>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
