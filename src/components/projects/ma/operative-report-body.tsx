import { AlertTriangle, CalendarClock, FileCheck2, MessageCircleQuestion } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LEVEL_LABEL } from "@/components/projects/ma/governance-labels"
import { DELIVERABLE_STATUS_LABELS } from "@/types/deliverable"
import type {
  OperativeDeliverableRow,
  OperativeFindingStreamAgg,
  OperativePreRead,
  OperativeQaRow,
  OperativeReport,
  OperativeTaskRow,
} from "@/types/operative-report"
import { WORK_ITEM_STATUS_LABELS, type WorkItemStatus } from "@/types/work-item"

import { fmtEur, SEVERITY_LABEL } from "./dd-finding-labels"

// PROJ-132 — presentational body for the operative reporting bundle. Pure (no
// fetching, no filter state) so it renders identically in the in-app view
// (with filters applied upstream) and the chrome-less /print page. Data comes
// from the SECURITY-INVOKER RPC operative_report, so what reaches this
// component is already need-to-know-filtered for the caller.

function ownerLabel(id: string | null, userName: Map<string, string>): string {
  if (!id) return "—"
  return userName.get(id) ?? "—"
}

function PreReadTiles({ pre }: { pre: OperativePreRead }) {
  const tiles = [
    {
      label: "Überfällige Aufgaben",
      value: pre.overdue_tasks,
      icon: CalendarClock,
      danger: pre.overdue_tasks > 0,
    },
    {
      label: "Offene Deal-Breaker",
      value: pre.open_deal_breaker_findings,
      icon: AlertTriangle,
      danger: pre.open_deal_breaker_findings > 0,
    },
    {
      label: "Offene Q&A",
      value: pre.open_qa,
      icon: MessageCircleQuestion,
      danger: false,
    },
    {
      label: "Deliverables offen",
      value: pre.deliverables_not_approved,
      icon: FileCheck2,
      danger: false,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-lg border p-4 ${t.danger ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <t.icon className="h-4 w-4" aria-hidden />
            {t.label}
          </div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${t.danger ? "text-destructive" : ""}`}
          >
            {t.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskSection({
  tasks,
  userName,
}: {
  tasks: OperativeTaskRow[]
  userName: Map<string, string>
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Aufgaben mit Fristüberschreitung</h2>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Keine offenen Aufgaben im aktuellen Filter.
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

function FindingSection({ streams }: { streams: OperativeFindingStreamAgg[] }) {
  const totalEur = streams.reduce((a, s) => a + Number(s.eur_sum || 0), 0)
  const totalNullEur = streams.reduce((a, s) => a + (s.null_eur_count || 0), 0)
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Offene Findings nach Schwere</h2>
      {streams.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Keine offenen Findings über die sichtbaren Streams.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead className="text-right">Offen</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">{SEVERITY_LABEL.niedrig}</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">{SEVERITY_LABEL.mittel}</TableHead>
                  <TableHead className="text-right">{SEVERITY_LABEL.hoch}</TableHead>
                  <TableHead className="text-right">Deal Breaker</TableHead>
                  <TableHead className="text-right">Kaufpreis-Risiko</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((s) => (
                  <TableRow key={s.dd_stream_id}>
                    <TableCell className="font-medium">{s.stream_label ?? s.dd_stream_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.open_total}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums">{s.sev_niedrig}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums">{s.sev_mittel}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sev_hoch}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.sev_deal_breaker > 0 ? (
                        <span className="font-semibold text-destructive">{s.sev_deal_breaker}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(s.eur_sum)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            Kaufpreis-Risiko gesamt (sichtbare, offene Findings):{" "}
            <strong className="text-foreground">{fmtEur(totalEur)}</strong>
            {totalNullEur > 0 && (
              <> · {totalNullEur} Finding(s) ohne EUR-Schätzung (nicht in der Summe)</>
            )}
          </p>
        </>
      )}
    </section>
  )
}

function QaSection({ rows }: { rows: OperativeQaRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Q&amp;A-Stand je Stream</h2>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Keine Q&amp;A über die sichtbaren Streams.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stream</TableHead>
                <TableHead className="text-right">Offen</TableHead>
                <TableHead className="text-right">Beantwortet</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Gesamt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q) => (
                <TableRow key={q.dd_stream_id}>
                  <TableCell className="font-medium">{q.stream_label ?? q.dd_stream_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.qa_open > 0 ? (
                      <span className="font-medium">{q.qa_open}</span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{q.qa_answered}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                    {q.qa_open + q.qa_answered}
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

function DeliverableSection({
  deliverables,
  userName,
}: {
  deliverables: OperativeDeliverableRow[]
  userName: Map<string, string>
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Deliverables-Status</h2>
      {deliverables.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Keine Deliverables im aktuellen Filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deliverable</TableHead>
                <TableHead>Workstream</TableHead>
                <TableHead className="hidden md:table-cell">Phase</TableHead>
                <TableHead>Verantwortlich</TableHead>
                <TableHead>Frist</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliverables.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[22rem] font-medium">
                    <span className="line-clamp-2">{d.name}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.workstream_label ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{d.phase_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {ownerLabel(d.responsible_user_id, userName)}
                  </TableCell>
                  <TableCell>
                    {d.due_date ? (
                      <span className={d.is_overdue ? "font-medium text-destructive" : ""}>
                        {d.due_date}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={d.status === "approved" ? "outline" : "secondary"}
                      className="text-[11px]"
                    >
                      {DELIVERABLE_STATUS_LABELS[d.status]}
                    </Badge>
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

export function OperativeReportBody({
  report,
  userName,
}: {
  report: OperativeReport
  userName: Map<string, string>
}) {
  return (
    <div className="space-y-8">
      <PreReadTiles pre={report.pre_read} />
      <TaskSection tasks={report.tasks_overdue.tasks} userName={userName} />
      <FindingSection streams={report.findings_by_severity.streams} />
      <QaSection rows={report.qa_by_stream} />
      <DeliverableSection
        deliverables={report.deliverables_status.deliverables}
        userName={userName}
      />
    </div>
  )
}

// Re-export for callers that only need the confidentiality label (filter chips).
export { LEVEL_LABEL }
