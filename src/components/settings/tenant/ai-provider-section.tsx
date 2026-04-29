"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Bot, Loader2, ShieldAlert } from "lucide-react"
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

const SUGGESTED_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const

const schema = z.object({
  external_provider: z.enum(["anthropic", "none"]),
  model_id: z.string().max(100).optional(),
})

type FormValues = z.infer<typeof schema>

export function AiProviderSection() {
  const { currentTenant, tenantSettings, refresh } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      external_provider:
        tenantSettings?.ai_provider_config.external_provider ?? "none",
      model_id: tenantSettings?.ai_provider_config.model_id ?? "",
    },
  })

  React.useEffect(() => {
    if (!tenantSettings) return
    form.reset({
      external_provider: tenantSettings.ai_provider_config.external_provider,
      model_id: tenantSettings.ai_provider_config.model_id ?? "",
    })
  }, [
    tenantSettings?.ai_provider_config.external_provider,
    tenantSettings?.ai_provider_config.model_id,
    tenantSettings,
    form,
  ])

  if (!currentTenant || !tenantSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>KI-Provider</CardTitle>
          <CardDescription>Lade Workspace-Einstellungen …</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const watchedProvider = form.watch("external_provider")

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const modelId = values.model_id?.trim() ?? ""
      await updateTenantSettings(currentTenant.id, {
        ai_provider_config: {
          external_provider: values.external_provider,
          ...(modelId.length > 0 ? { model_id: modelId } : {}),
        },
      })
      toast.success("KI-Provider-Konfiguration gespeichert")
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
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden /> KI-Provider
        </CardTitle>
        <CardDescription>
          Externer LLM-Provider für KI-Vorschläge. Klasse-3-Hard-Block greift
          unabhängig von dieser Konfiguration und kann nicht überschrieben
          werden.
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
              name="external_provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Externer Provider</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="space-y-2"
                      disabled={submitting}
                    >
                      <label className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value="none" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">
                            Keiner (lokal / Stub)
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Vorschläge werden deterministisch lokal erzeugt.
                            Stand-alone-tauglich; keine externen Token-Kosten.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value="anthropic" className="mt-0.5" />
                        <span>
                          <span className="block font-medium">Anthropic</span>
                          <span className="text-xs text-muted-foreground">
                            Claude-Modelle. Erfordert
                            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">
                              ANTHROPIC_API_KEY
                            </code>
                            in der Server-Umgebung.
                          </span>
                        </span>
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedProvider === "anthropic" ? (
              <FormField
                control={form.control}
                name="model_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modell-ID (optional)</FormLabel>
                    <FormControl>
                      <Input
                        list="anthropic-models"
                        placeholder="claude-opus-4-7"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <datalist id="anthropic-models">
                      {SUGGESTED_MODELS.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <FormDescription>
                      Leer lassen für den Server-Default (claude-opus-4-7
                      oder ANTHROPIC_MODEL-Override).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <Alert>
              <ShieldAlert className="h-4 w-4" aria-hidden />
              <AlertTitle>Klasse-3-Hard-Block bleibt aktiv</AlertTitle>
              <AlertDescription>
                Auch mit Anthropic-Konfiguration werden Payloads, die
                Klasse-3-Daten enthalten, automatisch lokal verarbeitet —
                durchsetzt vom KI-Router (PROJ-12), nicht überschreibbar.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Speichern …
                  </>
                ) : (
                  "KI-Konfiguration speichern"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
