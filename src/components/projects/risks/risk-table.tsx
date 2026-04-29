"use client"

import { Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { RISK_STATUS_LABELS, type Risk } from "@/types/risk"

function scoreTone(score: number): string {
  if (score >= 16) return "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100"
  if (score >= 9)
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
  if (score >= 4)
    return "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
  return "bg-muted text-muted-foreground"
}

interface RiskTableProps {
  risks: Risk[]
  /** Set of risk IDs that originated from a KI-Vorschlag (PROJ-12). */
  kiDerivedIds?: Set<string>
  onRowClick: (r: Risk) => void
}

export function RiskTable({
  risks,
  kiDerivedIds,
  onRowClick,
}: RiskTableProps) {
  if (risks.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Noch keine Risiken erfasst. Klicke auf „+ Risiko“ oder lade Vorschläge
        aus der KI (PROJ-12, später).
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titel</TableHead>
            <TableHead className="w-20 text-center">Wahrsch.</TableHead>
            <TableHead className="w-20 text-center">Auswirk.</TableHead>
            <TableHead className="w-20 text-center">Score</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(r)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-1.5">
                  <span>{r.title}</span>
                  {kiDerivedIds?.has(r.id) ? (
                    <Badge
                      variant="outline"
                      className="gap-1 px-1.5 py-0 text-[10px] font-normal"
                      title="Aus KI-Vorschlag übernommen"
                    >
                      <Sparkles className="h-3 w-3" aria-hidden />
                      KI
                    </Badge>
                  ) : null}
                </div>
                {r.description ? (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {r.description}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="text-center">{r.probability}</TableCell>
              <TableCell className="text-center">{r.impact}</TableCell>
              <TableCell className="text-center">
                <span
                  className={cn(
                    "inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-mono",
                    scoreTone(r.score)
                  )}
                >
                  {r.score}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{RISK_STATUS_LABELS[r.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
