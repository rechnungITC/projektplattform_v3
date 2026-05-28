"use client"

/**
 * PROJ-65 ε.3e (F-64) — ProjectSettingsClient.
 *
 * Project-level settings surface. Currently exposes the Plan-Mutate
 * governance kill-switch + snap-to-week behavior. Toggles are optimistic
 * with rollback on error; RBAC is enforced server-side (403 ⇒ rollback).
 */

import { AlertTriangle, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  getProjectSettings,
  updateProjectSettings,
  type ProjectSettingsResponse,
} from "@/lib/project-settings/api"

interface ProjectSettingsClientProps {
  projectId: string
}

export function ProjectSettingsClient({
  projectId,
}: ProjectSettingsClientProps) {
  const [settings, setSettings] =
    React.useState<ProjectSettingsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [savingEnabled, setSavingEnabled] = React.useState(false)
  const [savingSnap, setSavingSnap] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getProjectSettings(projectId)
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  async function onToggleEnabled(next: boolean) {
    if (!settings) return
    const prev = settings
    setSavingEnabled(true)
    setSettings({
      ...settings,
      plan_mutate: { ...settings.plan_mutate, enabled: next },
    })
    try {
      await updateProjectSettings(projectId, { enabled: next })
      toast.success(
        next
          ? "Plan-Mutate für dieses Projekt aktiviert"
          : "Plan-Mutate für dieses Projekt deaktiviert",
      )
    } catch (err) {
      setSettings(prev)
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSavingEnabled(false)
    }
  }

  async function onToggleSnap(next: boolean) {
    if (!settings) return
    const prev = settings
    setSavingSnap(true)
    setSettings({
      ...settings,
      plan_mutate: { ...settings.plan_mutate, snap_to_week: next },
    })
    try {
      await updateProjectSettings(projectId, { snap_to_week: next })
      toast.success(
        next ? "Snap-to-Week aktiviert" : "Snap-to-Week deaktiviert",
      )
    } catch (err) {
      setSettings(prev)
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSavingSnap(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Einstellungen konnten nicht geladen werden</CardTitle>
          <CardDescription>{error ?? "Unbekannter Fehler"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { plan_mutate, permissions, tenant_plan_mutate_enabled } = settings

  return (
    <Card data-testid="project-settings-plan-mutate">
      <CardHeader>
        <CardTitle>Plan-Mutate</CardTitle>
        <CardDescription>
          Steuerung der interaktiven Plan-Verschiebung im Trajektorien-Graphen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!tenant_plan_mutate_enabled && (
          <Alert>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            <AlertDescription>
              Plan-Mutate ist tenant-weit deaktiviert — die Projekt-Einstellung
              wirkt erst, wenn ein Admin es tenant-weit aktiviert.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label
              htmlFor="plan-mutate-enabled"
              className="text-sm font-medium"
            >
              Plan-Mutate für dieses Projekt aktiviert
            </Label>
            <p className="text-xs text-muted-foreground">
              Governance-Kill-Switch. Nur Projektleitung und Administratoren
              können diese Einstellung ändern.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {savingEnabled && (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
            <Switch
              id="plan-mutate-enabled"
              checked={plan_mutate.enabled}
              disabled={!permissions.can_toggle_enabled || savingEnabled}
              onCheckedChange={(v) => void onToggleEnabled(v)}
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="plan-mutate-snap" className="text-sm font-medium">
              Auf ganze Wochen einrasten (Snap-to-Week)
            </Label>
            <p className="text-xs text-muted-foreground">
              Verschiebungen werden auf volle Wochen gerundet.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {savingSnap && (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
            <Switch
              id="plan-mutate-snap"
              checked={plan_mutate.snap_to_week}
              disabled={!permissions.can_toggle_snap || savingSnap}
              onCheckedChange={(v) => void onToggleSnap(v)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
