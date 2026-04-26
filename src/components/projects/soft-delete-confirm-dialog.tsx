"use client"

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

interface SoftDeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  onDeleted: () => void | Promise<void>
}

export function SoftDeleteConfirmDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onDeleted,
}: SoftDeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      })

      if (response.status === 404) {
        toast.warning("Delete endpoint pending implementation", {
          description:
            "Backend route DELETE /api/projects/[id] is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not delete project", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Project moved to trash", {
        description: `${projectName} can be restored from Settings → Projects Trash.`,
      })
      await onDeleted()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not delete project", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move project to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{projectName}</strong> will be hidden from active views. An
            admin can restore or permanently delete it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Move to trash
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
