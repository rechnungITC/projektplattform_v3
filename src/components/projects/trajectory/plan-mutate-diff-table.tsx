"use client"

/**
 * PROJ-65 ε.3b — PlanMutateDiffTable.
 *
 * Pure presentation: renders the server-computed diff in a 5-column
 * shadcn `Table` with sticky `<thead>`, row-grouping per node, and a
 * Class-3 footnote when any cost-cell is masked.
 *
 * Empty state shows a banner instead of an empty table (AC-4).
 * N > 50 affected nodes — first 50 rendered + footer counter (AC-4).
 *
 * AC-4 / AC-5 / AC-6 cover this component.
 */

import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle, ExternalLink } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { ClassThreeFootnote } from "../stakeholder/class-three-lock"
import {
  formatCostDelta,
  formatTimeDelta,
  type CostDelta,
} from "../stakeholder/cost-delta-formatter"

export type AffectedField =
  | "start_date"
  | "end_date"
  | "cost_estimate"
  | "risk_severity"
  | "stakeholder_load"

export type AffectedValueKind = "exact" | "masked" | "enum"

export interface AffectedValue {
  kind: AffectedValueKind
  /** Server-supplied raw value. Interpretation depends on `kind`:
   *  - exact: number | string | CostDelta
   *  - masked: never used (renderer prints `***`)
   *  - enum: string (e.g. "Niedrig", "Mittel") */
  value: unknown
}

export interface AffectedTopRisk {
  risk_id: string
  title: string
  severity: string
}

export interface AffectedRow {
  node_id: string
  node_kind: string
  node_label: string
  field: AffectedField
  before: AffectedValue
  after: AffectedValue
  severity: "neutral" | "delay" | "blocked"
  masked: boolean
  /** Only present for `field === "risk_severity"`. */
  top_3_risks?: AffectedTopRisk[]
}

interface PlanMutateDiffTableProps {
  affected: AffectedRow[]
  /** Class-3 plaintext permission. When `false`, cost cells render `***`. */
  costClearView: boolean
  /** Set of node-ids that are involved in a 409-conflict; rows get a
   *  destructive highlight + warning icon. Empty set = no conflict. */
  conflictedNodeIds?: Set<string>
  /** Used for the `ClassThreeFootnote` mailto helper. */
  projectId: string
  /** Optional max-rows cap. Default 50; rows beyond render as a footer
   *  counter. */
  maxVisibleRows?: number
}

const FIELD_LABEL: Record<AffectedField, string> = {
  start_date: "Start",
  end_date: "Ende",
  cost_estimate: "Kosten",
  risk_severity: "Risiko",
  stakeholder_load: "Stakeholder-Last",
}

const NODE_KIND_LABEL: Record<string, string> = {
  phase: "Phase",
  sprint: "Sprint",
  milestone: "Meilenstein",
  work_item: "Work Item",
  epic: "Epic",
  goal: "Ziel",
  project_start: "Start",
  budget: "Budget",
}

export function PlanMutateDiffTable({
  affected,
  costClearView,
  conflictedNodeIds,
  projectId,
  maxVisibleRows = 50,
}: PlanMutateDiffTableProps) {
  if (affected.length === 0) {
    return (
      <div
        data-testid="plan-mutate-diff-empty"
        className="rounded-md border bg-muted/10 p-6 text-center text-sm"
      >
        <p className="font-medium text-foreground">
          Keine Folge-Knoten betroffen
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nur dieser Knoten wird verschoben.
        </p>
      </div>
    )
  }

  const visibleRows = affected.slice(0, maxVisibleRows)
  const hiddenCount = affected.length - visibleRows.length
  const hasMaskedCost = affected.some(
    (r) => r.field === "cost_estimate" && r.masked,
  )

  // Group rows by node so we can render border-t-2 between groups.
  const grouped: Array<{
    node_id: string
    node_kind: string
    node_label: string
    rows: AffectedRow[]
  }> = []
  for (const row of visibleRows) {
    const last = grouped[grouped.length - 1]
    if (last && last.node_id === row.node_id) {
      last.rows.push(row)
    } else {
      grouped.push({
        node_id: row.node_id,
        node_kind: row.node_kind,
        node_label: row.node_label,
        rows: [row],
      })
    }
  }

  return (
    <div className="space-y-2" data-testid="plan-mutate-diff-table">
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-[32%]">Knoten</TableHead>
              <TableHead className="w-[14%]">Feld</TableHead>
              <TableHead className="w-[22%]">Vorher</TableHead>
              <TableHead className="w-[8%]">Δ</TableHead>
              <TableHead className="w-[24%]">Nachher</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((group, groupIdx) => {
              const isConflicted =
                conflictedNodeIds?.has(group.node_id) ?? false
              return group.rows.map((row, rowIdx) => {
                const isFirstRowOfGroup = rowIdx === 0
                const showBorder = isFirstRowOfGroup && groupIdx > 0
                return (
                  <TableRow
                    key={`${row.node_id}:${row.field}`}
                    data-testid="plan-mutate-diff-row"
                    data-node-id={row.node_id}
                    data-field={row.field}
                    data-severity={row.severity}
                    className={`${showBorder ? "border-t-2" : ""} ${
                      isConflicted ? "bg-destructive/10" : ""
                    }`}
                  >
                    <TableCell className="align-top">
                      {isFirstRowOfGroup ? (
                        <div className="flex items-center gap-1.5">
                          {isConflicted && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-destructive"
                              aria-label="Konflikt"
                            />
                          )}
                          <span className="text-sm font-medium">
                            {group.node_label}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {NODE_KIND_LABEL[group.node_kind] ??
                              group.node_kind}
                          </Badge>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      <span aria-label={`Feld: ${FIELD_LABEL[row.field]}`}>
                        {FIELD_LABEL[row.field]}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <CellValue
                        value={row.before}
                        field={row.field}
                        costClearView={costClearView}
                        masked={row.masked}
                        side="before"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <DeltaArrow severity={row.severity} />
                    </TableCell>
                    <TableCell className="align-top">
                      <CellValue
                        value={row.after}
                        field={row.field}
                        costClearView={costClearView}
                        masked={row.masked}
                        side="after"
                      />
                      {row.field === "risk_severity" &&
                        row.top_3_risks &&
                        row.top_3_risks.length > 0 && (
                          <TopRisksCollapsible risks={row.top_3_risks} />
                        )}
                    </TableCell>
                  </TableRow>
                )
              })
            })}
          </TableBody>
        </Table>
      </div>
      {hiddenCount > 0 && (
        <p
          className="text-center text-[11px] text-muted-foreground"
          data-testid="plan-mutate-diff-overflow"
        >
          +{hiddenCount} weitere Knoten
        </p>
      )}
      <ClassThreeFootnote hasMaskedValue={hasMaskedCost} projectId={projectId} />
    </div>
  )
}

function CellValue({
  value,
  field,
  costClearView,
  masked,
  side,
}: {
  value: AffectedValue
  field: AffectedField
  costClearView: boolean
  masked: boolean
  side: "before" | "after"
}) {
  // Class-3 cost masking — always render `***` + aggregate label for
  // cost_estimate when masked OR when costClearView === false.
  if (field === "cost_estimate" && (masked || !costClearView)) {
    if (side === "before") {
      return (
        <span className="font-mono text-sm text-muted-foreground">***</span>
      )
    }
    // Try to render the aggregate-bucket label from the after-value.
    const bucketLabel =
      value.kind === "exact" || value.kind === "masked"
        ? formatCostDelta(extractAggregateDelta(value))
        : "***"
    return (
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-sm text-muted-foreground">***</span>
        <span className="text-xs text-muted-foreground">{bucketLabel}</span>
      </div>
    )
  }

  // Exact cost rendering.
  if (field === "cost_estimate" && value.kind === "exact") {
    return (
      <span className="font-mono text-sm">
        {formatCostDelta(extractExactDelta(value))}
      </span>
    )
  }

  // Risk severity enum / generic enum cell.
  if (value.kind === "enum") {
    return (
      <Badge variant="outline" className="text-[11px]">
        {String(value.value)}
      </Badge>
    )
  }

  // Date or generic text cell.
  if (field === "start_date" || field === "end_date") {
    const text =
      typeof value.value === "string"
        ? formatDate(value.value)
        : "—"
    return <span className="font-mono text-xs">{text}</span>
  }

  // Stakeholder load + fallback.
  if (field === "stakeholder_load" && side === "after") {
    const before =
      typeof value.value === "number"
        ? `${value.value} %`
        : String(value.value ?? "—")
    return <span className="text-sm">{before}</span>
  }

  return (
    <span className="text-sm">
      {value.value == null ? "—" : String(value.value)}
    </span>
  )
}

/** Extracts a CostDelta from a server-supplied AffectedValue.value. */
function extractExactDelta(value: AffectedValue): CostDelta {
  const raw = value.value as
    | CostDelta
    | { amount_cents?: number; currency?: string }
    | undefined
  if (raw && typeof raw === "object" && "kind" in raw) {
    return raw as CostDelta
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as { amount_cents?: unknown }).amount_cents === "number"
  ) {
    return {
      kind: "exact",
      amount_cents: (raw as { amount_cents: number }).amount_cents,
      currency: String((raw as { currency?: string }).currency ?? "EUR"),
    }
  }
  return { kind: "none" }
}

function extractAggregateDelta(value: AffectedValue): CostDelta {
  // When backend hands us a bucket on a masked row, prefer it.
  const raw = value.value as
    | { bucket?: CostDelta extends { bucket: infer B } ? B : never }
    | CostDelta
    | undefined
  if (raw && typeof raw === "object" && "kind" in raw) {
    return raw as CostDelta
  }
  const bucket = (raw as { bucket?: string } | undefined)?.bucket
  if (
    bucket === "much-less" ||
    bucket === "less" ||
    bucket === "even" ||
    bucket === "more" ||
    bucket === "much-more"
  ) {
    return { kind: "aggregate", bucket }
  }
  return { kind: "aggregate", bucket: "even" }
}

function DeltaArrow({
  severity,
}: {
  severity: "neutral" | "delay" | "blocked"
}) {
  if (severity === "neutral") {
    return (
      <ArrowRight
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-label="unverändert in Richtung"
      />
    )
  }
  if (severity === "delay") {
    return (
      <ArrowUp
        className="h-3.5 w-3.5 text-amber-500"
        aria-label="Verzögerung"
      />
    )
  }
  return (
    <ArrowDown
      className="h-3.5 w-3.5 text-destructive"
      aria-label="blockiert"
    />
  )
}

function TopRisksCollapsible({ risks }: { risks: AffectedTopRisk[] }) {
  const [open, setOpen] = React.useState(false)
  const sliced = risks.slice(0, 3)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="text-[11px] text-primary underline-offset-2 hover:underline"
          data-testid="plan-mutate-top-risks-trigger"
        >
          {open ? "Top-Risiken ausblenden" : `Top-${sliced.length} Risiken`}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-0.5">
          {sliced.map((r) => (
            <li key={r.risk_id} className="flex items-center gap-1 text-[11px]">
              <a
                href={`/risks/${encodeURIComponent(r.risk_id)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                {r.title}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <span className="text-muted-foreground">· {r.severity}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatDate(iso: string): string {
  // ISO date or date-time — render `dd.MM.yyyy` for de-DE.
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

// Export the time-delta formatter alias for external consumers
// (orchestrator uses it for the toast sub-line).
export { formatTimeDelta }
