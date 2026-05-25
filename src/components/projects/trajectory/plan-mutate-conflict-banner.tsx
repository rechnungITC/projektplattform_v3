"use client"

/**
 * PROJ-65 ε.3b — PlanMutateConflictBanner (AC-7).
 *
 * Replaces the Apply/Cancel footer of `PlanMutateDialog` when the
 * server returns `{ ok: false, status: 409 }`. The diff table stays
 * visible (dimmed) above; this banner exposes the resolution path.
 */

import { AlertTriangle } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface PlanMutateConflictBannerProps {
  /** Node ids that are conflicted; used to derive the count + name preview. */
  conflictedNodeIds: string[]
  /**
   * PROJ-65 ε.3c.β (R-D4) — optional source-id that triggered the
   * conflict in a multi-source request. Shown explicitly above the
   * generic conflict-list so the user knows which selected source
   * blocks the bulk operation.
   */
  offendingSourceNodeId?: string
  /** Map of node-id → label so we can show first-3 names in copy. */
  nodeLabels?: Record<string, string>
  onReload: () => void
  onCancel: () => void
  reloading?: boolean
}

export function PlanMutateConflictBanner({
  conflictedNodeIds,
  offendingSourceNodeId,
  nodeLabels,
  onReload,
  onCancel,
  reloading = false,
}: PlanMutateConflictBannerProps) {
  const names = conflictedNodeIds
    .slice(0, 3)
    .map((id) => nodeLabels?.[id] ?? id)
  const extra = conflictedNodeIds.length - names.length
  const offendingLabel = offendingSourceNodeId
    ? nodeLabels?.[offendingSourceNodeId] ?? offendingSourceNodeId
    : null
  return (
    <Alert
      variant="destructive"
      data-testid="plan-mutate-conflict-banner"
      className="border-destructive/40 bg-destructive/5"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>Plan-Konflikt — andere Bearbeitung erkannt</AlertTitle>
      <AlertDescription className="space-y-3">
        {offendingLabel && (
          <p
            className="text-sm"
            data-testid="plan-mutate-conflict-source"
          >
            Quelle <strong>{offendingLabel}</strong> blockiert die Bulk-Operation.
          </p>
        )}
        <p className="text-sm">
          {conflictedNodeIds.length}{" "}
          {conflictedNodeIds.length === 1 ? "Knoten wurde" : "Knoten wurden"}{" "}
          zwischenzeitlich geändert
          {names.length > 0 ? `: ${names.join(", ")}` : ""}
          {extra > 0 ? `, …+${extra} weitere` : ""}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onReload}
            disabled={reloading}
            data-testid="plan-mutate-conflict-reload"
          >
            {reloading ? "Lade neuen Stand…" : "Neuen Stand laden"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid="plan-mutate-conflict-cancel"
          >
            Abbrechen
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
