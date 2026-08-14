"use client"

import { HardHat, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ConstructionTradeFormDialog } from "@/components/master-data/construction-trade-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  ConstructionApiError,
  deleteConstructionTrade,
  listConstructionTrades,
  seedConstructionTrades,
  updateConstructionTrade,
} from "@/lib/construction/api"
import type { ConstructionTrade } from "@/types/construction"

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; trade: ConstructionTrade }

/**
 * PROJ-45-α — tenant-wide trade catalog (Gewerke).
 *
 * Two behaviours carry the product decisions and are worth spelling out:
 *
 *  * A trade is NEVER copied into a project — projects reference this row, so
 *    renaming here reaches every project (lock L7). The UI says so, because a
 *    rename that silently rewrites history elsewhere would otherwise surprise.
 *  * A trade that is in use cannot be deleted. The server answers 409 and names
 *    the blocking projects; we surface that message verbatim instead of a
 *    generic failure, and point at deactivating as the supported path.
 */
export function ConstructionTradesPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [trades, setTrades] = React.useState<ConstructionTrade[]>([])
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      const rows = await listConstructionTrades()
      setTrades(rows)
      setModuleInactive(false)
    } catch (err) {
      // The route answers 404 with read intent when the module is off — that is
      // "not switched on", not a fault and not an empty catalog (PROJ-Y-143f).
      if (err instanceof ConstructionApiError && err.status === 404) {
        setModuleInactive(true)
      } else {
        toast.error("Gewerke konnten nicht geladen werden", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    } finally {
      setHasLoaded(true)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  const onSeed = async () => {
    try {
      const seeded = await seedConstructionTrades()
      if (seeded === 0) {
        toast.info("Der Katalog ist nicht mehr leer — es wurde nichts ergänzt.")
      } else {
        toast.success(`${seeded} Standard-Gewerke angelegt`)
      }
      await reload()
    } catch (err) {
      toast.error("Standardliste konnte nicht angelegt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  const onToggleActive = async (trade: ConstructionTrade) => {
    setBusyId(trade.id)
    try {
      await updateConstructionTrade(trade.id, { is_active: !trade.is_active })
      toast.success(trade.is_active ? "Gewerk deaktiviert" : "Gewerk aktiviert")
      await reload()
    } catch (err) {
      toast.error("Änderung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (trade: ConstructionTrade) => {
    if (
      !window.confirm(
        `Gewerk „${trade.label}" wirklich löschen? Das geht nur, solange es keinem Projekt zugeordnet ist.`
      )
    ) {
      return
    }
    setBusyId(trade.id)
    try {
      await deleteConstructionTrade(trade.id)
      toast.success("Gewerk gelöscht")
      await reload()
    } catch (err) {
      // 409 carries the actionable message (which projects block it).
      if (err instanceof ConstructionApiError && err.status === 409) {
        toast.error("Gewerk ist noch in Verwendung", { description: err.message })
      } else {
        toast.error("Löschen fehlgeschlagen", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    } finally {
      setBusyId(null)
    }
  }

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Der Gewerke-Katalog gehört zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HardHat className="h-6 w-6 text-muted-foreground" />
            Gewerke
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Der Katalog gilt für den ganzen Arbeitsbereich. Bauprojekte wählen daraus
            aus und <strong>verweisen</strong> auf den Eintrag — eine Umbenennung wirkt
            deshalb überall. Ein Gewerk, das noch zugeordnet ist, lässt sich nicht
            löschen; deaktivieren nimmt es nur aus der Auswahl neuer Zuordnungen.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" />
            Gewerk anlegen
          </Button>
        ) : null}
      </div>

      {!hasLoaded ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : trades.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-10">
            <div className="space-y-1">
              <p className="font-medium">Noch keine Gewerke im Katalog</p>
              <p className="max-w-xl text-sm text-muted-foreground">
                {isAdmin
                  ? "Du kannst mit einer Standardliste nach VOB/C starten (Rohbau, Elektro, Sanitär …) und sie anschließend umbenennen, ergänzen oder deaktivieren."
                  : "Eine Administratorin legt den Katalog an, danach lässt er sich in Bauprojekten auswählen."}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={onSeed}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Standardliste anlegen
                </Button>
                <Button variant="outline" onClick={() => setDialog({ mode: "create" })}>
                  <Plus className="mr-2 h-4 w-4" />
                  Einzeln anlegen
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bezeichnung</TableHead>
              <TableHead>Kennung</TableHead>
              <TableHead className="w-24">Reihenfolge</TableHead>
              <TableHead className="w-28">Status</TableHead>
              {isAdmin ? <TableHead className="w-40 text-right">Aktionen</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => (
              <TableRow key={trade.id} className={trade.is_active ? undefined : "opacity-60"}>
                <TableCell className="font-medium">{trade.label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {trade.key}
                </TableCell>
                <TableCell className="tabular-nums">{trade.sort_order}</TableCell>
                <TableCell>
                  <Badge variant={trade.is_active ? "secondary" : "outline"}>
                    {trade.is_active ? "aktiv" : "inaktiv"}
                  </Badge>
                </TableCell>
                {isAdmin ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === trade.id}
                        onClick={() => onToggleActive(trade)}
                      >
                        {trade.is_active ? "Deaktivieren" : "Aktivieren"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${trade.label} bearbeiten`}
                        onClick={() => setDialog({ mode: "edit", trade })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${trade.label} löschen`}
                        disabled={busyId === trade.id}
                        onClick={() => onDelete(trade)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConstructionTradeFormDialog
        open={dialog.mode !== "closed"}
        trade={dialog.mode === "edit" ? dialog.trade : null}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" })
        }}
        onSaved={reload}
      />
    </div>
  )
}
