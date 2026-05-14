"use client"

import { Building2, Plus, Receipt, Search } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { useVendors } from "@/hooks/use-vendors"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type { VendorInput } from "@/lib/vendors/api"
import {
  type Vendor,
  type VendorStatus,
  type VendorWithStats,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUSES,
} from "@/types/vendor"

import { VendorInvoicesTab } from "../budget/vendor-invoices-tab"
import { VendorDocumentsTab } from "./vendor-documents-tab"
import { VendorEvaluationsTab } from "./vendor-evaluations-tab"
import { VendorForm } from "./vendor-form"

const ALL_STATUS = "__all__"

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; vendor: VendorWithStats }

export function VendorsPageClient() {
  const [statusFilter, setStatusFilter] = React.useState<
    VendorStatus | typeof ALL_STATUS
  >("active")
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const options = React.useMemo(
    () => ({
      status: statusFilter === ALL_STATUS ? undefined : statusFilter,
      search: debouncedSearch || undefined,
    }),
    [statusFilter, debouncedSearch]
  )

  const { currentRole, tenantSettings } = useAuth()
  const canEdit = currentRole !== "viewer"
  const budgetActive = isModuleActive(tenantSettings, "budget")

  const { vendors, loading, error, create, update, remove } = useVendors(options)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)

  // Keep drawer entry fresh after refresh.
  React.useEffect(() => {
    if (drawer.mode !== "edit") return
    const fresh = vendors.find((v) => v.id === drawer.vendor.id)
    if (fresh && fresh !== drawer.vendor) {
      setDrawer({ mode: "edit", vendor: fresh })
    }
  }, [vendors, drawer])

  async function onCreate(input: VendorInput) {
    setSubmitting(true)
    try {
      await create(input)
      toast.success("Vendor angelegt")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onUpdate(vendor: Vendor, input: VendorInput) {
    setSubmitting(true)
    try {
      await update(vendor.id, input)
      toast.success("Vendor aktualisiert")
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete(vendor: Vendor) {
    if (
      !window.confirm(
        `Vendor „${vendor.name}" wirklich löschen? Bewertungen, Dokumente und Projekt-Zuordnungen werden mit gelöscht.`
      )
    )
      return
    try {
      await remove(vendor.id)
      toast.success("Vendor gelöscht")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Building2 className="h-6 w-6" aria-hidden />
              Lieferanten
            </h1>
            <p className="text-sm text-muted-foreground">
              Mandantenweiter Vendor-Pool. Bewertungen + Dokumente werden hier
              gepflegt; Projekt-Zuordnungen mit Rolle erfolgen im Projektraum.
            </p>
          </div>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Neuer Lieferant
          </Button>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="search">Suche (Name)</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Acme …"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-44">
            <Label htmlFor="status">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as VendorStatus | typeof ALL_STATUS)
              }
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Alle</SelectItem>
                {VENDOR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {VENDOR_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Lieferanten …</p>
        ) : error ? (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : vendors.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Keine Lieferanten im gewählten Filter.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {vendors.map((v) => (
              <VendorCard
                key={v.id}
                vendor={v}
                onClick={() => setDrawer({ mode: "edit", vendor: v })}
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
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          {drawer.mode === "create" ? (
            <>
              <SheetHeader>
                <SheetTitle>Neuer Lieferant</SheetTitle>
                <SheetDescription>
                  Stammdaten anlegen. Bewertungen, Dokumente und
                  Projekt-Zuordnungen können nach dem Speichern hinzugefügt
                  werden.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <VendorForm submitting={submitting} onSubmit={onCreate} />
              </div>
            </>
          ) : drawer.mode === "edit" ? (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.vendor.name}</SheetTitle>
                <SheetDescription>
                  Stammdaten, Bewertungen, Dokumente und aktive
                  Projekt-Zuordnungen.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <Tabs defaultValue="form">
                  <TabsList>
                    <TabsTrigger value="form">Stammdaten</TabsTrigger>
                    <TabsTrigger value="evaluations">
                      Bewertungen ({drawer.vendor.evaluation_count})
                    </TabsTrigger>
                    <TabsTrigger value="documents">Dokumente</TabsTrigger>
                    <TabsTrigger value="projects">
                      Projekte ({drawer.vendor.assignment_count})
                    </TabsTrigger>
                    {budgetActive ? (
                      <TabsTrigger value="invoices" className="gap-1">
                        <Receipt className="h-3.5 w-3.5" aria-hidden />
                        Rechnungen
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                  <TabsContent value="form" className="mt-4">
                    <VendorForm
                      initial={drawer.vendor}
                      submitting={submitting}
                      onSubmit={(input) => onUpdate(drawer.vendor, input)}
                    />
                    <div className="mt-6 border-t pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => void onDelete(drawer.vendor)}
                      >
                        Vendor löschen (CASCADE)
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="evaluations" className="mt-4">
                    <VendorEvaluationsTab vendorId={drawer.vendor.id} />
                  </TabsContent>
                  <TabsContent value="documents" className="mt-4">
                    <VendorDocumentsTab vendorId={drawer.vendor.id} />
                  </TabsContent>
                  <TabsContent value="projects" className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      Aktive Projekt-Zuordnungen werden in den Projekträumen
                      gepflegt. Aktuell:{" "}
                      <strong>{drawer.vendor.assignment_count}</strong>{" "}
                      Zuordnung
                      {drawer.vendor.assignment_count === 1 ? "" : "en"}.
                    </p>
                  </TabsContent>
                  {budgetActive ? (
                    <TabsContent value="invoices" className="mt-4">
                      <VendorInvoicesTab
                        vendorId={drawer.vendor.id}
                        canEdit={canEdit}
                      />
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

interface VendorCardProps {
  vendor: VendorWithStats
  onClick: () => void
}

function VendorCard({ vendor, onClick }: VendorCardProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/30"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted">
            <Building2 className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{vendor.name}</p>
              {vendor.status === "inactive" ? (
                <Badge variant="secondary">Inaktiv</Badge>
              ) : null}
              {vendor.avg_score !== null ? (
                <Badge variant="outline">
                  ⌀ {vendor.avg_score} / 5
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {vendor.category ?? "—"} ·{" "}
              {vendor.evaluation_count} Bewertung
              {vendor.evaluation_count === 1 ? "" : "en"} ·{" "}
              {vendor.assignment_count} Projekt
              {vendor.assignment_count === 1 ? "" : "e"}
            </p>
          </div>
        </div>
      </button>
    </li>
  )
}
