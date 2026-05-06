"use client"

import { Plus, User, UserMinus } from "lucide-react"
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
import type { ResourceInput } from "@/lib/resources/api"
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

  const { resources, loading, error, create, update, remove } =
    useResources(options)

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
      const updated = await update(resource.id, input)
      toast.success("Ressource gespeichert")
      setDrawer({ mode: "edit", resource: updated })
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
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
                submitting={submitting}
                onSubmit={onCreate}
                onCancel={() => setDrawer({ mode: "closed" })}
                roleRates={roleRates}
                isTenantAdmin={isTenantAdmin}
              />
            ) : drawer.mode === "edit" ? (
              <>
                <ResourceForm
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

function ResourceCard({ resource, onClick }: ResourceCardProps) {
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
