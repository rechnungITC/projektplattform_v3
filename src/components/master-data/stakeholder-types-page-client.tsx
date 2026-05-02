"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { StakeholderTypeFormDialog } from "@/components/master-data/stakeholder-type-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deactivateStakeholderType,
  listStakeholderTypes,
} from "@/lib/stakeholder-types/api"
import {
  isGlobalDefault,
  type StakeholderType,
} from "@/types/stakeholder-type"

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; type: StakeholderType }

export function StakeholderTypesPageClient() {
  const [types, setTypes] = React.useState<StakeholderType[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await listStakeholderTypes()
      setTypes(list)
    } catch (err) {
      toast.error("Stakeholder-Typen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const globalTypes = types.filter(isGlobalDefault)
  const tenantTypes = types.filter((t) => !isGlobalDefault(t))

  const handleDeactivate = async (id: string, label: string) => {
    if (!confirm(`Wirklich „${label}" deaktivieren? Bestehende Stakeholder behalten den Wert, aber neue Auswahlen sind nicht mehr möglich.`)) return
    try {
      await deactivateStakeholderType(id)
      toast.success(`„${label}" deaktiviert`)
      await reload()
    } catch (err) {
      toast.error("Deaktivieren fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Stakeholder-Typen
          </h1>
          <p className="text-sm text-muted-foreground">
            Globale Defaults sind fest vorgegeben. Eigene Typen sind tenant-weit
            verfügbar und können bei Bedarf deaktiviert werden.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> Eigener Typ
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="custom" className="space-y-4">
          <TabsList>
            <TabsTrigger value="custom">
              Eigene Typen ({tenantTypes.length})
            </TabsTrigger>
            <TabsTrigger value="defaults">
              Globale Defaults ({globalTypes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="custom">
            {tenantTypes.length === 0 ? (
              <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                Noch keine eigenen Typen. Klicke auf „+ Eigener Typ&quot;, um einen anzulegen.
              </div>
            ) : (
              <TypeTable
                types={tenantTypes}
                onEdit={(t) => setDialog({ mode: "edit", type: t })}
                onDeactivate={handleDeactivate}
                editable
              />
            )}
          </TabsContent>

          <TabsContent value="defaults">
            <p className="mb-3 text-xs text-muted-foreground">
              Globale Defaults sind tenant-übergreifend verfügbar und können
              nicht editiert oder gelöscht werden.
            </p>
            <TypeTable
              types={globalTypes}
              onEdit={() => undefined}
              onDeactivate={() => undefined}
              editable={false}
            />
          </TabsContent>
        </Tabs>
      )}

      <StakeholderTypeFormDialog
        open={dialog.mode !== "closed"}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initial={dialog.mode === "edit" ? dialog.type : null}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={() => {
          void reload()
          setDialog({ mode: "closed" })
        }}
      />
    </div>
  )
}

interface TypeTableProps {
  types: StakeholderType[]
  onEdit: (t: StakeholderType) => void
  onDeactivate: (id: string, label: string) => void
  editable: boolean
}

function TypeTable({ types, onEdit, onDeactivate, editable }: TypeTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Farbe</TableHead>
            <TableHead>Label DE</TableHead>
            <TableHead className="hidden sm:table-cell">Label EN</TableHead>
            <TableHead className="hidden md:table-cell">Key</TableHead>
            <TableHead className="hidden md:table-cell text-right">
              Reihenfolge
            </TableHead>
            <TableHead className="text-right">Status</TableHead>
            {editable && <TableHead className="w-[100px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <span
                  className="inline-block h-4 w-4 rounded-full border"
                  style={{ backgroundColor: t.color }}
                  aria-label={`Farbe: ${t.color}`}
                />
              </TableCell>
              <TableCell className="font-medium">{t.label_de}</TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground">
                {t.label_en ?? "—"}
              </TableCell>
              <TableCell className="hidden md:table-cell font-mono text-xs">
                {t.key}
              </TableCell>
              <TableCell className="hidden md:table-cell text-right text-muted-foreground">
                {t.display_order}
              </TableCell>
              <TableCell className="text-right">
                {t.is_active ? (
                  <Badge variant="secondary">Aktiv</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inaktiv
                  </Badge>
                )}
              </TableCell>
              {editable && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(t)}
                      title="Bearbeiten"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    {t.is_active && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDeactivate(t.id, t.label_de)}
                        title="Deaktivieren"
                      >
                        <Trash2
                          className="h-3.5 w-3.5 text-destructive"
                          aria-hidden
                        />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
