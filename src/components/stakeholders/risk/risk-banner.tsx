"use client"

import { Info } from "lucide-react"
import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { RiskScoreBreakdown } from "@/lib/risk-score/compute"
import type { RiskBucket } from "@/lib/risk-score/defaults"

const BUCKET_LABEL: Record<RiskBucket, string> = {
  green: "Grün — keine Action",
  yellow: "Gelb — beobachten",
  orange: "Orange — proaktiv ansprechen",
  red: "Rot — Eskalation/Steering",
}

// PROJ-51-γ.2 — migrated to semantic risk tokens (see globals.css).
// `bg-{token}/10 text-{token} border-{token}/20` matches docs/design/
// design-system.md status-badge convention.
const BUCKET_CLASSES: Record<RiskBucket, string> = {
  green: "bg-risk-low/10 text-risk-low border-risk-low/20",
  yellow: "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
  orange: "bg-risk-high/10 text-risk-high border-risk-high/20",
  red: "bg-risk-critical/10 text-risk-critical border-risk-critical/20",
}

interface RiskBannerProps {
  result: RiskScoreBreakdown
}

export function RiskBanner({ result }: RiskBannerProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Stakeholder-Risiko</CardTitle>
            <CardDescription>
              Berechnet aus Influence × Impact × Haltung × Konflikt-Potenzial ×
              Big5 × Entscheidungs-Befugnis (deterministisch).
            </CardDescription>
          </div>
          <div
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${BUCKET_CLASSES[result.bucket]}`}
            aria-label={`Bucket ${result.bucket}`}
          >
            {BUCKET_LABEL[result.bucket]}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {result.score}
            </span>
            <span className="text-sm text-muted-foreground">/ 10</span>
          </div>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Score-Aufschlüsselung anzeigen"
              >
                <Info className="h-4 w-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="mb-1 font-medium">Faktor-Aufschlüsselung</p>
              <table className="text-xs">
                <tbody>
                  <FactorRow
                    label="Influence (norm)"
                    value={result.factors.influence_norm}
                  />
                  <FactorRow
                    label="Impact (norm)"
                    value={result.factors.impact_norm}
                  />
                  <FactorRow
                    label="Haltung"
                    value={result.factors.attitude_factor}
                  />
                  <FactorRow
                    label="Konflikt-Potenzial"
                    value={result.factors.conflict_factor}
                  />
                  <FactorRow
                    label="Entscheidungs-Befugnis"
                    value={result.factors.authority_factor}
                  />
                  <FactorRow
                    label="Big5-Modifier"
                    value={result.factors.big5_modifier}
                  />
                </tbody>
              </table>
              {result.big5_missing && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Big5-Profil unvollständig — Score ohne Verträglichkeits-
                  Modifier (= 1.0).
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  )
}

function FactorRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="pr-3 text-muted-foreground">{label}</td>
      <td className="text-right font-mono tabular-nums">{value}</td>
    </tr>
  )
}
