"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { updateTenantSettings } from "@/lib/tenant-settings/api"
import {
  MODULE_LABELS,
  RESERVED_MODULES,
  TOGGLEABLE_MODULES,
  type ModuleKey,
} from "@/types/tenant-settings"

export function ModulesSection() {
  const { currentTenant, tenantSettings, refresh } = useAuth()
  const [pending, setPending] = React.useState<ModuleKey | null>(null)

  if (!currentTenant || !tenantSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module</CardTitle>
          <CardDescription>
            Lade Workspace-Einstellungen …
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const isActive = (key: ModuleKey) =>
    tenantSettings.active_modules.includes(key)

  const onToggle = async (key: ModuleKey, next: boolean) => {
    setPending(key)
    const updated = next
      ? Array.from(new Set([...tenantSettings.active_modules, key]))
      : tenantSettings.active_modules.filter((m) => m !== key)
    try {
      await updateTenantSettings(currentTenant.id, {
        active_modules: updated,
      })
      toast.success(
        `${MODULE_LABELS[key]} ${next ? "aktiviert" : "deaktiviert"}`
      )
      await refresh()
    } catch (err) {
      toast.error("Modul-Toggle fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module</CardTitle>
        <CardDescription>
          Schalte optionale Funktionsbereiche für diesen Workspace ein oder
          aus. Daten gehen nicht verloren — deaktivierte Module werden nur in
          der Navigation und im API ausgeblendet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Verfügbar</p>
          <ul className="divide-y rounded-md border">
            {TOGGLEABLE_MODULES.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm">{MODULE_LABELS[key]}</span>
                <div className="flex items-center gap-2">
                  {pending === key ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <Switch
                    checked={isActive(key)}
                    disabled={pending !== null}
                    onCheckedChange={(checked) => void onToggle(key, checked)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Demnächst</p>
          <ul className="divide-y rounded-md border bg-muted/20">
            {RESERVED_MODULES.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3 opacity-70"
              >
                <span className="text-sm">{MODULE_LABELS[key]}</span>
                <Badge variant="outline">Demnächst</Badge>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
