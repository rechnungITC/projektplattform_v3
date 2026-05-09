"use client"

import { AlertCircle, AlertTriangle, Loader2, Plus, Sparkles, User, UserMinus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { useResources } from "@/hooks/use-resources"
import { useRoleRates } from "@/hooks/use-role-rates"
import { fetchResource, type ResourceInput } from "@/lib/resources/api"
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_KINDS,
  type Resource,
  type ResourceKind,
} from "@/types/resource"

import { AvailabilityList } from "./availability-list"
import { ResourceForm } from "./resource-form"

const ALL_KIND = "__all__"

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; resource: Resource }

export function ResourcesPageClient() {
  const [showInactive, setShowInactive] = React.useState(false)
  const [kindFilter, setKindFilter] = React.useState<
    ResourceKind | typeof ALL_KIND
  >(ALL_KIND)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)

  const options = React.useMemo(
    () => ({
      active_only: !showInactive,
      kind: kindFilter === ALL_KIND ? undefined : kindFilter,
    }),
    [showInactive, kindFilter]
  )

  const { resources, loading, error, create, update, remove, refresh } =
    useResources(options)

  // PROJ-54-γ BUG-4 v2 (2026-05-09): auto-poll the open drawer's
  // resource whenever its recompute_status is pending/running. This
  // covers BOTH the post-save flow AND the page-reload-during-flight
  // case. A single useEffect anchored on (drawer-id, status) is more
  // robust than the previous setTimeout-from-onUpdate approach.
  const drawerResourceId =
    drawer.mode === "edit" ? drawer.resource.id : null
  const drawerStatus =
    drawer.mode === "edit" ? drawer.resource.recompute_status : null
  React.useEffect(() => {
    if (!drawerResourceId) return
    if (drawerStatus !== "pending" && drawerStatus !== "running") return

    let cancelled = false
    const startedAt = Date.now()
    const tick = async () => {
      if (cancelled) return
      if (Date.now() - startedAt > 30_000) return
      try {
        const fresh = await fetchResource(drawerResourceId)
        if (cancelled) return
        if (
          fresh.recompute_status === "pending" ||
          fresh.recompute_status === "running"
        ) {
          setTimeout(tick, 1000)
          return
        }
        // Settled — push fresh state and refresh the list.
        setDrawer((current) =>
          current.mode === "edit" && current.resource.id === drawerResourceId
            ? { mode: "edit", resource: fresh }
            : current
        )
        void refresh()
        if (fresh.recompute_status === "failed") {
          toast.error("Recompute fehlgeschlagen", {
            description:
              "Mindestens ein Work-Item konnte nicht neu berechnet werden. Speichere erneut, um den Recompute neu zu starten.",
          })
        }
      } catch {
        if (cancelled) return
        setTimeout(tick, 2000)
      }
    }
    setTimeout(tick, 1000)
    return () => {
      cancelled = true
    }
  }, [drawerResourceId, drawerStatus, refresh])

  // PROJ-54-β — Tagessatz-Combobox needs the tenant's role_rates catalog
  // and admin-vs-not-admin gating. We fetch even when the drawer is
  // closed because the GET is cheap (RLS-scoped + cached) and avoids
  // a flash on first drawer-open.
  const { currentTenant, currentRole } = useAuth()
  const tenantId = currentTenant?.id ?? null
  const isTenantAdmin = currentRole === "admin"
  const { rates: roleRates } = useRoleRates(tenantId ?? "")

  async function onCreate(input: ResourceInput) {
    setSubmitting(true)
    try {
      await create(input)
      toast.success("Ressource angelegt")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onUpdate(resource: Resource, input: ResourceInput) {
    setSubmitting(true)
    try {
      // PROJ-54-β — Optimistic-Lock: send the loaded row's `updated_at`
      // so a parallel save by another editor (or the γ-recompute hook)
      // surfaces as a 409 instead of silently overwriting.
      const updated = await update(resource.id, input, {
        ifUnmodifiedSince: resource.updated_at,
      })
      toast.success("Ressource gespeichert")
      setDrawer({ mode: "edit", resource: updated })
      // PROJ-54-γ BUG-4 v2: the recompute_status useEffect above will
      // pick up the new pending/running state and poll until it
      // settles, then update the drawer and refresh the list.
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined
      const isStale = message?.includes("inzwischen geändert") ?? false
      if (isStale) {
        toast.error("Konflikt: Ressource wurde inzwischen geändert", {
          description:
            "Die Liste wird neu geladen. Bitte prüfe deine Änderungen und speichere erneut.",
        })
        setDrawer({ mode: "closed" })
      } else {
        toast.error("Speichern fehlgeschlagen", { description: message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(resource: Resource) {
    if (
      !window.confirm(
        `Ressource „${resource.display_name}" wirklich löschen? Allokationen verhindern das Löschen — deaktiviere sie stattdessen.`
      )
    ) {
      return
    }
    try {
      await remove(resource.id)
      toast.success("Ressource gelöscht")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Ressourcen
            </h1>
            <p className="text-sm text-muted-foreground">
              Mandantenweiter Pool plannbarer Personen oder externer Parteien.
              Allokationen passieren pro Work Item; FTE und Verfügbarkeit
              werden zentral hier gepflegt.
            </p>
          </div>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Ressource
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={kindFilter}
            onValueChange={(v) =>
              setKindFilter(v as ResourceKind | typeof ALL_KIND)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_KIND}>Alle Arten</SelectItem>
              {RESOURCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {RESOURCE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Auch inaktive zeigen
          </label>
        </div>

        {loading && resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Ressourcen …</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : resources.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Keine Ressourcen. Lege eine an oder beförder einen Stakeholder.
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {resources.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                onClick={() => setDrawer({ mode: "edit", resource: r })}
              />
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "edit"
                ? `${drawer.resource.display_name} bearbeiten`
                : "Neue Ressource"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "edit"
                ? "Änderungen werden auditiert. Inaktive Ressourcen sind im Auslastungs-Bericht ausgeblendet."
                : "Lege eine neue Ressource an. Befördern eines Stakeholders ist über den Stakeholder-Tab möglich."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-6">
            {drawer.mode === "create" ? (
              <ResourceForm
                key="create"
                submitting={submitting}
                onSubmit={onCreate}
                onCancel={() => setDrawer({ mode: "closed" })}
                roleRates={roleRates}
                isTenantAdmin={isTenantAdmin}
              />
            ) : drawer.mode === "edit" ? (
              <>
                {/*
                  PROJ-54-β-BUG-1 fix: key the form by resource id so
                  switching to a different resource within the open
                  drawer unmounts/remounts the form and reinitializes
                  its `tagessatz` useState. Without the key, the form
                  reuses the previous resource's state and could fire
                  an explicit-null clear on save (silent data loss).
                */}
                <ResourceForm
                  key={drawer.resource.id}
                  initial={drawer.resource}
                  submitting={submitting}
                  onSubmit={(input) => onUpdate(drawer.resource, input)}
                  onCancel={() => setDrawer({ mode: "closed" })}
                  roleRates={roleRates}
                  isTenantAdmin={isTenantAdmin}
                />
                <div className="border-t pt-6">
                  <AvailabilityList resourceId={drawer.resource.id} />
                </div>
                <div className="border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void onDelete(drawer.resource)}
                  >
                    <UserMinus className="mr-2 h-4 w-4" aria-hidden />
                    Ressource löschen
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

interface ResourceCardProps {
  resource: Resource
  onClick: () => void
}

function formatDailyRate(amount: number, currency: string): string {
  return `${amount.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}/Tag`
}

function ResourceCard({ resource, onClick }: ResourceCardProps) {
  const hasOverride =
    resource.daily_rate_override != null &&
    resource.daily_rate_override_currency != null
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/30"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{resource.display_name}</p>
              <Badge variant="outline" className="text-xs">
                {RESOURCE_KIND_LABELS[resource.kind]}
              </Badge>
              {!resource.is_active ? (
                <Badge variant="secondary" className="text-xs">
                  Inaktiv
                </Badge>
              ) : null}
              {hasOverride ? (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs"
                  title="Eigener Tagessatz-Override"
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {formatDailyRate(
                    resource.daily_rate_override!,
                    resource.daily_rate_override_currency!,
                  )}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-destructive/40 text-xs text-destructive"
                  title="Kein Override gesetzt — Auflösung läuft über Rolle (sofern vorhanden)"
                >
                  <AlertCircle className="h-3 w-3" aria-hidden />
                  Kein Override
                </Badge>
              )}
              {/* PROJ-54-γ — recompute status indicator on the card. */}
              {resource.recompute_status === "pending" ||
              resource.recompute_status === "running" ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-info/40 text-xs text-info"
                  title="Cost-Lines werden im Hintergrund neu berechnet"
                >
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Recompute
                </Badge>
              ) : null}
              {resource.recompute_status === "failed" ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-destructive/40 text-xs text-destructive"
                  title="Letzter Cost-Line-Recompute schlug fehl — Resource erneut speichern, um neu zu starten"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  Recompute fehlgeschlagen
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              FTE {resource.fte_default} · Verfügbar{" "}
              {Math.round(resource.availability_default * 100)}%
              {resource.linked_user_id ? " · verknüpft mit Account" : ""}
            </p>
          </div>
        </div>
      </button>
    </li>
  )
}
