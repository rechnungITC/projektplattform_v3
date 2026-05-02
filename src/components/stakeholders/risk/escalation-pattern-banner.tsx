"use client"

import { AlertTriangle, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  ESCALATION_PATTERN_META,
  type EscalationPatternKey,
} from "@/lib/risk-score/escalation-patterns"

interface EscalationPatternBannerProps {
  patterns: EscalationPatternKey[]
}

/**
 * Renders one Alert per active escalation pattern, sorted by severity DESC.
 * Severity ≥ 4 → destructive variant; otherwise default.
 */
export function EscalationPatternBanner({
  patterns,
}: EscalationPatternBannerProps) {
  if (patterns.length === 0) return null

  const sorted = [...patterns]
    .map((key) => ESCALATION_PATTERN_META[key])
    .sort((a, b) => b.severity - a.severity)

  return (
    <div className="space-y-2">
      {sorted.map((meta) => {
        const isHighSeverity = meta.severity >= 4
        const Icon = isHighSeverity ? ShieldAlert : AlertTriangle
        return (
          <Alert
            key={meta.key}
            variant={isHighSeverity ? "destructive" : "default"}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <AlertTitle>{meta.label}</AlertTitle>
            <AlertDescription>{meta.recommendation}</AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
