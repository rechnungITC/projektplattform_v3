"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PROJECT_ROLES,
  PROJECT_ROLE_LABELS,
  type ProjectMembershipWithProfile,
  type ProjectRole,
} from "@/types/project-membership"

const changeRoleSchema = z.object({
  role: z.enum(["lead", "editor", "viewer"]),
})

type ChangeRoleValues = z.infer<typeof changeRoleSchema>

interface ChangeProjectRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  member: ProjectMembershipWithProfile
  /** All current memberships — used for the last-lead client-side guard. */
  allMembers: ProjectMembershipWithProfile[]
  onChanged: () => void | Promise<void>
}

export function ChangeProjectRoleDialog({
  open,
  onOpenChange,
  projectId,
  member,
  allMembers,
  onChanged,
}: ChangeProjectRoleDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<ChangeRoleValues>({
    resolver: zodResolver(changeRoleSchema),
    defaultValues: { role: member.role },
  })

  React.useEffect(() => {
    if (open) form.reset({ role: member.role })
  }, [open, form, member.role])

  const memberLabel =
    member.profile?.display_name ??
    member.profile?.email ??
    "Dieses Mitglied"

  const leadCount = allMembers.filter((m) => m.role === "lead").length
  const isLastLead = member.role === "lead" && leadCount <= 1

  const onSubmit = async (values: ChangeRoleValues) => {
    if (values.role === member.role) {
      onOpenChange(false)
      return
    }

    if (isLastLead && values.role !== "lead") {
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
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: values.role }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/members/[userId] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Rolle konnte nicht geändert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Rolle aktualisiert")
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      toast.error("Rolle konnte nicht geändert werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rolle ändern</DialogTitle>
          <DialogDescription>
            Wähle eine neue Rolle für <strong>{memberLabel}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rolle</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Rolle wählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROJECT_ROLES.map((role: ProjectRole) => (
                        <SelectItem
                          key={role}
                          value={role}
                          disabled={isLastLead && role !== "lead"}
                        >
                          {PROJECT_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isLastLead ? (
                    <p className="text-xs text-muted-foreground">
                      Projekt muss mindestens einen Lead haben.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </Form>
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
      return data.error.message ?? `Request failed (${response.status})`
    }
    return data.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
