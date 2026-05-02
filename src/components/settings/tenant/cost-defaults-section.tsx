"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { updateTenantSettings } from "@/lib/tenant-settings/api"
import {
  COST_SETTINGS_DEFAULTS,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  VELOCITY_FACTOR_MAX,
  VELOCITY_FACTOR_MIN,
} from "@/types/tenant-settings"

/**
 * PROJ-24 ST-02 — Tenant-level cost defaults.
 *
 * - velocity_factor: SP → person-day conversion for Story-Cost calc.
 * - default_currency: prefilled in role-rates and manual cost-line dialogs.
 *
 * Range checks mirror the backend Zod validation (no DB CHECK because
 * the column is JSONB).
 */

const schema = z.object({
  velocity_factor: z
    .string()
    .refine(
      (v) => {
        const n = Number(v)
        return Number.isFinite(n) && n >= VELOCITY_FACTOR_MIN && n <= VELOCITY_FACTOR_MAX
      },
      `Velocity-Faktor muss zwischen ${VELOCITY_FACTOR_MIN} und ${VELOCITY_FACTOR_MAX} liegen.`
    ),
  default_currency: z.enum(
    SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
  ),
})

type FormValues = z.infer<typeof schema>

export function CostDefaultsSection() {
  const { currentTenant, tenantSettings, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const initialFactor =
    tenantSettings?.cost_settings?.velocity_factor ??
    COST_SETTINGS_DEFAULTS.velocity_factor
  const initialCurrency =
    tenantSettings?.cost_settings?.default_currency ??
    COST_SETTINGS_DEFAULTS.default_currency

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      velocity_factor: String(initialFactor),
      default_currency: initialCurrency,
    },
  })

  React.useEffect(() => {
    form.reset({
      velocity_factor: String(initialFactor),
      default_currency: initialCurrency,
    })
  }, [initialFactor, initialCurrency, form])

  if (!currentTenant || !tenantSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kosten-Defaults</CardTitle>
          <CardDescription>Lade Workspace-Einstellungen …</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      await updateTenantSettings(currentTenant.id, {
        cost_settings: {
          velocity_factor: Number(values.velocity_factor),
          default_currency: values.default_currency as SupportedCurrency,
        },
      })
      toast.success("Kosten-Defaults gespeichert")
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
        <CardTitle>Kosten-Defaults</CardTitle>
        <CardDescription>
          Velocity-Faktor und Default-Währung für die Kosten-Berechnung. Diese
          Werte greifen für Story-Cost (SP × Velocity × Tagessatz) und für
          neue Tagessätze sowie manuelle Cost-Lines.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="velocity_factor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Velocity-Faktor (SP → Personentage)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.05"
                        min={VELOCITY_FACTOR_MIN}
                        max={VELOCITY_FACTOR_MAX}
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      1 Story-Point ≈ X Personentage. Default {COST_SETTINGS_DEFAULTS.velocity_factor},
                      Bereich {VELOCITY_FACTOR_MIN}–{VELOCITY_FACTOR_MAX}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="default_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default-Währung</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={submitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Vorbelegt für neue Tagessätze und manuelle Cost-Lines.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Speichern …
                  </>
                ) : (
                  "Kosten-Defaults speichern"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
