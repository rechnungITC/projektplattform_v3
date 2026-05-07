"use client"

import { Download } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  STAKEHOLDER_SCORES,
  STAKEHOLDER_SCORE_LABELS,
  type Stakeholder,
  type StakeholderScore,
} from "@/types/stakeholder"

interface StakeholderMatrixProps {
  stakeholders: Stakeholder[]
  onCellClick: (
    influence: StakeholderScore,
    impact: StakeholderScore
  ) => void
  onMarkerClick: (s: Stakeholder) => void
}

// Cell shading scales with the product of influence × impact (worst-case
// stakeholders sit top-right). Tailwind classes are static so the JIT picks
// them up; mapping is a 4×4 lookup.
function cellTone(
  influence: StakeholderScore,
  impact: StakeholderScore
): string {
  const score =
    STAKEHOLDER_SCORES.indexOf(influence) +
    STAKEHOLDER_SCORES.indexOf(impact)
  if (score >= 5) return "bg-destructive/10"
  if (score >= 3) return "bg-warning/10"
  if (score >= 1) return "bg-info/10"
  return "bg-muted/30"
}

export function StakeholderMatrix({
  stakeholders,
  onCellClick,
  onMarkerClick,
}: StakeholderMatrixProps) {
  const matrixRef = React.useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = React.useState(false)

  const cells = React.useMemo(() => {
    const map = new Map<string, Stakeholder[]>()
    for (const s of stakeholders) {
      const key = `${s.influence}|${s.impact}`
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }, [stakeholders])

  const handleExport = async () => {
    if (!matrixRef.current) return
    setExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(matrixRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor:
          getComputedStyle(document.documentElement).getPropertyValue(
            "--background"
          ) || "#ffffff",
      })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `stakeholder-matrix-${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch (err) {
      toast.error("PNG-Export fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setExporting(false)
    }
  }

  // Y-axis (impact) goes high → low so the worst-case quadrant sits top-right.
  const impactRows = [...STAKEHOLDER_SCORES].reverse()

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden /> Als PNG exportieren
        </Button>
      </div>

      <div ref={matrixRef} className="rounded-md border bg-background p-4">
        <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-1 text-xs">
          {/* corner */}
          <div />
          {/* x-axis labels (influence) */}
          {STAKEHOLDER_SCORES.map((inf) => (
            <div
              key={`x-${inf}`}
              className="px-2 py-1 text-center font-medium text-muted-foreground"
            >
              {STAKEHOLDER_SCORE_LABELS[inf]}
            </div>
          ))}

          {/* rows */}
          {impactRows.map((imp) => (
            <React.Fragment key={`row-${imp}`}>
              <div className="flex items-center justify-end pr-2 font-medium text-muted-foreground">
                {STAKEHOLDER_SCORE_LABELS[imp]}
              </div>
              {STAKEHOLDER_SCORES.map((inf) => {
                const key = `${inf}|${imp}`
                const occupants = cells.get(key) ?? []
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => onCellClick(inf, imp)}
                    className={cn(
                      "min-h-[80px] rounded-md border p-2 text-left transition-colors hover:border-primary",
                      cellTone(inf, imp)
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">
                        {occupants.length}
                      </Badge>
                    </div>
                    <ul className="flex flex-wrap gap-1">
                      {occupants.slice(0, 4).map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onMarkerClick(s)
                            }}
                            className="rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] text-background hover:bg-foreground"
                          >
                            {s.name.split(" ")[0] || s.name}
                          </button>
                        </li>
                      ))}
                      {occupants.length > 4 ? (
                        <li className="text-[10px] text-muted-foreground">
                          +{occupants.length - 4}
                        </li>
                      ) : null}
                    </ul>
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>← Einfluss niedrig</span>
          <span>Einfluss hoch →</span>
        </div>
        <div className="mt-1 text-center text-xs text-muted-foreground">
          (Y-Achse: Impact niedrig unten → hoch oben)
        </div>
      </div>
    </div>
  )
}
