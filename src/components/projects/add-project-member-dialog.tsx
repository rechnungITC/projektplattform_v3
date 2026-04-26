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
import { useTenantMembers } from "@/hooks/use-tenant-members"
import {
  PROJECT_ROLES,
  PROJECT_ROLE_LABELS,
  type ProjectRole,
} from "@/types/project-membership"

const addMemberSchema = z.object({
  user_id: z.string().uuid("Wähle ein Mitglied aus"),
  role: z.enum(["lead", "editor", "viewer"]),
})

type AddMemberValues = z.infer<typeof addMemberSchema>

interface AddProjectMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  tenantId: string
  /** User IDs that already belong to this project — excluded from the picker. */
  existingUserIds: ReadonlySet<string>
  onAdded: () => void | Promise<void>
}

export function AddProjectMemberDialog({
  open,
  onOpenChange,
  projectId,
  tenantId,
  existingUserIds,
  onAdded,
}: AddProjectMemberDialogProps) {
  const { members: tenantMembers, loading: loadingMembers } =
    useTenantMembers(tenantId)
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { user_id: "", role: "editor" },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({ user_id: "", role: "editor" })
    }
  }, [open, form])

  const eligibleMembers = React.useMemo(
    () => tenantMembers.filter((m) => !existingUserIds.has(m.user_id)),
    [tenantMembers, existingUserIds]
  )

  const onSubmit = async (values: AddMemberValues) => {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/members ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Mitglied konnte nicht hinzugefügt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Mitglied hinzugefügt")
      await onAdded()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      toast.error("Mitglied konnte nicht hinzugefügt werden", {
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
          <DialogTitle>Mitglied hinzufügen</DialogTitle>
          <DialogDescription>
            Lade ein bestehendes Workspace-Mitglied in dieses Projekt ein.
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
              name="user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mitglied</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting || loadingMembers}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingMembers
                              ? "Mitglieder werden geladen…"
                              : "Mitglied auswählen"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {eligibleMembers.length === 0 && !loadingMembers ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Alle Workspace-Mitglieder sind bereits Teil dieses
                          Projekts.
                        </div>
                      ) : null}
                      {eligibleMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.display_name ??
                            member.email.split("@")[0] ??
                            "Mitglied"}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                        <SelectItem key={role} value={role}>
                          {PROJECT_ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Button
                type="submit"
                disabled={submitting || eligibleMembers.length === 0}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Hinzufügen
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
