"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  LIGHT_BRAND_FOREGROUND,
  contrastRatio,
  formatContrastRatio,
  normalizeHexColor,
  readableForeground,
} from "@/lib/brand-colors"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

const schema = z.object({
  name: z
    .string()
    .min(2, "Workspace-Name ist zu kurz")
    .max(80, "Workspace-Name ist zu lang"),
  domain: z
    .string()
    .max(253, "Domain ist zu lang")
    .optional()
    .refine(
      (value) =>
        !value ||
        value.length === 0 ||
        /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim()),
      "Bitte eine gültige Domain angeben (z. B. firma.de)"
    ),
  language: z.enum(["de", "en"]),
  logo_url: z
    .string()
    .max(500)
    .optional()
    .refine(
      (value) => !value || value.length === 0 || /^https:\/\//i.test(value),
      "Logo-URL muss mit https:// beginnen"
    ),
  accent_color: z
    .string()
    .optional()
    .refine(
      (value) =>
        !value || value.length === 0 || Boolean(normalizeHexColor(value)),
      "Akzent-Farbe muss ein Hex-Wert (#RRGGBB) sein"
    ),
})

type FormValues = z.infer<typeof schema>

export function BaseDataSection() {
  const { currentTenant, tenantLanguage, tenantBranding, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: currentTenant?.name ?? "",
      domain: currentTenant?.domain ?? "",
      language: tenantLanguage,
      logo_url: tenantBranding.logo_url ?? "",
      accent_color: tenantBranding.accent_color ?? "",
    },
  })
  const accentColor = useWatch({
    control: form.control,
    name: "accent_color",
  })
  const normalizedAccent = normalizeHexColor(accentColor)
  const accentForeground = normalizedAccent
    ? readableForeground(normalizedAccent)
    : LIGHT_BRAND_FOREGROUND
  const accentContrast = normalizedAccent
    ? contrastRatio(accentForeground, normalizedAccent)
    : null

  React.useEffect(() => {
    form.reset({
      name: currentTenant?.name ?? "",
      domain: currentTenant?.domain ?? "",
      language: tenantLanguage,
      logo_url: tenantBranding.logo_url ?? "",
      accent_color: tenantBranding.accent_color ?? "",
    })
  }, [
    currentTenant?.id,
    currentTenant?.name,
    currentTenant?.domain,
    tenantLanguage,
    tenantBranding.logo_url,
    tenantBranding.accent_color,
    form,
  ])

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>Kein aktiver Workspace ausgewählt.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    const trimmedDomain = values.domain?.trim() ?? ""
    const trimmedLogo = values.logo_url?.trim() ?? ""
    const trimmedColor = values.accent_color?.trim() ?? ""

    const branding = {
      logo_url: trimmedLogo.length > 0 ? trimmedLogo : null,
      accent_color: trimmedColor.length > 0 ? trimmedColor : null,
    }

    try {
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(currentTenant.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            domain:
              trimmedDomain.length > 0 ? trimmedDomain.toLowerCase() : null,
            language: values.language,
            branding,
          }),
        }
      )
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const body = (await response.json()) as ApiErrorBody
          message = body.error?.message ?? message
        } catch {
          /* ignore */
        }
        toast.error("Stammdaten konnten nicht gespeichert werden", {
          description: message,
        })
        return
      }
      toast.success("Stammdaten aktualisiert")
      await refresh()
    } catch (err) {
      toast.error("Stammdaten konnten nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stammdaten</CardTitle>
        <CardDescription>
          Workspace-Name, E-Mail-Domain, Sprache und Branding.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace-Name</FormLabel>
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
                  <FormLabel>E-Mail-Domain</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="firma.de"
                      autoComplete="off"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Neue Anmeldungen aus dieser E-Mail-Domain treten dem
                    Workspace automatisch bei. Leer lassen, um die Domain zu
                    entfernen.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sprache</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Wird gespeichert. Sichtbarer UI-Effekt folgt mit dem i18n-
                    Slice — Texte sind heute fest auf Deutsch.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Alert>
              <AlertDescription>
                <strong className="block">Branding</strong>
                Optional. Logo-URL muss HTTPS sein; Akzent-Farbe als Hex-Wert
                (#RRGGBB).
              </AlertDescription>
            </Alert>

            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo-URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://cdn.firma.de/logo.svg"
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
              name="accent_color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Akzent-Farbe</FormLabel>
                  <FormControl>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <Input
                        placeholder="#2563EB"
                        disabled={submitting}
                        className="font-mono"
                        {...field}
                      />
                      {normalizedAccent ? (
                        <div className="flex items-center gap-2">
                          <span
                            aria-label="Farbfeld-Vorschau"
                            className="h-9 w-9 shrink-0 rounded-md border"
                            style={{ backgroundColor: normalizedAccent }}
                          />
                          <Button
                            type="button"
                            variant="brand"
                            size="sm"
                            style={
                              {
                                "--brand-primary": normalizedAccent,
                                "--brand-primary-foreground": accentForeground,
                                "--brand-focus": normalizedAccent,
                              } as React.CSSProperties
                            }
                          >
                            Vorschau
                          </Button>
                          <Badge
                            variant="brand"
                            style={
                              {
                                "--brand-primary": normalizedAccent,
                                "--brand-primary-foreground": accentForeground,
                                "--brand-focus": normalizedAccent,
                              } as React.CSSProperties
                            }
                          >
                            Aktiv
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Wird als Corporate-Farbe für ausgewählte Buttons, aktive
                    Navigation und Fokus-Zustände verwendet.
                    {accentContrast !== null ? (
                      <span className="mt-1 block">
                        Kontrast mit automatischer Schriftfarbe:{" "}
                        {formatContrastRatio(accentContrast)}:1
                        {accentContrast < 4.5
                          ? " — bitte eine kräftigere Farbe wählen."
                          : " — geeignet für normale UI-Texte."}
                      </span>
                    ) : null}
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
                  "Stammdaten speichern"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
