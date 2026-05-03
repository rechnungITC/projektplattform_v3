"use client"

import { CheckSquare, ChevronDown, ChevronRight, Gavel, RotateCcw } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { Decision } from "@/types/decision"

interface DecisionCardProps {
  decision: Decision
  /** Predecessors in chronological order, newest first; may be empty. */
  predecessors: Decision[]
  onRevise: (d: Decision) => void
  /** PROJ-31 — open the approval-management sheet for this decision. */
  onManageApproval?: (d: Decision) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DecisionCard({
  decision,
  predecessors,
  onRevise,
  onManageApproval,
}: DecisionCardProps) {
  const [open, setOpen] = React.useState(false)
  const hasPredecessors = predecessors.length > 0

  return (
    <Card id={`decision-${decision.id}`}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Gavel className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h3 className="text-base font-semibold">{decision.title}</h3>
            {hasPredecessors ? (
              <Badge variant="secondary">
                Revision (R{predecessors.length + 1})
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(decision.decided_at)}</span>
            {onManageApproval ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onManageApproval(decision)}
                title="Genehmigung verwalten"
              >
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Genehmigung
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRevise(decision)}
              title="Revidieren — neue Version anlegen"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Revidieren
            </Button>
          </div>
        </div>

        <p className="whitespace-pre-wrap text-sm">{decision.decision_text}</p>

        {decision.rationale ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Begründung
            </p>
            <p className="whitespace-pre-wrap text-sm">{decision.rationale}</p>
          </div>
        ) : null}

        {hasPredecessors ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
              >
                {open ? (
                  <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="mr-1 h-3.5 w-3.5" aria-hidden />
                )}
                Vorgänger anzeigen ({predecessors.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {predecessors.map((p, idx) => (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-md border bg-muted/30 px-3 py-2 text-xs",
                    "border-l-4 border-l-muted-foreground/30"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-muted-foreground">
                      R{predecessors.length - idx} · {formatDate(p.decided_at)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      Überholt
                    </Badge>
                  </div>
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-1 whitespace-pre-wrap">{p.decision_text}</p>
                  {p.rationale ? (
                    <p className="mt-1 text-muted-foreground">
                      <span className="font-medium">Begründung:</span>{" "}
                      {p.rationale}
                    </p>
                  ) : null}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  )
}
