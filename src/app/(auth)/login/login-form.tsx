"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
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

const loginSchema = z.object({
  email: z.string().min(1, "E-Mail ist erforderlich").email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort ist erforderlich"),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })

      if (error) {
        setFormError(error.message)
        toast.error("Anmeldung fehlgeschlagen", { description: error.message })
        setSubmitting(false)
        return
      }

      if (!data.session) {
        const message = "No session was returned. Please try again."
        setFormError(message)
        toast.error("Anmeldung fehlgeschlagen", { description: message })
        setSubmitting(false)
        return
      }

      // Per frontend rule: use window.location.href for post-login redirect
      window.location.href = "/"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      setFormError(message)
      toast.error("Anmeldung fehlgeschlagen", { description: message })
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Anmelden</CardTitle>
        <CardDescription>
          Melde dich mit E-Mail und Passwort in deinem Workspace an.
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Passwort</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Passwort vergessen?
                    </Link>
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
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
              Anmelden
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        <span>
          Neu bei Projektplattform?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Konto anlegen
          </Link>
        </span>
      </CardFooter>
    </Card>
  )
}
