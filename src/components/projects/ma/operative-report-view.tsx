"use client"

import { Download, Loader2, Printer } from "lucide-react"
import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useOperativeReport } from "@/hooks/use-operative-report"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { operativeReportExportUrl } from "@/lib/ma-project/operative-report-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type {
  OperativeExportSection,
  OperativeFindingRow,
  OperativeFindingStreamAgg,
  OperativeReport,
} from "@/types/operative-report"

import { OperativeReportBody, LEVEL_LABEL } from "./operative-report-body"

const ALL = "all"
const NO_OWNER = "__no_owner__"
const CONF_LEVELS: MaConfidentialityLevel[] = ["standard", "confidential", "strict"]

/** Re-aggregate the per-stream severity table from (classification-)filtered findings. */
function aggregateFindingStreams(
  findings: OperativeFindingRow[]
): OperativeFindingStreamAgg[] {
  const map = new Map<string, OperativeFindingStreamAgg>()
  for (const f of findings) {
    const cur =
      map.get(f.dd_stream_id) ??
      {
        dd_stream_id: f.dd_stream_id,
        stream_label: f.stream_label,
        open_total: 0,
        sev_niedrig: 0,
        sev_mittel: 0,
        sev_hoch: 0,
        sev_deal_breaker: 0,
        eur_sum: 0,
        null_eur_count: 0,
      }
    cur.open_total += 1
    if (f.severity === "niedrig") cur.sev_niedrig += 1
    else if (f.severity === "mittel") cur.sev_mittel += 1
    else if (f.severity === "hoch") cur.sev_hoch += 1
    else if (f.severity === "deal_breaker") cur.sev_deal_breaker += 1
    if (f.economic_impact_eur === null) cur.null_eur_count += 1
    else cur.eur_sum += Number(f.economic_impact_eur)
    map.set(f.dd_stream_id, cur)
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.sev_deal_breaker - a.sev_deal_breaker ||
      b.sev_hoch - a.sev_hoch ||
      (a.stream_label ?? "").localeCompare(b.stream_label ?? "")
  )
}

const EXPORT_SECTIONS: { section: OperativeExportSection; label: string }[] = [
  { section: "tasks", label: "Aufgaben" },
  { section: "findings", label: "Findings" },
  { section: "qa", label: "Q&A" },
  { section: "deliverables", label: "Deliverables" },
]

export function OperativeReportView({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { report, loading, error, refresh } = useOperativeReport(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const [fWorkstream, setFWorkstream] = React.useState(ALL)
  const [fOwner, setFOwner] = React.useState(ALL)
  const [fPhase, setFPhase] = React.useState(ALL)
  const [fClass, setFClass] = React.useState(ALL)

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const member of members) {
      m.set(member.user_id, member.display_name ?? member.email.split("@")[0] ?? "—")
    }
    return m
  }, [members])

  // Filter options derived from the (need-to-know-filtered) report rows.
  const options = React.useMemo(() => {
    const workstreams = new Map<string, string>()
    const owners = new Set<string>()
    const phases = new Map<string, string>()
    const rows = [
      ...(report?.tasks_overdue.tasks ?? []),
      ...(report?.deliverables_status.deliverables ?? []),
    ]
    for (const r of rows) {
      if (r.workstream_id) workstreams.set(r.workstream_id, r.workstream_label ?? r.workstream_id.slice(0, 8))
      if (r.responsible_user_id) owners.add(r.responsible_user_id)
      if (r.phase_id) phases.set(r.phase_id, r.phase_name ?? r.phase_id.slice(0, 8))
    }
    return {
      workstreams: Array.from(workstreams, ([id, label]) => ({ id, label })),
      owners: Array.from(owners, (id) => ({ id, label: userName.get(id) ?? "—" })),
      phases: Array.from(phases, ([id, label]) => ({ id, label })),
    }
  }, [report, userName])

  // Apply the shared filter to a task/deliverable row (all four dimensions).
  const matchesRow = React.useCallback(
    (r: {
      workstream_id: string | null
      responsible_user_id: string | null
      phase_id: string | null
      confidentiality_level: MaConfidentialityLevel
    }) => {
      if (fWorkstream !== ALL && r.workstream_id !== fWorkstream) return false
      if (fOwner !== ALL) {
        if (fOwner === NO_OWNER) {
          if (r.responsible_user_id) return false
        } else if (r.responsible_user_id !== fOwner) return false
      }
      if (fPhase !== ALL && r.phase_id !== fPhase) return false
      if (fClass !== ALL && r.confidentiality_level !== fClass) return false
      return true
    },
    [fWorkstream, fOwner, fPhase, fClass]
  )

  const filteredReport = React.useMemo<OperativeReport | null>(() => {
    if (!report) return null
    const tasks = report.tasks_overdue.tasks.filter(matchesRow)
    const deliverables = report.deliverables_status.deliverables.filter(matchesRow)
    // Findings only carry a classification (no workstream/owner/phase) → the
    // classification filter re-aggregates them; the other filters don't apply.
    const findings =
      fClass === ALL
        ? report.findings_by_severity.findings
        : report.findings_by_severity.findings.filter((f) => f.confidentiality_level === fClass)
    return {
      ...report,
      tasks_overdue: { ...report.tasks_overdue, tasks },
      findings_by_severity: {
        findings,
        streams:
          fClass === ALL
            ? report.findings_by_severity.streams
            : aggregateFindingStreams(findings),
      },
      deliverables_status: { ...report.deliverables_status, deliverables },
      // qa_by_stream is a stream-level aggregate with no per-row classification → shown as-is.
    }
  }, [report, matchesRow, fClass])

  const hasRows = (report?.tasks_overdue.tasks.length ?? 0) > 0

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-base">Operatives Reporting</CardTitle>
          <CardDescription>
            Wöchentliche Steuerung: überfällige Aufgaben, offene Findings nach Schwere,
            Q&amp;A-Stand und Deliverable-Status. Beschränkt auf Ihren Berechtigungskontext.
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/projects/${projectId}/operative-report/print`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Printer className="mr-2 h-4 w-4" aria-hidden /> Drucken / PDF
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filter bar — AC: Workstream / Owner / Phase / Klassifikation */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fWorkstream} onValueChange={setFWorkstream}>
            <SelectTrigger className="w-[180px]" aria-label="Workstream">
              <SelectValue placeholder="Workstream" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Workstreams</SelectItem>
              {options.workstreams.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fOwner} onValueChange={setFOwner}>
            <SelectTrigger className="w-[190px]" aria-label="Verantwortlich">
              <SelectValue placeholder="Verantwortlich" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Verantwortlichen</SelectItem>
              <SelectItem value={NO_OWNER}>Ohne Verantwortlichen</SelectItem>
              {options.owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fPhase} onValueChange={setFPhase}>
            <SelectTrigger className="w-[170px]" aria-label="Phase">
              <SelectValue placeholder="Phase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Phasen</SelectItem>
              {options.phases.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fClass} onValueChange={setFClass}>
            <SelectTrigger className="w-[170px]" aria-label="Klassifikation">
              <SelectValue placeholder="Klassifikation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Stufen</SelectItem>
              {CONF_LEVELS.map((c) => (
                <SelectItem key={c} value={c}>{LEVEL_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">CSV:</span>
            {EXPORT_SECTIONS.map((e) => (
              <Button
                key={e.section}
                asChild
                size="sm"
                variant="outline"
                disabled={!hasRows}
              >
                <a href={operativeReportExportUrl(projectId, e.section)} download>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {e.label}
                </a>
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Lade operatives Reporting …
          </div>
        ) : error ? (
          <div className="space-y-3 py-6">
            <p className="text-sm text-destructive">
              Reporting konnte nicht geladen werden: {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              Erneut versuchen
            </Button>
          </div>
        ) : filteredReport ? (
          <OperativeReportBody report={filteredReport} userName={userName} />
        ) : null}
      </CardContent>
    </Card>
  )
}
