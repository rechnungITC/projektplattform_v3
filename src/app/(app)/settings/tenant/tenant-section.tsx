"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, ShieldAlert } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

const tenantSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name is too long"),
  domain: z
    .string()
    .max(253, "Domain is too long")
    .optional()
    .refine(
      (value) =>
        !value || /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim()),
      "Enter a valid domain like firma.de"
    ),
})

type TenantValues = z.infer<typeof tenantSchema>

export function TenantSection() {
  const { currentTenant, currentRole, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<TenantValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      name: currentTenant?.name ?? "",
      domain: currentTenant?.domain ?? "",
    },
  })

  React.useEffect(() => {
    form.reset({
      name: currentTenant?.name ?? "",
      domain: currentTenant?.domain ?? "",
    })
  }, [currentTenant?.id, currentTenant?.name, currentTenant?.domain, form])

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active workspace</CardTitle>
          <CardDescription>
            Select a workspace from the top-right switcher.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (currentRole !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace settings</CardTitle>
          <CardDescription>
            Only workspace admins can change these settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert role="alert">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>Permission required</AlertTitle>
            <AlertDescription>
              Ask an admin of <strong>{currentTenant.name}</strong> to make
              changes here.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const onSubmit = async (values: TenantValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const trimmedDomain = values.domain?.trim() ?? ""
      const { error } = await supabase
        .from("tenants")
        .update({
          name: values.name,
          domain: trimmedDomain.length > 0 ? trimmedDomain.toLowerCase() : null,
        })
        .eq("id", currentTenant.id)

      if (error) {
        setFormError(error.message)
        toast.error("Could not save workspace", {
          description: error.message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Workspace updated")
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setFormError(message)
      toast.error("Could not save workspace", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          Rename your workspace and manage the email domain claim.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="organization"
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
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email domain</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="firma.de"
                      autoComplete="off"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    New signups from this email domain will auto-join this
                    workspace as members. Leave blank to clear.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
