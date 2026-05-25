"use client"

/**
 * PROJ-65 ε.3c.α.5 — Skeleton displayed while the Plan-Mutate dialog
 * lazy-chunk is being fetched. Rendered as the `loading` fallback of
 * `next/dynamic`. Matches the diff-table layout (5 cols) so the swap
 * to the real dialog is visually quiet.
 *
 * Slow-connection escalation:
 *   - t ≥ 1s: subtle muted hint "Plan-Editor wird geladen…"
 *   - t ≥ 5s: destructive Alert "Verbindung scheint langsam" + Retry
 */

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Loader2 } from "lucide-react"

const SLOW_HINT_AFTER_MS = 1000
const SLOW_WARN_AFTER_MS = 5000

export function PlanMutateChunkLoading() {
  const [elapsedTier, setElapsedTier] = React.useState<"none" | "hint" | "warn">(
    "none",
  )

  React.useEffect(() => {
    const hint = window.setTimeout(
      () => setElapsedTier("hint"),
      SLOW_HINT_AFTER_MS,
    )
    const warn = window.setTimeout(
      () => setElapsedTier("warn"),
      SLOW_WARN_AFTER_MS,
    )
    return () => {
      window.clearTimeout(hint)
      window.clearTimeout(warn)
    }
  }, [])

  return (
    <Dialog open>
      <DialogContent
        aria-busy="true"
        aria-label="Plan-Editor wird geladen"
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Plan-Mutate-Vorschau</DialogTitle>
          <DialogDescription>
            Editor wird geladen…
          </DialogDescription>
        </DialogHeader>

        {elapsedTier === "warn" ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Verbindung scheint langsam</AlertTitle>
            <AlertDescription className="mt-2 flex items-center justify-between gap-2">
              <span>Der Plan-Editor lädt ungewöhnlich lange.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Neu laden
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {elapsedTier === "hint" && (
              <p className="text-xs text-muted-foreground">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
                Plan-Editor wird geladen…
              </p>
            )}
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
