"use client"

/**
 * PROJ-65 ε.3c.β — CycleAttemptOverlay (AC-8, AC-9, AC-10).
 *
 * Transient destructive banner shown above the graph when a 422-cycle
 * response comes back from `/plan-mutate`. Separate from the persistent
 * ε.1 `CycleBanner` (yellow/warning) — this one is red/destructive and
 * lives in FE-state only (`lastCycleAttempt`).
 *
 * Both banners can stack — when both are active they render together
 * (ε.3c.β destructive on top, ε.1 warning below).
 *
 * Buttons:
 *   - "Path im Graph fokussieren" → onFocus(path) so the parent can
 *     scroll the graph container's bounding-box to make the cycle
 *     visible (auto-scroll/zoom is parent responsibility).
 *   - "Verstanden, ausblenden" → onDismiss() clears the state.
 */

import { Repeat } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import type { CycleAttempt } from "@/lib/project-graph/types"

interface CycleAttemptOverlayProps {
  cycle: CycleAttempt
  /** Optional label map to humanize ids in the breadcrumbs. */
  nodeLabels?: Record<string, string>
  /** Fired when the user clicks "Path im Graph fokussieren". Parent
   *  should compute bounding-box of `cycle.path` nodes and scroll. */
  onFocus: (path: string[]) => void
  /** Fired when the user clicks "Verstanden, ausblenden". Parent
   *  should set `lastCycleAttempt = null`. */
  onDismiss: () => void
}

export function CycleAttemptOverlay({
  cycle,
  nodeLabels,
  onFocus,
  onDismiss,
}: CycleAttemptOverlayProps) {
  const previewNodes = cycle.path.slice(0, 3)
  const extra = cycle.path.length - previewNodes.length
  const sourceLabel = cycle.source_node_id
    ? nodeLabels?.[cycle.source_node_id] ?? cycle.source_node_id
    : null

  return (
    <Alert
      variant="destructive"
      data-testid="cycle-attempt-overlay"
      className="border-destructive/40 bg-destructive/5"
    >
      <Repeat className="h-4 w-4" aria-hidden />
      <AlertTitle>Zyklus im Abhängigkeitsgraph erkannt</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          Plan-Mutate
          {sourceLabel ? (
            <>
              {" "}auf <strong>{sourceLabel}</strong>
            </>
          ) : (
            ""
          )}{" "}
          blockiert durch Zyklus.
        </p>
        {previewNodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] uppercase text-muted-foreground">
              Pfad:
            </span>
            {previewNodes.map((id, idx) => (
              <span key={`${id}-${idx}`} className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {nodeLabels?.[id] ?? id}
                </Badge>
                {idx < previewNodes.length - 1 && (
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onFocus(cycle.path)}
            disabled={cycle.path.length === 0}
            data-testid="cycle-attempt-overlay-focus"
          >
            Path im Graph fokussieren
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            data-testid="cycle-attempt-overlay-dismiss"
          >
            Verstanden, ausblenden
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
