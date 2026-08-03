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
import {
  operativeReportExportUrl,
  operativeReportPrintUrl,
} from "@/lib/ma-project/operative-report-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type {
  OperativeExportSection,
  OperativeReportFilters,
} from "@/types/operative-report"

import { OperativeReportBody, LEVEL_LABEL } from "./operative-report-body"

const ALL = "all"
const NO_OWNER = "__no_owner__"
const CONF_LEVELS: MaConfidentialityLevel[] = ["standard", "confidential", "strict"]

const EXPORT_SECTIONS: { section: OperativeExportSection; label: string }[] = [
  { section: "tasks", label: "Aufgaben" },
  { section: "findings", label: "Findings" },
  { section: "qa", label: "Q&A" },
  { section: "deliverables", label: "Deliverables" },
]

export function OperativeReportView({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { members } = useTenantMembers(currentTenant?.id)

  const [fWorkstream, setFWorkstream] = React.useState(ALL)
  const [fOwner, setFOwner] = React.useState(ALL)
  const [fPhase, setFPhase] = React.useState(ALL)
  const [fClass, setFClass] = React.useState(ALL)

  // Filters → typed shape for the hook + URL builders.
  // NO_OWNER is a UI-only sentinel; server-side it does not map to any RPC arg
  // (no "unassigned owner" filter — Deviation D-γ6 documented in spec).
  const filters = React.useMemo<OperativeReportFilters>(() => ({
    workstream_id: fWorkstream === ALL ? null : fWorkstream,
    owner_id: fOwner === ALL || fOwner === NO_OWNER ? null : fOwner,
    phase_id: fPhase === ALL ? null : fPhase,
    classification:
      fClass === ALL
        ? null
        : (fClass as OperativeReportFilters["classification"]),
  }), [fWorkstream, fOwner, fPhase, fClass])

  const { report, loading, error, refresh } = useOperativeReport(
    projectId,
    filters
  )

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const member of members) {
      m.set(member.user_id, member.display_name ?? member.email.split("@")[0] ?? "—")
    }
    return m
  }, [members])

  // Dropdown options come from the (need-to-know-filtered) RPC report, not
  // client-computed — the filter axes for workstream/owner/phase are structural
  // (tasks + deliverables only), so we derive the options from those two
  // sections. Findings/Q&A workstream labels live under dd_streams — a separate
  // catalog with no FK linkage to workstreams (see Tech Design D-γ4).
  const options = React.useMemo(() => {
    const workstreams = new Map<string, string>()
    const owners = new Set<string>()
    const phases = new Map<string, string>()
    const rows = [
      ...(report?.tasks_overdue.tasks ?? []),
      ...(report?.deliverables_status.deliverables ?? []),
    ]
    for (const r of rows) {
      if (r.workstream_id)
        workstreams.set(
          r.workstream_id,
          r.workstream_label ?? r.workstream_id.slice(0, 8)
        )
      if (r.responsible_user_id) owners.add(r.responsible_user_id)
      if (r.phase_id)
        phases.set(r.phase_id, r.phase_name ?? r.phase_id.slice(0, 8))
    }
    return {
      workstreams: Array.from(workstreams, ([id, label]) => ({ id, label })),
      owners: Array.from(owners, (id) => ({ id, label: userName.get(id) ?? "—" })),
      phases: Array.from(phases, ([id, label]) => ({ id, label })),
    }
  }, [report, userName])

  // Special-case: if the FE user selects NO_OWNER, we filter client-side to
  // "responsible_user_id === null" over the already server-filtered rows.
  // This is the only remaining client-side filter (semantic parity — there's
  // no server RPC arg for "unassigned owner").
  const displayReport = React.useMemo(() => {
    if (!report) return null
    if (fOwner !== NO_OWNER) return report
    return {
      ...report,
      tasks_overdue: {
        ...report.tasks_overdue,
        tasks: report.tasks_overdue.tasks.filter(
          (t) => t.responsible_user_id === null
        ),
      },
      deliverables_status: {
        ...report.deliverables_status,
        deliverables: report.deliverables_status.deliverables.filter(
          (d) => d.responsible_user_id === null
        ),
      },
    }
  }, [report, fOwner])

  // Per-section hasRows — no longer a single boolean gating all four buttons.
  const hasOverdueTasks =
    (displayReport?.tasks_overdue.tasks.length ?? 0) > 0
  const hasFindings =
    (displayReport?.findings_by_severity.findings.length ?? 0) > 0
  const hasQa = (displayReport?.qa_by_stream.length ?? 0) > 0
  const hasDeliverables =
    (displayReport?.deliverables_status.deliverables.length ?? 0) > 0

  const hasRowsBySection: Record<OperativeExportSection, boolean> = {
    tasks: hasOverdueTasks,
    findings: hasFindings,
    qa: hasQa,
    deliverables: hasDeliverables,
  }

  const printUrl = operativeReportPrintUrl(projectId, filters)

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
          <a href={printUrl} target="_blank" rel="noopener noreferrer">
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
            {EXPORT_SECTIONS.map((e) =>
              hasRowsBySection[e.section] ? (
                <Button
                  key={e.section}
                  asChild
                  size="sm"
                  variant="outline"
                >
                  <a
                    href={operativeReportExportUrl(
                      projectId,
                      e.section,
                      filters
                    )}
                    download
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {e.label}
                  </a>
                </Button>
              ) : (
                <Button
                  key={e.section}
                  size="sm"
                  variant="outline"
                  disabled
                  aria-disabled="true"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {e.label}
                </Button>
              )
            )}
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
        ) : displayReport ? (
          <OperativeReportBody report={displayReport} userName={userName} />
        ) : null}
      </CardContent>
    </Card>
  )
}
