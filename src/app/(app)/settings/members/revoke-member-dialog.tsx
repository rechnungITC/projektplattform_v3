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
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TenantMember } from "@/types/auth"

interface RevokeMemberDialogProps {
  tenantId: string
  member: TenantMember
  open: boolean
  onOpenChange: (open: boolean) => void
  onRevoked: () => void | Promise<void>
}

export function RevokeMemberDialog({
  tenantId,
  member,
  open,
  onOpenChange,
  onRevoked,
}: RevokeMemberDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/members/${member.user_id}`,
        { method: "DELETE" }
      )

      if (response.status === 404) {
        toast.warning("Revoke endpoint pending implementation", {
          description:
            "Backend route /api/tenants/{id}/members/{userId} is not built yet.",
        })
        onOpenChange(false)
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not revoke membership", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Membership revoked", {
        description: `${
          member.display_name ?? member.email
        } no longer has access.`,
      })
      await onRevoked()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not revoke membership", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke membership?</AlertDialogTitle>
          <AlertDialogDescription>
            {member.display_name ?? member.email} will lose access to this
            workspace immediately. This can&apos;t be undone — you&apos;ll need
            to invite them again to restore access.
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
            className={cn(
              buttonVariants({ variant: "destructive" }),
              "text-destructive-foreground"
            )}
          >
            Revoke access
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
