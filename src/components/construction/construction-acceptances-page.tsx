"use client"

import { CalendarCheck, Pencil, Plus, RotateCcw, ShieldCheck } from "lucide-react"
import * as React from "react"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ConstructionAcceptanceDetailSheet } from "@/components/construction/construction-acceptance-detail-sheet"
import { ConstructionAcceptanceDialog } from "@/components/construction/construction-acceptance-dialog"
import {
  ACCEPTANCE_OPEN_DEFECT_STATUSES,
  ConstructionAcceptanceRecordDialog,
} from "@/components/construction/construction-acceptance-record-dialog"
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
import {
  useConstructionAcceptances,
  useConstructionAcceptanceSummary,
} from "@/hooks/use-construction-acceptances"
import {
  buildSectionTree,
  flattenSectionTree,
  useConstructionSections,
  useProjectTrades,
} from "@/hooks/use-construction"
import { useConstructionDefects } from "@/hooks/use-construction-defects"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useVendors } from "@/hooks/use-vendors"
import { listStakeholders } from "@/lib/stakeholders/api"
import type { AcceptanceFilters } from "@/lib/construction/api"
import {
  CONSTRUCTION_ACCEPTANCE_STATUS_LABELS,
  CONSTRUCTION_ACCEPTANCE_STATUSES,
  acceptanceSubjectKind,
  isAcceptanceOpen,
  type ConstructionAcceptance,
  type ConstructionAcceptanceStatus,
} from "@/types/construction-acceptance"

const ALL = "__all__"

const STATUS_STYLES: Record<ConstructionAcceptanceStatus, string> = {
  angesetzt: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  abgenommen: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  abgenommen_unter_vorbehalt: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  verweigert: "bg-red-500/15 text-red-700 dark:text-red-300",
  abgesagt: "bg-muted text-muted-foreground",
}

function fmt(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

function subjectLabel(a: ConstructionAcceptance): string {
  const kind = acceptanceSubjectKind(a)
  if (kind === "gewerk") return a.trade?.trade?.label ?? "Gewerk"
  if (kind === "abschnitt") return a.section?.label ?? "Abschnitt"
  return "Gesamtes Projekt"
}

/**
 * PROJ-45-γ — das Abnahmeregister eines Bauprojekts.
 *
 * Drei Dinge unterscheiden diese Fläche von der Mängel-Fläche aus β:
 *
 *  1. **Kein Betrachter-Zugang zum Anlegen.** Beim Mangel darf jedes
 *     Projektmitglied erfassen (β-Lock L15) — die Abnahme ist eine
 *     rechtsverbindliche Erklärung und bleibt bei Projektleitung/Bauleitung oder
 *     Mandanten-Administration (L22). Das ist eine bewusste Verschärfung, nicht
 *     eine Lockerung, und die Fläche fragt dafür dasselbe Hausprädikat
 *     (`manage_members` = `admin | lead`), das die Datenbankfunktionen prüfen.
 *  2. **Drei Bezugsarten, eine davon ohne Anker.** „Gesamtes Projekt" ist eine
 *     eigene, benannte Wahl — nicht „nichts ausgewählt".
 *  3. **Nach dem Ergebnis ist Schluss.** Zeilenaktionen verschwinden mit dem
 *     Protokoll; nur der Beleg lässt sich in der Detailansicht nachtragen. Nach
 *     einer Verweigerung wird stattdessen eine **Nachabnahme** angeboten, die
 *     auf die alte verweist.
 */
export function ConstructionAcceptancesPage({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")

  const [status, setStatus] = React.useState<ConstructionAcceptanceStatus | null>(null)
  const [subject, setSubject] = React.useState<AcceptanceFilters["subject"] | null>(null)
  const [tradeId, setTradeId] = React.useState<string | null>(null)

  const filters: AcceptanceFilters = React.useMemo(
    () => ({
      status: status ?? undefined,
      subject: subject ?? undefined,
      trade_id: tradeId ?? undefined,
    }),
    [status, subject, tradeId]
  )

  const { acceptances, loading, moduleInactive, error, refresh } =
    useConstructionAcceptances(projectId, filters)
  const { summary, refresh: refreshSummary } =
    useConstructionAcceptanceSummary(projectId)
  const { trades } = useProjectTrades(projectId)
  const { sections } = useConstructionSections(projectId)
  const { vendors } = useVendors()
  // Offene Mängel des Projekts. Der Bezug wird beim Protokollieren gefiltert —
  // hier wird bewusst EINMAL geladen statt je Abnahme neu, weil die Maske nur
  // eine Teilmenge braucht und die Liste ohnehin schon im Register steckt.
  const { defects } = useConstructionDefects(projectId)

  const [stakeholders, setStakeholders] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await listStakeholders(projectId)
        if (!cancelled) setStakeholders(rows.map((s) => ({ id: s.id, name: s.name })))
      } catch {
        // Teilnehmer sind auch als Freitext erfassbar — ein Fehlschlag hier
        // darf das Protokollieren nicht blockieren.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const flatSections = React.useMemo(
    () =>
      flattenSectionTree(buildSectionTree(sections)).map((s) => ({
        id: s.id,
        label: s.label,
        depth: s.depth,
      })),
    [sections]
  )

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ConstructionAcceptance | null>(null)
  const [supersedes, setSupersedes] = React.useState<ConstructionAcceptance | null>(null)
  const [recording, setRecording] = React.useState<ConstructionAcceptance | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    void refresh()
    void refreshSummary()
  }, [refresh, refreshSummary])

  /** Offene Mängel, die zum Bezug DIESER Abnahme gehören. */
  const openDefectsFor = React.useCallback(
    (a: ConstructionAcceptance) => {
      const open = defects.filter((d) =>
        (ACCEPTANCE_OPEN_DEFECT_STATUSES as readonly string[]).includes(d.status)
      )
      const kind = acceptanceSubjectKind(a)
      if (kind === "gewerk") return open.filter((d) => d.trade_id === a.trade_id)
      if (kind === "abschnitt") {
        // Der Teilbaum wird hier NICHT nachgebaut: die Datenbank prüft ihn
        // ohnehin, und ein zweiter Baumlauf im Browser wäre eine zweite
        // Wahrheit. Die Maske schlägt den direkten Abschnitt vor; alles
        // Weitere lässt sich als neuer Vorbehalt erfassen.
        return open.filter((d) => d.section_id === a.section_id)
      }
      return open
    },
    [defects]
  )

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Abnahmen gehören zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Abnahmen</h1>
          <p className="text-sm text-muted-foreground">
            Termin, Ergebnis, Vorbehalte und Gewährleistungsfrist je Gewerk,
            Bauabschnitt oder für das ganze Projekt.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null)
              setSupersedes(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Termin ansetzen
          </Button>
        )}
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["Angesetzt", summary.scheduled],
              ["Abgenommen", summary.accepted],
              ["Unter Vorbehalt", summary.accepted_with_reservation],
              ["Verweigert", summary.refused],
              ["Abgesagt", summary.cancelled],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Select
                value={status ?? ALL}
                onValueChange={(v) =>
                  setStatus(v === ALL ? null : (v as ConstructionAcceptanceStatus))
                }
              >
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Status</SelectItem>
                  {CONSTRUCTION_ACCEPTANCE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CONSTRUCTION_ACCEPTANCE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select
                value={subject ?? ALL}
                onValueChange={(v) =>
                  setSubject(v === ALL ? null : (v as AcceptanceFilters["subject"]))
                }
              >
                <SelectTrigger aria-label="Bezug">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Jeder Bezug</SelectItem>
                  <SelectItem value="gewerk">Gewerk</SelectItem>
                  <SelectItem value="abschnitt">Bauabschnitt</SelectItem>
                  <SelectItem value="gesamt">Gesamtes Projekt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-52">
              <Select
                value={tradeId ?? ALL}
                onValueChange={(v) => setTradeId(v === ALL ? null : v)}
              >
                <SelectTrigger aria-label="Gewerk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Gewerke</SelectItem>
                  {trades.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.trade?.label ?? "Gewerk"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : acceptances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Für diese Auswahl ist keine Abnahme erfasst.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Nr.</TableHead>
                  <TableHead>Bezug</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Termin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gewährleistung bis</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptances.map((a) => {
                  const open = isAcceptanceOpen(a.status)
                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(a.id)}
                    >
                      <TableCell className="font-mono text-xs">
                        {a.acceptance_number}
                      </TableCell>
                      <TableCell>
                        {subjectLabel(a)}
                        {a.supersedes_acceptance_id && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Nachabnahme
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate">
                        {a.title ?? "—"}
                      </TableCell>
                      <TableCell>{fmt(a.scheduled_for)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[a.status]} variant="secondary">
                          {CONSTRUCTION_ACCEPTANCE_STATUS_LABELS[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmt(a.warranty_end_date)}</TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canManage && open && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Termin ändern"
                              onClick={() => {
                                setEditing(a)
                                setSupersedes(null)
                                setDialogOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRecording(a)}
                            >
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Protokollieren
                            </Button>
                          </div>
                        )}
                        {canManage && a.status === "verweigert" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(null)
                              setSupersedes(a)
                              setDialogOpen(true)
                            }}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Nachabnahme
                          </Button>
                        )}
                        {!canManage && (
                          <span className="text-xs text-muted-foreground">
                            <CalendarCheck className="inline h-3 w-3" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <ConstructionAcceptanceDialog
          // Frisch montieren, damit die Maske nie den Zustand einer anderen
          // Abnahme trägt — ein Rücksetzen im Effekt wäre Hausregel-verboten.
          key={editing?.id ?? supersedes?.id ?? "new"}
          projectId={projectId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          acceptance={editing}
          supersedes={supersedes}
          trades={trades}
          sections={flatSections}
          onSaved={reload}
        />
      )}

      {recording && (
        <ConstructionAcceptanceRecordDialog
          key={recording.id}
          projectId={projectId}
          acceptance={recording}
          open={recording !== null}
          onOpenChange={(v) => !v && setRecording(null)}
          openDefects={openDefectsFor(recording)}
          trades={trades}
          stakeholders={stakeholders}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          onRecorded={reload}
        />
      )}

      <ConstructionAcceptanceDetailSheet
        key={detailId ?? "none"}
        projectId={projectId}
        acceptanceId={detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        canManage={canManage}
        onChanged={reload}
      />
    </div>
  )
}
