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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface HardDeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  onDeleted: () => void | Promise<void>
}

export function HardDeleteConfirmDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onDeleted,
}: HardDeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState("")

  React.useEffect(() => {
    if (!open) setConfirmText("")
  }, [open])

  const canDelete = confirmText === projectName && !submitting

  const handleConfirm = async () => {
    if (!canDelete) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}?hard=true`, {
        method: "DELETE",
      })

      if (response.status === 404) {
        toast.warning("Hard delete endpoint pending implementation", {
          description:
            "Backend route DELETE /api/projects/[id]?hard=true is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not permanently delete", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Project permanently deleted", {
        description: `${projectName} and its history were removed.`,
      })
      await onDeleted()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not permanently delete", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The project and its full lifecycle
            history will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="hard-delete-confirm-input" className="text-sm">
            Type <strong>{projectName}</strong> to confirm:
          </Label>
          <Input
            id="hard-delete-confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={!canDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            Delete forever
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
      return data.error.message ?? `Request failed (${response.status})`
    }
    return data.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
