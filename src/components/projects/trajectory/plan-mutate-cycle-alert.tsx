"use client"

/**
 * PROJ-65 ε.3b — PlanMutateCycleAlert (AC-8).
 *
 * Replaces the entire diff body when the server returns
 * `{ ok: false, status: 422, cycle: { detected_at_node_id, path } }`.
 * Shows cycle path as breadcrumbs (max 5).
 */

import { Repeat } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface PlanMutateCycleAlertProps {
  /** Node id where the cycle was detected (highlighted in copy). */
  detectedAtNodeId: string
  /** Full cycle path (server-supplied node ids in cycle order). */
  path: string[]
  /** Optional label map to humanize ids in the breadcrumbs. */
  nodeLabels?: Record<string, string>
  onClose: () => void
}

export function PlanMutateCycleAlert({
  detectedAtNodeId,
  path,
  nodeLabels,
  onClose,
}: PlanMutateCycleAlertProps) {
  const breadcrumbs = path.slice(0, 5)
  const extra = path.length - breadcrumbs.length
  const detectedLabel = nodeLabels?.[detectedAtNodeId] ?? detectedAtNodeId
  return (
    <Alert
      variant="destructive"
      data-testid="plan-mutate-cycle-alert"
      className="border-destructive/40 bg-destructive/5"
    >
      <Repeat className="h-4 w-4" aria-hidden />
      <AlertTitle>Zyklus im Abhängigkeitsgraph erkannt</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          Knoten <strong>{detectedLabel}</strong> ist Teil eines
          Dependency-Cycle. Plan-Mutate ist erst möglich, wenn der Zyklus
          aufgelöst ist.
        </p>
        {breadcrumbs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] uppercase text-muted-foreground">
              Pfad:
            </span>
            {breadcrumbs.map((id, idx) => (
              <span key={id + idx} className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {nodeLabels?.[id] ?? id}
                </Badge>
                {idx < breadcrumbs.length - 1 && (
                  <span className="text-muted-foreground" aria-hidden>
                    →
                  </span>
                )}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-[11px] text-muted-foreground">
                …+{extra}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            data-testid="plan-mutate-cycle-close"
          >
            Schließen
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
