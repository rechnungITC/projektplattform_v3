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
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

const displayNameSchema = z.object({
  display_name: z
    .string()
    .min(2, "Anzeigename muss mindestens 2 Zeichen haben")
    .max(80, "Anzeigename ist zu lang"),
})

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Passwort muss mindestens 8 Zeichen haben")
      .max(72, "Passwort ist zu lang"),
    confirmPassword: z.string().min(1, "Bitte Passwort bestätigen"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwörter stimmen nicht überein",
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
        toast.error("Profil konnte nicht gespeichert werden", { description: error.message })
        setSubmitting(false)
        return
      }

      toast.success("Profil gespeichert")
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      setFormError(message)
      toast.error("Profil konnte nicht gespeichert werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil</CardTitle>
        <CardDescription>
          Anzeigename ändern. Die E-Mail-Adresse wird über die Anmeldung verwaltet.
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
            {/* Email is read-only and not part of the form state, so it
                uses plain Label/Input instead of FormItem/FormLabel/
                FormControl which would call `useFormField` outside a
                FormField context (shadcn/ui requires the wrapper). */}
            <div className="space-y-2">
              <Label htmlFor="profile-email">E-Mail</Label>
              <Input
                id="profile-email"
                value={profile?.email ?? user.email ?? ""}
                disabled
              />
            </div>
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anzeigename</FormLabel>
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
                Speichern
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
        toast.error("Passwort konnte nicht geändert werden", { description: error.message })
        setSubmitting(false)
        return
      }

      toast.success("Passwort geändert")
      form.reset({ password: "", confirmPassword: "" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      setFormError(message)
      toast.error("Passwort konnte nicht geändert werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort</CardTitle>
        <CardDescription>
          Wähle ein starkes Passwort, das du noch nicht verwendet hast.
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
                  <FormLabel>Neues Passwort</FormLabel>
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
                  <FormLabel>Neues Passwort bestätigen</FormLabel>
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
                Passwort ändern
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
