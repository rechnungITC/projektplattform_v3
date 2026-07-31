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
  OperativePreRead,
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

/**
 * Recompute the pre-read tiles from a (filtered) report so the headline numbers
 * match the visible tables (PROJ-141-γ4/M-5). Only called when a screen filter is
 * active; with no filter the server pre_read is kept byte-identical.
 */
function recomputePreRead(r: OperativeReport): OperativePreRead {
  return {
    ...r.pre_read,
    overdue_tasks: r.tasks_overdue.tasks.filter((t) => t.is_overdue).length,
    open_deal_breaker_findings: r.findings_by_severity.streams.reduce(
      (a, s) => a + s.sev_deal_breaker,
      0
    ),
    open_qa: r.qa_by_stream.reduce((a, q) => a + q.qa_open, 0),
    deliverables_not_approved: r.deliverables_status.deliverables.filter(
      (d) => d.status !== "approved"
    ).length,
  }
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
  // PROJ-141-γ4 (M-4): the stream list is built from ALL FOUR sections — tasks +
  // deliverables carry workstream_id, findings + Q&A carry dd_stream_id (a
  // separate id space). A stream that appears only in findings/Q&A must still be
  // selectable, and the selection must reach those sections too.
  const options = React.useMemo(() => {
    const workstreams = new Map<string, string>()
    const owners = new Set<string>()
    const phases = new Map<string, string>()
    const wsRows = [
      ...(report?.tasks_overdue.tasks ?? []),
      ...(report?.deliverables_status.deliverables ?? []),
    ]
    for (const r of wsRows) {
      if (r.workstream_id) workstreams.set(r.workstream_id, r.workstream_label ?? r.workstream_id.slice(0, 8))
      if (r.responsible_user_id) owners.add(r.responsible_user_id)
      if (r.phase_id) phases.set(r.phase_id, r.phase_name ?? r.phase_id.slice(0, 8))
    }
    // dd_stream ids from findings + Q&A (same "Workstream/Stream" filter axis).
    for (const f of report?.findings_by_severity.findings ?? []) {
      if (f.dd_stream_id) workstreams.set(f.dd_stream_id, f.stream_label ?? f.dd_stream_id.slice(0, 8))
    }
    for (const q of report?.qa_by_stream ?? []) {
      if (q.dd_stream_id) workstreams.set(q.dd_stream_id, q.stream_label ?? q.dd_stream_id.slice(0, 8))
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
    // PROJ-141-γ4 (M-4): findings carry dd_stream_id + confidentiality_level
    // (no owner/phase). Filter by stream (Workstream axis) AND classification.
    const findings = report.findings_by_severity.findings.filter(
      (f) =>
        (fWorkstream === ALL || f.dd_stream_id === fWorkstream) &&
        (fClass === ALL || f.confidentiality_level === fClass)
    )
    // Q&A is a per-stream aggregate → only the stream axis applies.
    const qa = report.qa_by_stream.filter(
      (q) => fWorkstream === ALL || q.dd_stream_id === fWorkstream
    )
    const streams =
      findings.length === report.findings_by_severity.findings.length
        ? report.findings_by_severity.streams
        : aggregateFindingStreams(findings)
    const next: OperativeReport = {
      ...report,
      tasks_overdue: { ...report.tasks_overdue, tasks },
      findings_by_severity: { findings, streams },
      qa_by_stream: qa,
      deliverables_status: { ...report.deliverables_status, deliverables },
    }
    // PROJ-141-γ4/M-5: with a filter active the pre-read tiles are recomputed
    // from the filtered rows so headline numbers match the tables. With no
    // filter the server pre_read is kept byte-identical to today.
    const anyFilter =
      fWorkstream !== ALL || fOwner !== ALL || fPhase !== ALL || fClass !== ALL
    return anyFilter ? { ...next, pre_read: recomputePreRead(next) } : next
  }, [report, matchesRow, fWorkstream, fOwner, fPhase, fClass])

  // PROJ-141-γ6 (M-6): each export button is gated by ITS OWN section's content.
  // Export/print return the full (need-to-know-filtered) report (γ5), so gating
  // is on the unfiltered report, not the screen-filtered view.
  const sectionHasRows: Record<OperativeExportSection, boolean> = {
    tasks: (report?.tasks_overdue.tasks.length ?? 0) > 0,
    findings: (report?.findings_by_severity.streams.length ?? 0) > 0,
    qa: (report?.qa_by_stream.length ?? 0) > 0,
    deliverables: (report?.deliverables_status.deliverables.length ?? 0) > 0,
  }

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
            <span className="text-xs text-muted-foreground">CSV (Gesamtreport):</span>
            {EXPORT_SECTIONS.map((e) =>
              sectionHasRows[e.section] ? (
                <Button key={e.section} asChild size="sm" variant="outline">
                  <a href={operativeReportExportUrl(projectId, e.section)} download>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {e.label}
                  </a>
                </Button>
              ) : (
                <Button key={e.section} size="sm" variant="outline" disabled>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {e.label}
                </Button>
              )
            )}
          </div>
        </div>

        {/* PROJ-141-γ5 (M-5): make the export contract honest — CSV + print
            return the full, need-to-know-filtered report, NOT the screen filters. */}
        <p className="text-xs text-muted-foreground">
          Export (CSV) und Druck enthalten den vollständigen, berechtigungsgefilterten
          Report — nicht die oben aktiven Bildschirmfilter.
        </p>

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
