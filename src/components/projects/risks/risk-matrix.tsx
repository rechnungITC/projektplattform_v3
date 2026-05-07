"use client"

import { Sparkles } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"
import type { Risk } from "@/types/risk"

interface RiskMatrixProps {
  risks: Risk[]
  /** Set of risk IDs that originated from a KI-Vorschlag (PROJ-12). */
  kiDerivedIds?: Set<string>
  onMarkerClick: (r: Risk) => void
}

const SCALE = [1, 2, 3, 4, 5] as const

function cellTone(probability: number, impact: number): string {
  const score = probability * impact
  if (score >= 16) return "bg-destructive/10"
  if (score >= 9) return "bg-warning/10"
  if (score >= 4) return "bg-info/10"
  return "bg-muted/40"
}

/**
 * 5×5 Risk-Matrix. X = Wahrscheinlichkeit (1 left, 5 right), Y = Auswirkung
 * (5 top, 1 bottom). Each open risk is a small chip placed in its cell;
 * closed/accepted risks are dimmed.
 */
export function RiskMatrix({
  risks,
  kiDerivedIds,
  onMarkerClick,
}: RiskMatrixProps) {
  // Group risks by (probability, impact) cell
  const buckets = new Map<string, Risk[]>()
  for (const r of risks) {
    const key = `${r.probability}-${r.impact}`
    const arr = buckets.get(key) ?? []
    arr.push(r)
    buckets.set(key, arr)
  }

  const rows = [...SCALE].reverse() // impact descending top→bottom

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-px overflow-hidden rounded-md border">
        {/* Header row: empty corner + probability axis labels */}
        <div className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
          Auswirk. ↑
        </div>
        {SCALE.map((p) => (
          <div
            key={`hdr-${p}`}
            className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            P {p}
          </div>
        ))}

        {/* Data rows */}
        {rows.map((impact) => (
          <React.Fragment key={`row-${impact}`}>
            <div className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
              I {impact}
            </div>
            {SCALE.map((probability) => {
              const cellKey = `${probability}-${impact}`
              const inCell = buckets.get(cellKey) ?? []
              return (
                <div
                  key={cellKey}
                  className={cn(
                    "min-h-[64px] p-1.5",
                    cellTone(probability, impact)
                  )}
                >
                  <div className="flex flex-wrap gap-1">
                    {inCell.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onMarkerClick(r)}
                        className={cn(
                          "flex max-w-full items-center gap-1 truncate rounded-sm border bg-background px-1.5 py-0.5 text-left text-xs hover:bg-accent",
                          (r.status === "closed" ||
                            r.status === "accepted") &&
                            "opacity-60"
                        )}
                        title={
                          kiDerivedIds?.has(r.id)
                            ? `${r.title} (aus KI-Vorschlag)`
                            : r.title
                        }
                      >
                        {kiDerivedIds?.has(r.id) ? (
                          <Sparkles
                            className="h-3 w-3 shrink-0 text-primary"
                            aria-hidden
                          />
                        ) : null}
                        <span className="truncate">{r.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="text-right text-xs text-muted-foreground">
        Wahrscheinlichkeit →
      </p>
    </div>
  )
}
