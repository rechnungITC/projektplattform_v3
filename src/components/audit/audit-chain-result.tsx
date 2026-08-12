"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type AuditChainStatus,
  describeChainStatus,
  findingKind,
  sourceLabel,
} from "@/lib/audit/audit-chain-api"

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * PROJ-Y-130o — die Darstellung eines Prüfergebnisses, gemeinsam genutzt von der
 * Administrations-Karte (PROJ-Y-130m) und der Revisions-Sicht.
 *
 * Herausgezogen, weil zwei Darstellungen desselben Urteils genau die Krankheit
 * wären, gegen die PROJ-130 antritt: sie driften, und dann sagt eine Fläche
 * „unauffällig", während die andere einen Fund zeigt.
 */
export function AuditChainResult({ status }: { status: AuditChainStatus }) {
  const verdict = describeChainStatus(status)

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            verdict.tone === "ok"
              ? "default"
              : verdict.tone === "alarm"
                ? "destructive"
                : "secondary"
          }
        >
          {verdict.headline}
        </Badge>
        {status.last_window_start ? (
          <span className="text-muted-foreground text-xs">
            letztes gesiegeltes Fenster: {formatDate(status.last_window_start)}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{verdict.detail}</p>

      {status.sources.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {status.sources.map((src) => (
            <li key={src.source} className="flex items-center gap-2">
              <Badge variant={src.intact ? "secondary" : "destructive"}>
                {src.intact ? "unauffällig" : "Abweichung"}
              </Badge>
              <span className="font-medium">{sourceLabel(src.source)}</span>
              <span className="text-muted-foreground text-xs">
                {src.windows_checked} Fenster
                {src.last_window_start
                  ? ` · zuletzt ${formatDate(src.last_window_start)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {status.findings.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protokoll</TableHead>
              <TableHead>Fenster</TableHead>
              <TableHead>Art der Abweichung</TableHead>
              <TableHead>Einträge gesiegelt</TableHead>
              <TableHead>Einträge jetzt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status.findings.map((f) => (
              <TableRow key={`${f.source}-${f.window_start}`}>
                <TableCell>{sourceLabel(f.source)}</TableCell>
                <TableCell className="font-medium">
                  {formatDate(f.window_start)}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">{findingKind(f)}</Badge>
                </TableCell>
                <TableCell>{f.entry_count_sealed}</TableCell>
                <TableCell>{f.entry_count_now}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  )
}
