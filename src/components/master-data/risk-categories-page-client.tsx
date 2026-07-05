"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { RiskCategoryFormDialog } from "@/components/master-data/risk-category-form-dialog"
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
  deleteRiskCategory,
  listRiskCategories,
} from "@/lib/risk-categories/api"
import type { RiskCategory } from "@/types/risk"

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; category: RiskCategory }

export function RiskCategoriesPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [categories, setCategories] = React.useState<RiskCategory[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await listRiskCategories())
    } catch (err) {
      toast.error("Risikokategorien konnten nicht geladen werden", {
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

  const onDelete = async (category: RiskCategory) => {
    if (
      !window.confirm(
        `Kategorie „${category.label}" wirklich löschen? Zugeordnete Risiken werden auf „keine Kategorie" gesetzt.`
      )
    ) {
      return
    }
    try {
      await deleteRiskCategory(category.id)
      toast.success("Kategorie gelöscht")
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Risikokategorien
          </h1>
          <p className="text-sm text-muted-foreground">
            Tenant-Katalog der Risiko-Kategorien. Pflichtfeld im M&amp;A-Risiko-
            Register; liefert die gruppierbare Achse fürs Reporting.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Kategorie
          </Button>
        ) : null}
      </header>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {isAdmin
            ? "Noch keine Kategorien. Der M&A-Standardsatz wird beim ersten Öffnen eines M&A-Projekts automatisch angelegt, oder lege hier eigene an."
            : "Noch keine Risikokategorien hinterlegt."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Schlüssel</TableHead>
                <TableHead>Projekttyp</TableHead>
                <TableHead className="w-20 text-center">Sortierung</TableHead>
                <TableHead className="w-24">Status</TableHead>
                {isAdmin ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.key}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.applies_to_project_type ?? "Alle"}
                  </TableCell>
                  <TableCell className="text-center">{c.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "outline" : "secondary"}>
                      {c.is_active ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Kategorie bearbeiten"
                          onClick={() =>
                            setDialog({ mode: "edit", category: c })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label="Kategorie löschen"
                          onClick={() => void onDelete(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RiskCategoryFormDialog
        open={dialog.mode !== "closed"}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initial={dialog.mode === "edit" ? dialog.category : null}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={() => {
          setDialog({ mode: "closed" })
          void reload()
        }}
      />
    </>
  )
}
