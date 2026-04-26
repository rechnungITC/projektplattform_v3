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
import type { ProjectMembershipWithProfile } from "@/types/project-membership"

interface RemoveProjectMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  member: ProjectMembershipWithProfile
  /** All current memberships — used for the last-lead client-side guard. */
  allMembers: ProjectMembershipWithProfile[]
  onRemoved: () => void | Promise<void>
}

export function RemoveProjectMemberDialog({
  open,
  onOpenChange,
  projectId,
  member,
  allMembers,
  onRemoved,
}: RemoveProjectMemberDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const memberLabel =
    member.profile?.display_name ??
    member.profile?.email ??
    "Dieses Mitglied"

  const leadCount = allMembers.filter((m) => m.role === "lead").length
  const isLastLead = member.role === "lead" && leadCount <= 1

  const handleConfirm = async () => {
    if (isLastLead) {
      toast.warning("Aktion blockiert", {
        description:
          "Projekt muss mindestens einen Lead haben. Vergib zuerst eine andere Lead-Rolle.",
      })
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/members/${member.user_id}`,
        { method: "DELETE" }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "DELETE /api/projects/[id]/members/[userId] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Mitglied konnte nicht entfernt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Mitglied entfernt")
      await onRemoved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      toast.error("Mitglied konnte nicht entfernt werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mitglied entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{memberLabel}</strong> verliert den Zugriff auf dieses
            Projekt. Workspace-Mitgliedschaft bleibt unverändert.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isLastLead ? (
          <p className="text-sm text-muted-foreground">
            Projekt muss mindestens einen Lead haben.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={submitting || isLastLead}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Entfernen
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
