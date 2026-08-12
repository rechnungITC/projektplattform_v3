"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { createClient } from "@/lib/supabase/client"

const forgotSchema = z.object({
  email: z.string().min(1, "E-Mail ist erforderlich").email("Ungültige E-Mail-Adresse"),
})

type ForgotValues = z.infer<typeof forgotSchema>

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (values: ForgotValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(
        values.email,
        { redirectTo }
      )

      if (error) {
        setFormError(error.message)
        toast.error("Link konnte nicht gesendet werden", { description: error.message })
        setSubmitting(false)
        return
      }

      setSubmittedEmail(values.email)
      toast.success("Link zum Zurücksetzen gesendet", {
        description: "Check your inbox to continue.",
      })
      setSubmitting(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      setFormError(message)
      toast.error("Link konnte nicht gesendet werden", { description: message })
      setSubmitting(false)
    }
  }

  if (submittedEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
            E-Mail-Postfach prüfen
          </CardTitle>
          <CardDescription>
            Wir haben einen Link zum Zurücksetzen geschickt an{" "}
            <span className="font-medium text-foreground">{submittedEmail}</span>.
            Folge dem Link in der E-Mail, um ein neues Passwort zu setzen.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Keine E-Mail erhalten? Sieh im Spam-Ordner nach, oder{" "}
          <button
            type="button"
            onClick={() => setSubmittedEmail(null)}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            try again
          </button>
          .
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Zurück zur Anmeldung
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Passwort vergessen?</CardTitle>
        <CardDescription>
          Gib deine E-Mail-Adresse ein, wir senden dir einen Link zum Zurücksetzen.
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@firma.de"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Link senden
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Zurück zur Anmeldung
        </Link>
      </CardFooter>
    </Card>
  )
}
