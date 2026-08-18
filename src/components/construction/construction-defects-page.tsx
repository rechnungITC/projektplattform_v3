"use client"

import { AlertTriangle, ClipboardList, Clock, Pencil, Plus, Printer } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ConstructionDefectDetailSheet } from "@/components/construction/construction-defect-detail-sheet"
import { ConstructionDefectDialog } from "@/components/construction/construction-defect-dialog"
import { ConstructionDefectNoticeDialog } from "@/components/construction/construction-defect-notice-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  buildSectionTree,
  flattenSectionTree,
  useConstructionSections,
  useProjectTrades,
} from "@/hooks/use-construction"
import {
  useConstructionDefects,
  useConstructionDefectSummary,
} from "@/hooks/use-construction-defects"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useVendors } from "@/hooks/use-vendors"
import type { ListDefectFilters } from "@/lib/construction/api"
import {
  CONSTRUCTION_DEFECT_SEVERITIES,
  CONSTRUCTION_DEFECT_SEVERITY_LABELS,
  CONSTRUCTION_DEFECT_STATUS_LABELS,
  CONSTRUCTION_DEFECT_STATUSES,
  deriveDefectFlags,
} from "@/lib/construction/defects"
import type {
  ConstructionDefect,
  ConstructionDefectSeverity,
  ConstructionDefectStatus,
} from "@/types/construction-defect"

const ALL = "__all__"

const SEVERITY_STYLES: Record<ConstructionDefectSeverity, string> = {
  gering: "bg-muted text-muted-foreground",
  erheblich: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  gravierend: "bg-red-500/15 text-red-700 dark:text-red-300",
}

function fmtDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

/**
 * PROJ-45-β — das Mängelregister eines Bauprojekts.
 *
 * Drei Dinge, die diese Fläche von den α-Flächen unterscheidet:
 *
 *  1. **Erfassen und Steuern liegen auseinander.** „Mangel erfassen" steht jedem
 *     Projektmitglied offen, auch einem Betrachter (L15) — Mängel entstehen beim
 *     Rundgang, nicht am Schreibtisch. Fristen, Statuswechsel und Abnahme liegen
 *     bei Projektleitung oder Mandanten-Administration (B-β2, strenger als das
 *     Hausrecht `edit`). Die Fläche blendet nur Bedienelemente aus; entschieden
 *     wird in den Datenbankfunktionen (D-β9).
 *  2. **Zwei getrennte Signale.** „überfällig" gilt nur, solange die Verspätung
 *     beim Ausführenden liegt; sobald fertiggemeldet ist, wartet die Prüfung und
 *     die Verspätung läge bei der Bauleitung — dafür steht „wartet auf Prüfung"
 *     (B-β6). Beides zu einem Abzeichen zu verschmelzen würde den Falschen
 *     anzeigen.
 *  3. **Filter wirken serverseitig**, damit die Liste auch bei 200+ Einträgen
 *     bedienbar bleibt; die Kopfzahlen kommen aus der ungefilterten Auswertung
 *     und beschreiben deshalb immer das ganze Projekt.
 */
export function ConstructionDefectsPage({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  // `manage_members` ist das bestehende Hausprädikat `admin | lead` — genau die
  // Regel, die auch die Funktionen prüfen (`is_tenant_admin OR
  // is_project_lead`). Bewusst NICHT `edit_master`: das schliesst den Projekt-
  // `editor` ein, den diese Slice ausschliesst.
  const canManage = useProjectAccess(projectId, "manage_members")

  const [tradeId, setTradeId] = React.useState<string | null>(null)
  const [sectionId, setSectionId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<ConstructionDefectStatus | null>(null)
  const [severity, setSeverity] = React.useState<ConstructionDefectSeverity | null>(null)
  const [overdueOnly, setOverdueOnly] = React.useState(false)

  const filters: ListDefectFilters = React.useMemo(
    () => ({
      trade_id: tradeId ?? undefined,
      section_id: sectionId ?? undefined,
      status: status ?? undefined,
      severity: severity ?? undefined,
      overdue: overdueOnly ? true : undefined,
    }),
    [tradeId, sectionId, status, severity, overdueOnly]
  )

  const hasFilter =
    tradeId !== null ||
    sectionId !== null ||
    status !== null ||
    severity !== null ||
    overdueOnly
  const { defects, loading, moduleInactive, error, refresh } = useConstructionDefects(
    projectId,
    filters
  )
  const { summary, refresh: refreshSummary } = useConstructionDefectSummary(
    projectId,
    !moduleInactive
  )
  const { trades } = useProjectTrades(moduleInactive ? null : projectId)
  const { sections } = useConstructionSections(moduleInactive ? null : projectId)
  // Lieferanten-Stammdaten sind optional: ist das Modul „Lieferanten" aus, bleibt
  // die Liste leer und die Auswahl weist darauf hin. Ein Fehler ist das nicht —
  // über das Gewerk funktioniert alles weiter.
  const { vendors } = useVendors({ status: "active" })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ConstructionDefect | null>(null)
  const [detail, setDetail] = React.useState<ConstructionDefect | null>(null)
  const [noticeOpen, setNoticeOpen] = React.useState(false)
  /** Erzwingt einen frischen Anfangszustand des Dialogs je Vorgang. */
  const [dialogKey, setDialogKey] = React.useState(0)

  const sectionOptions = React.useMemo(
    () => flattenSectionTree(buildSectionTree(sections)),
    [sections]
  )

  const reload = React.useCallback(async () => {
    await Promise.all([refresh(), refreshSummary()])
  }, [refresh, refreshSummary])

  const clearFilters = React.useCallback(() => {
    setTradeId(null)
    setSectionId(null)
    setStatus(null)
    setSeverity(null)
    setOverdueOnly(false)
  }, [])

  /**
   * AC-45β.4 verlangt, dass ein neu erfasster Mangel „ohne weiteren Schritt in
   * der Liste sichtbar" ist. Bei aktivem Filter kann er das nicht sein — wer
   * nach „Gewerk Dach" filtert und einen Elektro-Mangel erfasst, sähe nichts und
   * müsste rätseln. Die Auswahl wird deshalb zurückgesetzt und das ausdrücklich
   * gesagt, statt sie stillschweigend zu behalten oder stillschweigend zu
   * verwerfen.
   */
  const onCreated = React.useCallback(async () => {
    if (hasFilter) {
      clearFilters()
      toast.info("Filter zurückgesetzt, damit der neue Mangel sichtbar ist")
    }
    await reload()
  }, [clearFilters, hasFilter, reload])

  const openCreate = () => {
    setEditing(null)
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }
  const openEdit = (defect: ConstructionDefect) => {
    setEditing(defect)
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }

  // Nach einem Statuswechsel muss die offene Detailansicht den neuen Stand
  // zeigen; sie hält ihre Zeile selbst, also wird sie aus der frischen Liste
  // nachgezogen statt auf einen Effekt zu warten.
  const detailRow = detail
    ? (defects.find((d) => d.id === detail.id) ?? detail)
    : null

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Das Mängelmanagement gehört zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  const totals = summary?.totals

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            Mängel
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Eingetretene Sachverhalte mit Gewährleistungsgewicht — kein Backlog.
            Erfassen darf jedes Projektmitglied; Fristen und Abnahme liegen bei der
            Bauleitung.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="outline" onClick={() => setNoticeOpen(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Mängelanzeige
            </Button>
          ) : null}
          {/* L15: kein Rechte-Gate — jedes Projektmitglied erfasst. */}
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Mangel erfassen
          </Button>
        </div>
      </div>

      {totals && totals.total > 0 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{totals.total} erfasst</Badge>
          <Badge variant="outline">{totals.open} offen</Badge>
          <Badge variant="outline">{totals.in_progress} in Bearbeitung</Badge>
          {totals.awaiting_review > 0 ? (
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Clock className="mr-1 h-3 w-3" />
              {totals.awaiting_review} wartet auf Prüfung
            </Badge>
          ) : null}
          {totals.overdue > 0 ? (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {totals.overdue} überfällig
            </Badge>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mängelliste</CardTitle>
          <CardDescription>
            Die Zahlen oben beschreiben das ganze Projekt, die Liste die aktuelle
            Auswahl.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={tradeId ?? ALL}
              onValueChange={(v) => setTradeId(v === ALL ? null : v)}
            >
              <SelectTrigger className="w-[190px]" aria-label="Nach Gewerk filtern">
                <SelectValue placeholder="Gewerk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Gewerke</SelectItem>
                {trades.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.trade?.label ?? "Unbekanntes Gewerk"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sectionId ?? ALL}
              onValueChange={(v) => setSectionId(v === ALL ? null : v)}
            >
              <SelectTrigger className="w-[190px]" aria-label="Nach Bauabschnitt filtern">
                <SelectValue placeholder="Bauabschnitt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Abschnitte</SelectItem>
                {sectionOptions.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {" ".repeat(node.depth * 3)}
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status ?? ALL}
              onValueChange={(v) =>
                setStatus(v === ALL ? null : (v as ConstructionDefectStatus))
              }
            >
              <SelectTrigger className="w-[170px]" aria-label="Nach Status filtern">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Status</SelectItem>
                {CONSTRUCTION_DEFECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CONSTRUCTION_DEFECT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={severity ?? ALL}
              onValueChange={(v) =>
                setSeverity(v === ALL ? null : (v as ConstructionDefectSeverity))
              }
            >
              <SelectTrigger className="w-[170px]" aria-label="Nach Schweregrad filtern">
                <SelectValue placeholder="Schweregrad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Schweregrade</SelectItem>
                {CONSTRUCTION_DEFECT_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CONSTRUCTION_DEFECT_SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={overdueOnly ? "default" : "outline"}
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly((v) => !v)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Nur überfällig
            </Button>

            {hasFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                Auswahl zurücksetzen
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : defects.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasFilter
                ? "Kein Mangel passt zur aktuellen Auswahl."
                : "Noch kein Mangel erfasst."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Nr.</TableHead>
                    <TableHead>Mangel</TableHead>
                    <TableHead>Gewerk</TableHead>
                    <TableHead>Ort</TableHead>
                    <TableHead>Nachunternehmer</TableHead>
                    <TableHead>Schweregrad</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Frist</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defects.map((d) => {
                    const flags = deriveDefectFlags(d)
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => setDetail(d)}
                      >
                        <TableCell className="text-muted-foreground">
                          {d.defect_number}
                        </TableCell>
                        <TableCell className="max-w-[22rem]">
                          <span className="font-medium">{d.title}</span>
                          {flags.isAwaitingReview ? (
                            <span className="ml-2 whitespace-nowrap text-xs text-amber-700 dark:text-amber-300">
                              wartet auf Prüfung
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>{d.trade?.trade?.label ?? "—"}</TableCell>
                        <TableCell>{d.section?.label ?? "—"}</TableCell>
                        <TableCell>{d.vendor?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={SEVERITY_STYLES[d.severity]}>
                            {CONSTRUCTION_DEFECT_SEVERITY_LABELS[d.severity]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CONSTRUCTION_DEFECT_STATUS_LABELS[d.status]}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={
                            flags.isOverdue ? "font-medium text-destructive" : ""
                          }
                        >
                          {fmtDate(d.due_date)}
                          {flags.isOverdue ? (
                            <span className="ml-1 text-xs">überfällig</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Mangel Nr. ${d.defect_number} bearbeiten`}
                              onClick={(event) => {
                                event.stopPropagation()
                                openEdit(d)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogOpen ? (
        <ConstructionDefectDialog
          key={dialogKey}
          projectId={projectId}
          defect={editing}
          trades={trades}
          sections={sections}
          vendors={vendors}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={editing ? reload : onCreated}
        />
      ) : null}

      <ConstructionDefectDetailSheet
        projectId={projectId}
        defect={detailRow}
        canManage={canManage}
        currentUserId={user?.id ?? null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        onEdit={(d) => {
          setDetail(null)
          openEdit(d)
        }}
        onChanged={reload}
      />

      {/* Nur solange offen gemountet: der Dialog zählt über eine eigene,
          ungefilterte Abfrage, und die soll nicht bei jedem Seitenaufruf laufen. */}
      {noticeOpen ? (
        <ConstructionDefectNoticeDialog
          projectId={projectId}
          open={noticeOpen}
          trades={trades}
          vendors={vendors}
          onOpenChange={setNoticeOpen}
        />
      ) : null}
    </div>
  )
}
