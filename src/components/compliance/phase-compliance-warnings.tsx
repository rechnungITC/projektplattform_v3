"use client"

import { AlertTriangle } from "lucide-react"
import * as React from "react"

import { usePhaseComplianceWarnings } from "@/hooks/use-phase-compliance-warnings"

interface PhaseComplianceWarningsProps {
  projectId: string
  phaseId: string
}

export function PhaseComplianceWarnings({
  projectId,
  phaseId,
}: PhaseComplianceWarningsProps) {
  const { warnings, loading } = usePhaseComplianceWarnings(projectId, phaseId)

  if (loading) return null
  if (warnings.length === 0) return null

  return (
    <section
      aria-label="Compliance-Hinweise zur Phase"
      className="rounded-md border border-warning/20 bg-warning/10 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 text-warning"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-warning">
            Compliance-Hinweise ({warnings.length})
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-warning">
            {warnings.slice(0, 8).map((w, idx) => (
              <li key={`${w.tagKey}-${idx}`}>{w.message}</li>
            ))}
            {warnings.length > 8 ? (
              <li className="text-xs">
                … und {warnings.length - 8} weitere
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  )
}
