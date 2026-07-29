import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Flag,
  GitBranch,
  Layers,
  ShieldAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  RiskSeverityBucket,
  SteeringCriticalTask,
  SteeringGateStatus,
  SteeringRedFlagFinding,
  SteeringRedFlagRisk,
  SteeringReport,
} from "@/types/steering-report"
import { WORK_ITEM_STATUS_LABELS, type WorkItemStatus } from "@/types/work-item"

import { fmtEur, SEVERITY_LABEL } from "./dd-finding-labels"

// PROJ-131 — presentational body for the steering reporting bundle. Pure (no
// fetching, no state) so it renders identically in the in-app view and the
// chrome-less /print page. Data comes from the SECURITY-INVOKER RPC
// steering_report, so what reaches this component is already need-to-know-
// filtered for the caller. Kaufpreis (I1/I2) and Synergie (K2) are not built
// yet → shown as "not-yet-available" placeholders (AC-131-5 → PROJ-Y-131a).

const TOP_N = 5

const GATE_STATUS_LABEL: Record<SteeringGateStatus, string> = {
  pending: "Offen",
  passed: "Freigegeben",
  conditional: "Mit Auflagen",
  aborted: "Abgebrochen",
}

const RISK_BUCKET_LABEL: Record<RiskSeverityBucket, string> = {
  unknown: "—",
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}

function ownerLabel(id: string | null, userName: Map<string, string>): string {
  if (!id) return "—"
  return userName.get(id) ?? "—"
}

/** Small "→ open" drill-down link, only rendered in the in-app view (projectId set). */
function DrillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  )
}

function PreReadTiles({
  report,
}: {
  report: SteeringReport
}) {
  const pre = report.pre_read
  const phase = report.deal_status.current_phase
  const gate = report.next_stage_gate
  const tiles: {
    label: string
    value: React.ReactNode
    sub?: string
    icon: typeof Flag
    danger?: boolean
    muted?: boolean
  }[] = [
    {
      label: "Aktuelle Phase",
      value: phase?.name ?? "—",
      sub: pre.lifecycle_status ? `Status: ${pre.lifecycle_status}` : undefined,
      icon: Layers,
    },
    {
      label: "Nächstes Stage-Gate",
      value: gate ? `Gate ${gate.sequence_number}` : "—",
      sub: gate ? GATE_STATUS_LABEL[gate.status] : "kein offenes Gate",
      icon: GitBranch,
    },
    {
      label: "Offene Red Flags",
      value: pre.open_red_flag_findings,
      icon: Flag,
      danger: pre.open_red_flag_findings > 0,
    },
    {
      label: "Offene High-Risiken",
      value: pre.open_high_risks,
      icon: ShieldAlert,
      danger: pre.open_high_risks > 0,
    },
    {
      label: "Kritische Aufgaben",
      value: pre.critical_tasks,
      icon: CalendarClock,
      danger: pre.critical_tasks > 0,
    },
    {
      label: "Kaufpreisbandbreite",
      value: "n/a",
      sub: "noch nicht verfügbar",
      icon: AlertTriangle,
      muted: true,
    },
    {
      label: "Synergie-Stand",
      value: "n/a",
      sub: "noch nicht verfügbar",
      icon: AlertTriangle,
      muted: true,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-lg border p-4 ${
            t.danger
              ? "border-destructive/40 bg-destructive/5"
              : t.muted
                ? "border-dashed bg-muted/30"
                : "bg-card"
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              t.danger ? "text-destructive" : t.muted ? "text-muted-foreground" : ""
            }`}
          >
            {t.value}
          </div>
          {t.sub && <div className="mt-0.5 text-xs text-muted-foreground">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function StageGateSection({
  report,
  projectId,
}: {
  report: SteeringReport
  projectId?: string
}) {
  const gate = report.next_stage_gate
  const s = report.stage_gate_summary
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Stage-Gate-Status</h2>
        {projectId && (
          <DrillLink href={`/projects/${projectId}/stage-gates`}>Stage-Gates öffnen</DrillLink>
        )}
      </div>
      <div className="rounded-md border p-4">
        {gate ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">Nächstes offenes Gate:</span>
            <span className="font-medium">Gate {gate.sequence_number}</span>
            <Badge variant="outline">{GATE_STATUS_LABEL[gate.status]}</Badge>
            {gate.target_phase_name && (
              <span className="text-sm text-muted-foreground">
                → Phase: {gate.target_phase_name}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Kein offenes Stage-Gate (alle entschieden oder keine angelegt).
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Gesamt {s.total} · offen {s.pending} · freigegeben {s.passed} · mit Auflagen{" "}
          {s.conditional} · abgebrochen {s.aborted}
        </p>
      </div>
    </section>
  )
}

function RedFlagSection({
  findings,
  risks,
  projectId,
}: {
  findings: SteeringRedFlagFinding[]
  risks: SteeringRedFlagRisk[]
  projectId?: string
}) {
  const topFindings = findings.slice(0, TOP_N)
  const topRisks = risks.slice(0, TOP_N)
  const totalEur = findings.reduce(
    (a, f) => a + (f.economic_impact_eur === null ? 0 : Number(f.economic_impact_eur)),
    0
  )
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Top Red Flags</h2>
      </div>

      {/* DD-Findings (hoch / deal_breaker) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            DD-Findings ({findings.length})
          </h3>
          {projectId && (
            <DrillLink href={`/projects/${projectId}/due-diligence`}>DD-Findings öffnen</DrillLink>
          )}
        </div>
        {findings.length === 0 ? (
          <p className="rounded-md border border-dashed py-5 text-center text-sm text-muted-foreground">
            Keine kritischen DD-Findings im Berechtigungskontext.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finding</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Schwere</TableHead>
                    <TableHead className="text-right">Kaufpreis-Risiko</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topFindings.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-[24rem] font-medium">
                        <span className="line-clamp-2">{f.title}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {f.stream_label ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={f.severity === "deal_breaker" ? "destructive" : "outline"}
                          className="text-[11px]"
                        >
                          {SEVERITY_LABEL[f.severity] ?? f.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.economic_impact_eur === null ? "—" : fmtEur(f.economic_impact_eur)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {findings.length > TOP_N && (
              <p className="text-xs text-muted-foreground">
                … und {findings.length - TOP_N} weitere (siehe Export / DD-Findings).
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Kaufpreis-Risiko (sichtbare Red-Flag-Findings):{" "}
              <strong className="text-foreground">{fmtEur(totalEur)}</strong>
            </p>
          </>
        )}
      </div>

      {/* High/critical risks (E2) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            High-Risiken ({risks.length})
          </h3>
          {projectId && (
            <DrillLink href={`/projects/${projectId}/risiken`}>Risikoregister öffnen</DrillLink>
          )}
        </div>
        {risks.length === 0 ? (
          <p className="rounded-md border border-dashed py-5 text-center text-sm text-muted-foreground">
            Keine offenen High-Risiken im Berechtigungskontext.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risiko</TableHead>
                    <TableHead>Workstream</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Schwere</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRisks.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[24rem] font-medium">
                        <span className="line-clamp-2">{r.title}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.workstream_label ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.score}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.severity_bucket === "critical" ? "destructive" : "outline"}
                          className="text-[11px]"
                        >
                          {RISK_BUCKET_LABEL[r.severity_bucket]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {risks.length > TOP_N && (
              <p className="text-xs text-muted-foreground">
                … und {risks.length - TOP_N} weitere (siehe Export / Risikoregister).
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function CriticalTaskSection({
  tasks,
  userName,
  projectId,
}: {
  tasks: SteeringCriticalTask[]
  userName: Map<string, string>
  projectId?: string
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Kritische offene Aufgaben</h2>
        {projectId && (
          <DrillLink href={`/projects/${projectId}/engpaesse`}>Engpässe öffnen</DrillLink>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Keine überfälligen oder blockierten Aufgaben im Berechtigungskontext.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aufgabe</TableHead>
                <TableHead>Workstream</TableHead>
                <TableHead className="hidden md:table-cell">Phase</TableHead>
                <TableHead>Verantwortlich</TableHead>
                <TableHead>Frist</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tage über Frist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-[22rem] font-medium">
                    <span className="line-clamp-2">{t.title}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.workstream_label ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {t.phase_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ownerLabel(t.responsible_user_id, userName)}
                  </TableCell>
                  <TableCell>
                    {t.due_date ? (
                      <span className={t.is_overdue ? "font-medium text-destructive" : ""}>
                        {t.due_date}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={t.is_blocked ? "destructive" : "outline"}
                      className="text-[11px]"
                    >
                      {WORK_ITEM_STATUS_LABELS[t.status as WorkItemStatus] ?? t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.days_overdue > 0 ? (
                      <Badge variant="destructive">{t.days_overdue}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

export function SteeringReportBody({
  report,
  userName,
  projectId,
}: {
  report: SteeringReport
  userName: Map<string, string>
  projectId?: string
}) {
  return (
    <div className="space-y-8">
      <PreReadTiles report={report} />
      <StageGateSection report={report} projectId={projectId} />
      <RedFlagSection
        findings={report.red_flags.findings}
        risks={report.red_flags.risks}
        projectId={projectId}
      />
      <CriticalTaskSection
        tasks={report.critical_tasks.tasks}
        userName={userName}
        projectId={projectId}
      />
    </div>
  )
}
