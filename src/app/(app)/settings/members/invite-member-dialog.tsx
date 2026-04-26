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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Role } from "@/types/auth"

const inviteSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"]),
})

type InviteValues = z.infer<typeof inviteSchema>

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  onInvited: () => void | Promise<void>
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  tenantId,
  onInvited,
}: InviteMemberDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" satisfies Role },
  })

  React.useEffect(() => {
    if (!open) {
      form.reset({ email: "", role: "member" })
    }
  }, [open, form])

  const onSubmit = async (values: InviteValues) => {
    setSubmitting(true)

    try {
      const response = await fetch(`/api/tenants/${tenantId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email, role: values.role }),
      })

      if (response.status === 404) {
        toast.warning("Invite endpoint pending implementation", {
          description:
            "Backend route /api/tenants/{id}/invite is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not send invite", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Invite sent", {
        description: `An email is on its way to ${values.email}.`,
      })
      await onInvited()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not send invite", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Send a magic-link invite. The recipient sets their password on
            first login.
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="teammate@firma.de"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
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
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Send invite
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
