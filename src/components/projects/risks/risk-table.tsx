"use client"

import { Lock, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { riskSeverityBadgeTone } from "@/lib/risks/severity"
import { cn } from "@/lib/utils"
import {
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  type MaConfidentialityLevel,
} from "@/types/confidentiality"
import { RISK_STATUS_LABELS, type Risk } from "@/types/risk"

interface RiskTableProps {
  risks: Risk[]
  /** Set of risk IDs that originated from a KI-Vorschlag (PROJ-12). */
  kiDerivedIds?: Set<string>
  onRowClick: (r: Risk) => void
  /** PROJ-107 — show M&A category + confidentiality columns (M&A projects). */
  showMaColumns?: boolean
  /** PROJ-107 — category id → label for the Kategorie column. */
  categoryLabels?: Record<string, string>
}

export function RiskTable({
  risks,
  kiDerivedIds,
  onRowClick,
  showMaColumns = false,
  categoryLabels,
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
            {showMaColumns ? (
              <>
                <TableHead className="w-36">Kategorie</TableHead>
                <TableHead className="w-32">Vertraulichkeit</TableHead>
              </>
            ) : null}
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
              {showMaColumns ? (
                <>
                  <TableCell>
                    {r.category_id ? (
                      <Badge variant="secondary" className="font-normal">
                        {categoryLabels?.[r.category_id] ?? "—"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.confidentiality_level !== "standard" ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Lock className="h-3 w-3" aria-hidden />
                        {
                          MA_CONFIDENTIALITY_LEVEL_LABELS[
                            r.confidentiality_level as MaConfidentialityLevel
                          ]
                        }
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {MA_CONFIDENTIALITY_LEVEL_LABELS.standard}
                      </span>
                    )}
                  </TableCell>
                </>
              ) : null}
              <TableCell className="text-center">{r.probability}</TableCell>
              <TableCell className="text-center">{r.impact}</TableCell>
              <TableCell className="text-center">
                <span
                  className={cn(
                    "inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-mono",
                    riskSeverityBadgeTone(r.score)
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
