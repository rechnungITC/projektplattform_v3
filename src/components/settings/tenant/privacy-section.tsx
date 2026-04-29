"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Loader2 } from "lucide-react"
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
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { useAuth } from "@/hooks/use-auth"
import { updateTenantSettings } from "@/lib/tenant-settings/api"

const SYSTEM_DEFAULT_RETENTION = 730

const schema = z.object({
  default_class: z.union([z.literal("1"), z.literal("2"), z.literal("3")]),
  audit_log_days: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d+$/.test(v),
      "Bitte eine ganze Zahl in Tagen angeben"
    ),
})

type FormValues = z.infer<typeof schema>

export function PrivacySection() {
  const { currentTenant, tenantSettings, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const initialClass = String(
    tenantSettings?.privacy_defaults.default_class ?? 3
  ) as "1" | "2" | "3"
  const initialDays = tenantSettings?.retention_overrides.audit_log_days

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      default_class: initialClass,
      audit_log_days:
        typeof initialDays === "number" ? String(initialDays) : "",
    },
  })

  React.useEffect(() => {
    form.reset({
      default_class: initialClass,
      audit_log_days:
        typeof initialDays === "number" ? String(initialDays) : "",
    })
  }, [initialClass, initialDays, form])

  if (!currentTenant || !tenantSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Datenschutz</CardTitle>
          <CardDescription>Lade Workspace-Einstellungen …</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const watchedClass = form.watch("default_class")
  const willBeMoreConservative =
    Number(watchedClass) > tenantSettings.privacy_defaults.default_class

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const days = values.audit_log_days?.trim() ?? ""
      await updateTenantSettings(currentTenant.id, {
        privacy_defaults: {
          default_class: Number(values.default_class) as 1 | 2 | 3,
        },
        retention_overrides:
          days.length > 0
            ? { audit_log_days: Number(days) }
            : {},
      })
      toast.success("Datenschutz-Einstellungen gespeichert")
      await refresh()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datenschutz</CardTitle>
        <CardDescription>
          Default-Datenklasse für unspezifizierte Felder und Aufbewahrung des
          Audit-Logs. Bekannte Klasse-3-Felder bleiben Klasse 3 — der Default
          gilt nur für unbekannte Felder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="default_class"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Default-Datenklasse für unspezifizierte Felder
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="space-y-2"
                      disabled={submitting}
                    >
                      <label className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value="1" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">Klasse 1</span>
                          <span className="text-xs text-muted-foreground">
                            Permissiv — unspezifizierte Felder gelten als
                            öffentlich; externer Provider erlaubt.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value="2" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">Klasse 2</span>
                          <span className="text-xs text-muted-foreground">
                            Mittel — geschäftlicher Kontext; externer Provider
                            erlaubt.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value="3" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">
                            Klasse 3 (empfohlen)
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Konservativ — unspezifizierte Felder werden lokal
                            verarbeitet; externer Provider geblockt.
                          </span>
                        </span>
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {willBeMoreConservative ? (
              <Alert>
                <AlertCircle className="h-4 w-4" aria-hidden />
                <AlertTitle>Mehr Daten werden lokal verarbeitet</AlertTitle>
                <AlertDescription>
                  Die neue Default-Klasse ist konservativer. Mehr unspezifizierte
                  Felder gehen ans lokale Modell statt extern.
                </AlertDescription>
              </Alert>
            ) : null}

            <FormField
              control={form.control}
              name="audit_log_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Audit-Log-Aufbewahrung (Tage)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      placeholder={String(SYSTEM_DEFAULT_RETENTION)}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Leer lassen für System-Default ({SYSTEM_DEFAULT_RETENTION}{" "}
                    Tage). Maximum: 3650 Tage (10 Jahre).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Speichern …
                  </>
                ) : (
                  "Datenschutz speichern"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
