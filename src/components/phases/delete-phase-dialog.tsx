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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"

interface DeletePhaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phaseId: string
  phaseName: string
  onDeleted: () => void | Promise<void>
}

export function DeletePhaseDialog({
  open,
  onOpenChange,
  projectId,
  phaseId,
  phaseName,
  onDeleted,
}: DeletePhaseDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [forceDelete, setForceDelete] = React.useState(false)
  const [attachedCount, setAttachedCount] = React.useState<number | null>(null)
  const [checking, setChecking] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setForceDelete(false)
      setAttachedCount(null)
      return
    }

    let cancelled = false
    async function check() {
      setChecking(true)
      try {
        const supabase = createClient()
        const { count, error } = await supabase
          .from("work_items")
          .select("id", { count: "exact", head: true })
          .eq("phase_id", phaseId)
          .eq("is_deleted", false)

        if (cancelled) return
        // PROJ-19 / PROJ-9 backend pending — assume 0 if the table doesn't
        // exist yet.
        if (error) {
          setAttachedCount(0)
        } else {
          setAttachedCount(count ?? 0)
        }
      } catch {
        if (!cancelled) setAttachedCount(0)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [open, phaseId])

  const hasAttached = (attachedCount ?? 0) > 0

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const url = `/api/projects/${projectId}/phases/${phaseId}${
        forceDelete ? "?force=true" : ""
      }`
      const response = await fetch(url, { method: "DELETE" })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "DELETE /api/projects/[id]/phases/[pid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Phase konnte nicht gelöscht werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Phase gelöscht", {
        description: `${phaseName} wurde entfernt.`,
      })
      await onDeleted()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Phase konnte nicht gelöscht werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  const blocked = hasAttached && !forceDelete

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Phase löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{phaseName}</strong> wird in den Papierkorb verschoben
            (Soft-Delete).
          </AlertDialogDescription>
        </AlertDialogHeader>

        {checking ? (
          <p className="text-sm text-muted-foreground">
            Anhänge werden geprüft…
          </p>
        ) : hasAttached ? (
          <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-sm">
              <strong>{attachedCount}</strong> Arbeitspaket
              {attachedCount === 1 ? "" : "e"} sind dieser Phase zugeordnet.
              Ohne <em>Force-Delete</em> blockiert das Backend das Löschen.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="phase-force-delete"
                checked={forceDelete}
                onCheckedChange={setForceDelete}
                disabled={submitting}
              />
              <Label htmlFor="phase-force-delete" className="text-sm">
                Force-Delete (Arbeitspakete werden orphaned, phase_id = NULL)
              </Label>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={submitting || blocked}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
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
