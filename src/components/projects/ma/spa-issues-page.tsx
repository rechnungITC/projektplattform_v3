"use client"

import * as React from "react"
import { AlertTriangle, Download, Link2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { SpaIssueDialog } from "@/components/projects/ma/spa-issue-dialog"
import {
  importanceBadgeVariant,
  SPA_CONFIDENTIALITY_LABEL,
  SPA_ISSUE_CATEGORY_LABEL,
  SPA_ISSUE_IMPORTANCE_LABEL,
  SPA_ISSUE_STATUS_LABEL,
  SPA_OPEN_STATUSES,
  spaIssueRef,
  statusBadgeVariant,
} from "@/components/projects/ma/spa-issue-labels"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useSpaIssues } from "@/hooks/use-spa-issues"
import {
  spaIssuesExportUrl,
  transitionSpaIssueStatus,
  type SpaIssue,
  type SpaIssueCategory,
  type SpaIssueFilters,
  type SpaIssueImportance,
  type SpaIssueStatus,
} from "@/lib/ma-project/spa-issues-api"

const ALL = "__all__"

const STATUSES: SpaIssueStatus[] = [
  "open",
  "in_negotiation",
  "agreed",
  "escalated",
  "closed",
]
const CATEGORIES: SpaIssueCategory[] = [
  "warranty",
  "indemnity",
  "purchase_price",
  "liability",
  "condition",
  "other",
]
const IMPORTANCES: SpaIssueImportance[] = [
  "niedrig",
  "mittel",
  "hoch",
  "kritisch",
]

function fmtDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

// PROJ-122 — the SPA issues list (Epic J).
//
// Rows are need-to-know scoped server-side, so this page never renders an
// issue the caller may not read. The "still open" banner mirrors the SQL
// filter used by stage_gate_prereadiness so the list and the stage-gate
// pre-read can never disagree.
export function SpaIssuesPage({ projectId }: { projectId: string }) {
  const canEdit = useProjectAccess(projectId, "edit_master")

  const [status, setStatus] = React.useState<SpaIssueStatus | null>(null)
  const [category, setCategory] = React.useState<SpaIssueCategory | null>(null)
  const [importance, setImportance] = React.useState<SpaIssueImportance | null>(
    null
  )

  const filters: SpaIssueFilters = React.useMemo(
    () => ({ status, category, importance }),
    [status, category, importance]
  )

  const { issues, summary, loading, error, refresh } = useSpaIssues(
    projectId,
    filters
  )

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SpaIssue | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  // Counts come from the summary RPC (unfiltered) so the banner reflects the
  // whole project, not the current filter selection.
  const openCount = React.useMemo(
    () =>
      summary
        .filter((s) => SPA_OPEN_STATUSES.includes(s.status))
        .reduce((acc, s) => acc + Number(s.issue_count ?? 0), 0),
    [summary]
  )
  const escalatedCount = React.useMemo(
    () =>
      summary
        .filter((s) => s.status === "escalated")
        .reduce((acc, s) => acc + Number(s.issue_count ?? 0), 0),
    [summary]
  )
  const totalCount = React.useMemo(
    () => summary.reduce((acc, s) => acc + Number(s.issue_count ?? 0), 0),
    [summary]
  )

  async function handleStatusChange(issue: SpaIssue, next: SpaIssueStatus) {
    if (next === issue.status) return
    setBusyId(issue.id)
    try {
      await transitionSpaIssueStatus(projectId, issue.id, next)
      toast.success(
        `${spaIssueRef(issue)} → ${SPA_ISSUE_STATUS_LABEL[next]}`
      )
      await refresh()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Statuswechsel fehlgeschlagen."
      )
    } finally {
      setBusyId(null)
    }
  }

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(issue: SpaIssue) {
    setEditing(issue)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SPA Issues</h1>
          <p className="text-sm text-muted-foreground">
            Offene Vertrags- und Verhandlungspunkte mit Positionen beider Seiten.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={spaIssuesExportUrl(projectId, filters)} download>
              <Download className="mr-2 h-4 w-4" />
              CSV-Export
            </a>
          </Button>
          {canEdit && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Punkt anlegen
            </Button>
          )}
        </div>
      </div>

      {openCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{openCount}</strong>{" "}
            {openCount === 1 ? "Punkt ist" : "Punkte sind"} noch offen oder
            eskaliert
            {escalatedCount > 0 && <> (davon {escalatedCount} eskaliert)</>}. Vor
            dem Signing-Gate klären.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issues List</CardTitle>
          <CardDescription>
            {totalCount} {totalCount === 1 ? "Punkt" : "Punkte"} sichtbar
            {" · "}
            {summary
              .slice()
              .sort((a, b) => a.status.localeCompare(b.status))
              .map(
                (s) =>
                  `${SPA_ISSUE_STATUS_LABEL[s.status]}: ${s.issue_count}`
              )
              .join(" · ") || "keine Einträge"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={status ?? ALL}
              onValueChange={(v) =>
                setStatus(v === ALL ? null : (v as SpaIssueStatus))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SPA_ISSUE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={category ?? ALL}
              onValueChange={(v) =>
                setCategory(v === ALL ? null : (v as SpaIssueCategory))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Kategorien</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {SPA_ISSUE_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={importance ?? ALL}
              onValueChange={(v) =>
                setImportance(v === ALL ? null : (v as SpaIssueImportance))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Wichtigkeit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Wichtigkeiten</SelectItem>
                {IMPORTANCES.map((i) => (
                  <SelectItem key={i} value={i}>
                    {SPA_ISSUE_IMPORTANCE_LABEL[i]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && !error && issues.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine Verhandlungspunkte für die aktuelle Auswahl.
            </p>
          )}

          {!loading && !error && issues.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Nr.</TableHead>
                    <TableHead>Titel</TableHead>
                    <TableHead>Klausel</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Wichtigkeit</TableHead>
                    <TableHead>Frist</TableHead>
                    <TableHead>Vertraulichkeit</TableHead>
                    {canEdit && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell className="font-mono text-xs">
                        {spaIssueRef(issue)}
                      </TableCell>
                      <TableCell className="max-w-[22rem]">
                        <span className="font-medium">{issue.title}</span>
                        {(issue.linked_finding_id || issue.linked_risk_id) && (
                          <span
                            className="ml-2 inline-flex items-center text-muted-foreground"
                            title="Mit Finding/Risiko verknüpft"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {issue.clause_reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {SPA_ISSUE_CATEGORY_LABEL[issue.category]}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Select
                            value={issue.status}
                            onValueChange={(v) =>
                              handleStatusChange(issue, v as SpaIssueStatus)
                            }
                            disabled={busyId === issue.id}
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {SPA_ISSUE_STATUS_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={statusBadgeVariant(issue.status)}>
                            {SPA_ISSUE_STATUS_LABEL[issue.status]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={importanceBadgeVariant(issue.importance)}>
                          {SPA_ISSUE_IMPORTANCE_LABEL[issue.importance]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtDate(issue.due_date)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {SPA_CONFIDENTIALITY_LABEL[issue.confidentiality_level]}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(issue)}
                            aria-label={`${spaIssueRef(issue)} bearbeiten`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SpaIssueDialog
        projectId={projectId}
        issue={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={refresh}
      />
    </div>
  )
}
