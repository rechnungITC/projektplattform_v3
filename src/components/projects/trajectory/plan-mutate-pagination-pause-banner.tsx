"use client"

/**
 * PROJ-65 ε.3c.γ — Soft-limit pause banner inside PlanMutateDialog.
 *
 * Rendered when client-side pagination has accumulated ~PAGE_SIZE *
 * SOFT_LIMIT_PAGES (= 250) rows and is auto-paused. User explicitly
 * confirms continuing to render more rows, or aborts the whole flow.
 *
 * Pure presentation — state lives in the parent dialog.
 */

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"

interface PlanMutatePaginationPauseBannerProps {
  /** How many rows have already been rendered. */
  loadedCount: number
  /** Total available rows (from the full server response). */
  totalCount: number
  /** Next chunk to render on user-confirm; defaults to 50. */
  nextChunkSize?: number
  /** Continue rendering the next chunk. */
  onLoadMore: () => void
  /** Abort the entire pagination + dialog. */
  onAbort: () => void
}

export function PlanMutatePaginationPauseBanner({
  loadedCount,
  totalCount,
  nextChunkSize = 50,
  onLoadMore,
  onAbort,
}: PlanMutatePaginationPauseBannerProps) {
  const remaining = Math.max(0, totalCount - loadedCount)
  const nextBatch = Math.min(nextChunkSize, remaining)

  return (
    <Alert
      data-testid="plan-mutate-pagination-pause-banner"
      className="border-primary/40 bg-primary/5"
    >
      <Info className="h-4 w-4" aria-hidden />
      <AlertTitle>Über {loadedCount} Knoten betroffen</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          Plan-Mutate hat bereits <strong>{loadedCount}</strong> von{" "}
          <strong>{totalCount}</strong> Knoten geladen. Sehr große Cascade-
          Mutationen können die Bedienung verlangsamen.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={onLoadMore}
            data-testid="plan-mutate-pagination-load-more"
          >
            Weitere {nextBatch} laden
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onAbort}
            data-testid="plan-mutate-pagination-abort"
          >
            Hier abbrechen
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
