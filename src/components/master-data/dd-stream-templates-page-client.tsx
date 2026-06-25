"use client"

import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { DdStreamTemplateFormDialog } from "@/components/master-data/dd-stream-template-form-dialog"
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
import { useAuth } from "@/hooks/use-auth"
import {
  type DdStreamTemplate,
  deleteDdStreamTemplate,
  listDdStreamTemplates,
  updateDdStreamTemplate,
} from "@/lib/ma-project/dd-streams-api"

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; template: DdStreamTemplate }

export function DdStreamTemplatesPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [templates, setTemplates] = React.useState<DdStreamTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      // GET lazily seeds the 6 standard streams on first access.
      setTemplates(await listDdStreamTemplates())
    } catch (err) {
      toast.error("DD-Stream-Vorlagen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  const setActive = async (t: DdStreamTemplate, active: boolean) => {
    try {
      await updateDdStreamTemplate(t.id, { is_active: active })
      toast.success(active ? `„${t.label}“ reaktiviert` : `„${t.label}“ deaktiviert`)
      await reload()
    } catch (err) {
      toast.error("Aktion fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const handleDelete = async (t: DdStreamTemplate) => {
    if (!window.confirm(`Vorlage „${t.label}“ endgültig löschen?`)) return
    try {
      await deleteDdStreamTemplate(t.id)
      toast.success(`„${t.label}“ gelöscht`)
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DD-Stream-Vorlagen</h1>
          <p className="text-sm text-muted-foreground">
            Tenant-weiter Katalog der Due-Diligence-Streams (Commercial, Financial,
            Tax, Legal, HR, IT …). Beim Aktivieren in einem M&amp;A-Projekt werden sie
            kopiert (Copy-on-create). Nur Admins verwalten sie.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Neue Vorlage
          </Button>
        )}
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Noch keine Vorlagen.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead className="hidden sm:table-cell">Schlüssel</TableHead>
                <TableHead className="hidden md:table-cell">Beschreibung</TableHead>
                <TableHead className="text-right">Status</TableHead>
                {isAdmin && <TableHead className="w-[140px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className={t.is_active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {t.stream_key}
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs truncate text-muted-foreground">
                    {t.description ?? "—"}
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
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDialog({ mode: "edit", template: t })}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        {t.is_active ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setActive(t, false)}
                            title="Deaktivieren"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setActive(t, true)}
                              title="Reaktivieren"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(t)}
                              title="Löschen"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DdStreamTemplateFormDialog
        open={dialog.mode !== "closed"}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initial={dialog.mode === "edit" ? dialog.template : null}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={() => {
          setDialog({ mode: "closed" })
          void reload()
        }}
      />
    </div>
  )
}
