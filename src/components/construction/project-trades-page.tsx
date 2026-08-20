"use client"

import { HardHat, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { useConstructionTradeCatalog, useProjectTrades } from "@/hooks/use-construction"
import { useConstructionAcceptanceSummary } from "@/hooks/use-construction-acceptances"
import { useConstructionDefectSummary } from "@/hooks/use-construction-defects"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  assignProjectTrade,
  removeProjectTrade,
  updateProjectTrade,
} from "@/lib/construction/api"
import {
  CONSTRUCTION_RAG_LABELS,
  CONSTRUCTION_RAG_STATUSES,
  type ConstructionRagStatus,
} from "@/types/construction"

const RAG_STYLES: Record<ConstructionRagStatus, string> = {
  gruen: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  gelb: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rot: "bg-red-500/15 text-red-700 dark:text-red-300",
}

/**
 * PROJ-45-α — the trades assigned to one construction project.
 *
 * The traffic light is set by hand and never derived (lock L8): a computed
 * colour would take away the site manager's ability to contradict the numbers,
 * which is precisely the judgement this field exists to record.
 */
export function ProjectTradesPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { trades, loading, moduleInactive, error, refresh } = useProjectTrades(projectId)
  const { catalog } = useConstructionTradeCatalog(!moduleInactive)
  // PROJ-45-β — Mängel je Gewerk. Aus derselben SECURITY-INVOKER-Auswertung wie
  // die Kopfzahlen der Mängel-Fläche, also unter der RLS des Aufrufers gerechnet
  // (AC-45βH-1). Bleibt sie leer, zeigt die Karte schlicht keine Zeile — der
  // α-Stand dieser Fläche ist damit unverändert.
  const { summary: defectSummary } = useConstructionDefectSummary(
    projectId,
    !moduleInactive
  )
  // PROJ-45-γ — Abnahmestand je Gewerk. Aus derselben SECURITY-INVOKER-
  // Auswertung wie die Kopfzahlen der Abnahme-Fläche, also unter der RLS des
  // Aufrufers gerechnet: die Zahl hier kann nie mehr behaupten als die Liste
  // dort zeigt. Der Abnahmestand steht neben den Mängeln, weil beide dieselbe
  // Frage beantworten — „wie weit ist dieses Gewerk?".
  const { summary: acceptanceSummary } = useConstructionAcceptanceSummary(projectId)

  const acceptancesByTrade = React.useMemo(
    () =>
      new Map(
        (acceptanceSummary?.by_trade ?? []).map((row) => [row.trade_id, row])
      ),
    [acceptanceSummary]
  )

  const defectsByTrade = React.useMemo(
    () =>
      new Map(
        (defectSummary?.by_trade ?? []).map((row) => [row.project_trade_id, row])
      ),
    [defectSummary]
  )
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const assignedIds = React.useMemo(
    () => new Set(trades.map((t) => t.trade_id)),
    [trades]
  )
  const assignable = catalog.filter((c) => c.is_active && !assignedIds.has(c.id))

  const onAssign = async (tradeId: string) => {
    setAdding(true)
    try {
      await assignProjectTrade(projectId, { trade_id: tradeId })
      toast.success("Gewerk zugeordnet")
      await refresh()
    } catch (err) {
      toast.error("Zuordnung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setAdding(false)
    }
  }

  const patch = async (
    id: string,
    payload: Parameters<typeof updateProjectTrade>[2],
    successMessage?: string
  ) => {
    setBusyId(id)
    try {
      await updateProjectTrade(projectId, id, payload)
      if (successMessage) toast.success(successMessage)
      await refresh()
    } catch (err) {
      toast.error("Änderung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusyId(null)
    }
  }

  const onRemove = async (id: string, label: string) => {
    if (
      !window.confirm(
        `Gewerk „${label}" aus dem Projekt entfernen? Arbeitspakete und Risiken bleiben erhalten und verlieren nur den Bezug.`
      )
    ) {
      return
    }
    setBusyId(id)
    try {
      await removeProjectTrade(projectId, id)
      toast.success("Gewerk entfernt")
      await refresh()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusyId(null)
    }
  }

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Gewerke gehören zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <HardHat className="h-5 w-5 text-muted-foreground" />
            Gewerke
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Wer ausführt. Die Ampel setzt die Bauleitung selbst — sie wird nicht
            aus Zahlen abgeleitet.
          </p>
        </div>
        {canEdit && assignable.length > 0 ? (
          <div className="w-64">
            <Select disabled={adding} onValueChange={onAssign}>
              <SelectTrigger aria-label="Gewerk zuordnen">
                <SelectValue placeholder="Gewerk zuordnen …" />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : trades.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10">
            <p className="font-medium">Noch keine Gewerke im Projekt</p>
            <p className="max-w-xl text-sm text-muted-foreground">
              {canEdit
                ? assignable.length > 0
                  ? "Wähle oben die Gewerke aus, die in diesem Projekt vorkommen."
                  : "Der Gewerke-Katalog des Arbeitsbereichs ist noch leer. Eine Administratorin legt ihn unter Stammdaten → Gewerke an."
                : "Die Projektleitung ordnet die Gewerke zu."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trades.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    {t.trade?.label ?? "Unbekanntes Gewerk"}
                  </CardTitle>
                  {t.trade && !t.trade.is_active ? (
                    <Badge variant="outline" className="text-xs">
                      nicht mehr im Katalog geführt
                    </Badge>
                  ) : null}
                </div>
                <Badge className={RAG_STYLES[t.rag_status]}>
                  {CONSTRUCTION_RAG_LABELS[t.rag_status]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const counts = defectsByTrade.get(t.id)
                  if (!counts || Number(counts.total) === 0) return null
                  const overdue = Number(counts.overdue)
                  const awaiting = Number(counts.awaiting_review)
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">{counts.total} Mängel</Badge>
                      {overdue > 0 ? (
                        <Badge variant="destructive">{overdue} überfällig</Badge>
                      ) : null}
                      {awaiting > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          {awaiting} wartet auf Prüfung
                        </Badge>
                      ) : null}
                    </div>
                  )
                })()}

                {(() => {
                  // PROJ-45-γ — Abnahmestand. Eigener Block statt derselben
                  // Zeile: ein Gewerk kann abgenommen sein UND Mängel tragen
                  // (Abnahme unter Vorbehalt), beides in eine Zeile zu mischen
                  // läse sich als Widerspruch.
                  const acc = acceptancesByTrade.get(t.id)
                  if (!acc || Number(acc.total) === 0) return null
                  const scheduled = Number(acc.scheduled)
                  const accepted = Number(acc.accepted)
                  const refused = Number(acc.refused)
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {accepted > 0 ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          {accepted === 1 ? "abgenommen" : `${accepted}× abgenommen`}
                        </Badge>
                      ) : null}
                      {scheduled > 0 ? (
                        <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300">
                          {scheduled} Abnahme angesetzt
                        </Badge>
                      ) : null}
                      {refused > 0 ? (
                        <Badge variant="destructive">{refused}× verweigert</Badge>
                      ) : null}
                      {acc.warranty_end_date ? (
                        <span className="text-muted-foreground">
                          Gewährleistung bis{" "}
                          {new Date(acc.warranty_end_date).toLocaleDateString("de-DE")}
                        </span>
                      ) : null}
                    </div>
                  )
                })()}

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Verantwortlich
                  </span>
                  <ResponsibleUserPicker
                    tenantId={currentTenant?.id ?? ""}
                    value={t.responsible_user_id ?? undefined}
                    placeholder="Niemand zugewiesen"
                    ariaLabel={`Verantwortlich für ${t.trade?.label ?? "Gewerk"}`}
                    disabled={!canEdit || busyId === t.id || !currentTenant}
                    onChange={(userId) =>
                      patch(
                        t.id,
                        { responsible_user_id: userId.length > 0 ? userId : null },
                        "Verantwortung gespeichert"
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Ampel</span>
                  <Select
                    value={t.rag_status}
                    disabled={!canEdit || busyId === t.id}
                    onValueChange={(value) =>
                      patch(t.id, { rag_status: value as ConstructionRagStatus })
                    }
                  >
                    <SelectTrigger aria-label={`Ampel für ${t.trade?.label ?? "Gewerk"}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONSTRUCTION_RAG_STATUSES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {CONSTRUCTION_RAG_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Notiz</span>
                  <Textarea
                    defaultValue={t.notes ?? ""}
                    rows={2}
                    maxLength={2000}
                    disabled={!canEdit || busyId === t.id}
                    placeholder="z. B. Nachunternehmer bestätigt, Start KW 34"
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (next !== (t.notes ?? "")) {
                        void patch(t.id, { notes: next.length > 0 ? next : null })
                      }
                    }}
                  />
                </div>

                {canEdit ? (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === t.id}
                      onClick={() => onRemove(t.id, t.trade?.label ?? "Gewerk")}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Entfernen
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canEdit && trades.length > 0 && assignable.length === 0 && catalog.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Plus className="mr-1 inline h-3 w-3" />
          Alle aktiven Gewerke des Katalogs sind bereits zugeordnet.
        </p>
      ) : null}
    </div>
  )
}
