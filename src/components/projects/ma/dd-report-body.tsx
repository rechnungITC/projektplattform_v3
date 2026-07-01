import { AlertTriangle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DdReport } from "@/lib/ma-project/dd-findings-api"
import type { DdStreamStatus } from "@/lib/ma-project/dd-streams-api"

import {
  FINDING_STATUS_LABEL,
  fmtEur,
  SEVERITY_LABEL,
  severityBadgeVariant,
} from "./dd-finding-labels"
import { DD_STATUS_LABEL, ddStatusBadgeVariant } from "./dd-stream-labels"

// PROJ-116 — presentational body for the consolidated DD report. Pure (no
// fetching, no interactivity) so it renders identically in the in-app view
// (DdReportView) and the chrome-less /print page. Data comes from the
// SECURITY-INVOKER RPC dd_report_consolidated, so what reaches this component
// is already need-to-know-filtered for the caller (a locked stream / its
// findings simply aren't present).

function streamStatusLabel(status: string): string {
  return DD_STATUS_LABEL[status as DdStreamStatus] ?? status
}

export function DdReportBody({ report }: { report: DdReport }) {
  const { streams, red_flags } = report

  const totalEur = streams.reduce((acc, s) => acc + Number(s.eur_sum || 0), 0)
  const totalNullEur = streams.reduce((acc, s) => acc + (s.null_eur_count || 0), 0)
  const dealBreakers = red_flags.filter((f) => f.severity === "deal_breaker").length

  return (
    <div className="space-y-8">
      {/* Streamübersicht ---------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Streamübersicht</h2>
        {streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine freigeschalteten DD-Streams sichtbar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Findings</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Hoch</TableHead>
                  <TableHead className="text-right">Deal Breaker</TableHead>
                  <TableHead className="text-right">Kaufpreis-Risiko</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Q&amp;A offen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((s) => (
                  <TableRow key={s.dd_stream_id}>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell>
                      <Badge variant={ddStatusBadgeVariant(s.status as DdStreamStatus)}>
                        {streamStatusLabel(s.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.findings_total}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular-nums">
                      {s.sev_hoch}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.sev_deal_breaker > 0 ? (
                        <span className="font-semibold text-destructive">{s.sev_deal_breaker}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEur(s.eur_sum)}
                      {s.null_eur_count > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          +{s.null_eur_count} ohne EUR-Schätzung
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums">
                      {s.qa_open}
                      <span className="text-muted-foreground">/{s.qa_open + s.qa_answered}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {/* H5 — never present the EUR sum as "complete" when findings lack an estimate. */}
        <p className="text-sm text-muted-foreground">
          Kaufpreis-Risiko gesamt (sichtbare Streams):{" "}
          <strong className="text-foreground">{fmtEur(totalEur)}</strong>
          {totalNullEur > 0 && (
            <> · {totalNullEur} Finding(s) ohne EUR-Schätzung (nicht in der Summe enthalten)</>
          )}
        </p>
      </section>

      {/* Red-Flag-Report ---------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          Red-Flag-Report
          {red_flags.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {red_flags.length} Befund(e){dealBreakers > 0 && ` · ${dealBreakers} Deal Breaker`}
            </span>
          )}
        </h2>
        {red_flags.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            Keine Red Flags (Schwere &bdquo;Hoch&ldquo; oder &bdquo;Deal Breaker&ldquo;) über die
            sichtbaren Streams.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Befund</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead>Schwere</TableHead>
                  <TableHead className="text-right">EUR</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {red_flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {streams.find((s) => s.dd_stream_id === f.dd_stream_id)?.label ??
                        f.dd_stream_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityBadgeVariant(f.severity)}>
                        {SEVERITY_LABEL[f.severity]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEur(f.economic_impact_eur)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {FINDING_STATUS_LABEL[f.status]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
