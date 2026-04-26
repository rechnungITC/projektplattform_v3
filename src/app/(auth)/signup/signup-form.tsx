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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

const signupSchema = z.object({
  display_name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name is too long"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
})

type SignupValues = z.infer<typeof signupSchema>

export function SignupForm() {
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { display_name: "", email: "", password: "" },
  })

  const onSubmit = async (values: SignupValues) => {
    setSubmitting(true)
    setFormError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { display_name: values.display_name },
        },
      })

      if (error) {
        setFormError(error.message)
        toast.error("Sign up failed", { description: error.message })
        setSubmitting(false)
        return
      }

      // Email confirmation may be required — no session yet in that case.
      if (!data.session) {
        toast.success("Check your inbox", {
          description:
            "We sent you a confirmation link. Verify your email, then log in.",
        })
        setSubmitting(false)
        return
      }

      // Session exists — go to onboarding so the workspace is set up.
      window.location.href = "/onboarding"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setFormError(message)
      toast.error("Sign up failed", { description: message })
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          We&apos;ll auto-link you to your organization based on your work email.
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
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="name"
                      placeholder="Jane Doe"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Work email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@firma.de"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use your company email so we can route you to your team
                    workspace.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>At least 8 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Create account
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        <span>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </span>
      </CardFooter>
    </Card>
  )
}
