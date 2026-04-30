"use client"

import { ListChecks } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useMethodOverrides } from "@/hooks/use-method-overrides"
import { METHOD_TEMPLATES } from "@/lib/method-templates"
import {
  countEnabledAfterToggle,
  VALID_METHOD_KEYS,
} from "@/lib/method-templates/overrides"
import type { ProjectMethod } from "@/types/project-method"

export function MethodsPageClient() {
  const { rows, loading, error, toggle } = useMethodOverrides()
  const [pending, setPending] = React.useState<ProjectMethod | null>(null)

  const enabledMap = React.useMemo(() => {
    const overrides = new Map<ProjectMethod, boolean>(
      rows.map((r) => [r.method_key, r.enabled])
    )
    const result = {} as Record<ProjectMethod, boolean>
    for (const k of VALID_METHOD_KEYS) {
      result[k] = overrides.get(k) ?? true
    }
    return result
  }, [rows])

  async function handleToggle(method: ProjectMethod, next: boolean) {
    // Fail-fast preview before hitting the server. The DB trigger has the
    // last word, but this gives instant UX feedback.
    if (!next && countEnabledAfterToggle(rows, method, false) === 0) {
      toast.error("Mindestens eine Methode muss aktiviert bleiben.", {
        description:
          "Aktiviere zuerst eine andere Methode, dann kannst du diese hier deaktivieren.",
      })
      return
    }
    setPending(method)
    try {
      await toggle(method, next)
      toast.success(
        next
          ? `${METHOD_TEMPLATES[method].label} aktiviert`
          : `${METHOD_TEMPLATES[method].label} deaktiviert`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler"
      toast.error("Speichern fehlgeschlagen", { description: message })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ListChecks className="h-6 w-6" aria-hidden />
          Methoden
        </h1>
        <p className="text-sm text-muted-foreground">
          Aktiviere oder deaktiviere die verfügbaren Projektmethoden für
          deinen Tenant. Bestehende Projekte mit deaktivierter Methode laufen
          unverändert weiter — der Toggle versteckt die Methode nur in
          neuen Projekten und im Wizard. Mindestens eine Methode bleibt
          aktiv.
        </p>
      </header>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Methoden …</p>
      ) : error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {VALID_METHOD_KEYS.map((method) => {
            const config = METHOD_TEMPLATES[method]
            const enabled = enabledMap[method]
            const overridden = rows.some((r) => r.method_key === method)
            return (
              <li key={method}>
                <Card className="h-full">
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{config.label}</p>
                          <code className="text-xs text-muted-foreground">
                            {method}
                          </code>
                          {overridden ? (
                            <Badge variant="default">Override aktiv</Badge>
                          ) : (
                            <Badge variant="outline">Default</Badge>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={pending === method}
                        onCheckedChange={(v) => void handleToggle(method, v)}
                        aria-label={`${config.label} ${enabled ? "deaktivieren" : "aktivieren"}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
