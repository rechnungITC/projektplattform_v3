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
import type { Role, TenantMember } from "@/types/auth"

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

interface ChangeRoleDialogProps {
  tenantId: string
  member: TenantMember
  newRole: Role
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void | Promise<void>
}

export function ChangeRoleDialog({
  tenantId,
  member,
  newRole,
  open,
  onOpenChange,
  onChanged,
}: ChangeRoleDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/members/${member.user_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      )

      if (response.status === 404) {
        toast.warning("Role change endpoint pending implementation", {
          description:
            "Backend route /api/tenants/{id}/members/{userId} is not built yet.",
        })
        onOpenChange(false)
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not change role", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Role updated", {
        description: `${
          member.display_name ?? member.email
        } is now ${ROLE_LABELS[newRole]}.`,
      })
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not change role", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change role?</AlertDialogTitle>
          <AlertDialogDescription>
            {member.display_name ?? member.email} will become{" "}
            <strong>{ROLE_LABELS[newRole]}</strong> in this workspace.
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
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string; message?: string }
    return (
      data.error ??
      data.message ??
      `Request failed with status ${response.status}`
    )
  } catch {
    return `Request failed with status ${response.status}`
  }
}
