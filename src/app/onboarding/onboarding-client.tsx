"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import type { Tenant, TenantMembership } from "@/types/auth"

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 10_000

const tenantNameSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name is too long"),
})

type TenantNameValues = z.infer<typeof tenantNameSchema>

interface OnboardingClientProps {
  userId: string
  userEmail: string
}

type Phase =
  | { kind: "polling" }
  | { kind: "name-tenant"; tenant: Tenant }
  | { kind: "redirecting" }
  | { kind: "error"; message: string }

function emailDomain(email: string): string {
  const parts = email.split("@")
  return (parts[1] ?? "").toLowerCase()
}

export function OnboardingClient({ userId, userEmail }: OnboardingClientProps) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "polling" })

  // Poll tenant_memberships up to POLL_TIMEOUT_MS for the row created by the
  // signup auth hook. Once present, decide whether to show the rename form
  // or send the user straight to the dashboard.
  React.useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const startedAt = Date.now()

    const tick = async () => {
      if (cancelled) return

      const { data, error } = await supabase
        .from("tenant_memberships")
        .select(
          "id, tenant_id, user_id, role, created_at, tenant:tenants ( id, name, domain, created_at, created_by )"
        )
        .eq("user_id", userId)

      if (cancelled) return

      if (error) {
        setPhase({ kind: "error", message: error.message })
        return
      }

      const memberships = ((data ?? []) as unknown as Array<
        TenantMembership & { tenant: Tenant | Tenant[] }
      >).map((row) => ({
        ...row,
        tenant: Array.isArray(row.tenant) ? row.tenant[0] : row.tenant,
      })) as TenantMembership[]

      if (memberships.length > 0) {
        // Heuristic: sole admin of a tenant whose name still matches the
        // email domain → offer to rename.
        const adminMembership = memberships.find((m) => m.role === "admin")
        const domain = emailDomain(userEmail)
        const isFreshSoloAdminTenant =
          memberships.length === 1 &&
          adminMembership !== undefined &&
          adminMembership.tenant.name.toLowerCase() === domain &&
          domain.length > 0

        if (isFreshSoloAdminTenant && adminMembership) {
          setPhase({ kind: "name-tenant", tenant: adminMembership.tenant })
        } else {
          setPhase({ kind: "redirecting" })
          window.location.href = "/"
        }
        return
      }

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setPhase({
          kind: "error",
          message:
            "We couldn't set up your workspace automatically. Please reload, or contact support if the problem persists.",
        })
        return
      }

      window.setTimeout(tick, POLL_INTERVAL_MS)
    }

    void tick()

    return () => {
      cancelled = true
    }
  }, [userId, userEmail])

  if (phase.kind === "polling" || phase.kind === "redirecting") {
    return <PollingState />
  }

  if (phase.kind === "error") {
    return <ErrorState message={phase.message} />
  }

  return <NameTenantForm tenant={phase.tenant} />
}

function PollingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Setting up your workspace…</CardTitle>
          <CardDescription>
            Hang tight — we&apos;re routing you to the right place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>We couldn&apos;t finish onboarding.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full"
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function NameTenantForm({ tenant }: { tenant: Tenant }) {
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<TenantNameValues>({
    resolver: zodResolver(tenantNameSchema),
    defaultValues: { name: tenant.name },
  })

  const onSubmit = async (values: TenantNameValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("tenants")
        .update({ name: values.name })
        .eq("id", tenant.id)

      if (error) {
        setFormError(error.message)
        toast.error("Could not save workspace name", {
          description: error.message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Workspace ready")
      window.location.href = "/"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setFormError(message)
      toast.error("Could not save workspace name", { description: message })
      setSubmitting(false)
    }
  }

  const skip = () => {
    window.location.href = "/"
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Name your workspace</CardTitle>
          <CardDescription>
            We created a fresh workspace for you. Give it a name your team will
            recognise — you can change this later.
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
                        placeholder="Acme GmbH"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={skip}
                  disabled={submitting}
                >
                  Skip for now
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                  )}
                  Save and continue
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
