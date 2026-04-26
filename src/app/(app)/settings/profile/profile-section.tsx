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
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

const displayNameSchema = z.object({
  display_name: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(80, "Display name is too long"),
})

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password is too long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

type DisplayNameValues = z.infer<typeof displayNameSchema>
type PasswordValues = z.infer<typeof passwordSchema>

export function ProfileSection() {
  return (
    <div className="space-y-6">
      <DisplayNameCard />
      <PasswordCard />
    </div>
  )
}

function DisplayNameCard() {
  const { user, profile, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<DisplayNameValues>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { display_name: profile?.display_name ?? "" },
  })

  React.useEffect(() => {
    form.reset({ display_name: profile?.display_name ?? "" })
  }, [profile?.display_name, form])

  const onSubmit = async (values: DisplayNameValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: values.display_name })
        .eq("id", user.id)

      if (error) {
        setFormError(error.message)
        toast.error("Could not update profile", { description: error.message })
        setSubmitting(false)
        return
      }

      toast.success("Profile updated")
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setFormError(message)
      toast.error("Could not update profile", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your display name. Your email is managed via authentication.
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
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input value={profile?.email ?? user.email ?? ""} disabled />
              </FormControl>
            </FormItem>
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
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

function PasswordCard() {
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  const onSubmit = async (values: PasswordValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      })

      if (error) {
        setFormError(error.message)
        toast.error("Could not change password", { description: error.message })
        setSubmitting(false)
        return
      }

      toast.success("Password changed")
      form.reset({ password: "", confirmPassword: "" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setFormError(message)
      toast.error("Could not change password", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Choose a strong password you haven&apos;t used before.
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
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
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Update password
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
