"use client"

/**
 * PROJ-65 ε.1 — node-side badges (F-PROJ-65-9 + F-PROJ-65-10).
 *
 * - RiskDecisionBadgeGroup: top-right corner; risk (round) + decision
 *   (rotated-square / diamond) counters. Click delegates to caller.
 * - AIRecommendationBadge: bottom-right corner; subtle violet sparkle
 *   with reduced-motion-aware pulse.
 *
 * Rendered inside the SVG as nested HTML in a `foreignObject` would be
 * brittle for layout — instead these are positioned as absolute HTML
 * elements over the SVG by the parent component.
 */
import * as React from "react"
import { Sparkles } from "lucide-react"

interface RiskDecisionBadgeGroupProps {
  riskCount: number
  decisionCount: number
  /** Highest risk severity for tone: 'high' | 'medium' | 'low' | null */
  riskSeverity?: "high" | "medium" | "low" | null
  onClickRisk?: () => void
  onClickDecision?: () => void
}

export function RiskDecisionBadgeGroup({
  riskCount,
  decisionCount,
  riskSeverity = null,
  onClickRisk,
  onClickDecision,
}: RiskDecisionBadgeGroupProps) {
  if (riskCount === 0 && decisionCount === 0) return null

  const riskClass =
    riskSeverity === "high"
      ? "bg-red-500/90 border-red-300 text-white"
      : riskSeverity === "medium"
        ? "bg-amber-500/90 border-amber-200 text-white"
        : "bg-slate-500/80 border-slate-300 text-white"

  return (
    <div
      className="pointer-events-auto flex items-center gap-1"
      data-testid="risk-decision-badge-group"
    >
      {riskCount > 0 && (
        <button
          type="button"
          onClick={onClickRisk}
          aria-label={`${riskCount} Risiko${riskCount === 1 ? "" : "s"}`}
          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold leading-none shadow-sm transition-transform hover:scale-110 ${riskClass}`}
        >
          {riskCount > 9 ? "9+" : riskCount}
        </button>
      )}
      {decisionCount > 0 && (
        <button
          type="button"
          onClick={onClickDecision}
          aria-label={`${decisionCount} Entscheidung${decisionCount === 1 ? "" : "en"}`}
          className="flex h-4 w-4 rotate-45 items-center justify-center border border-sky-300 bg-sky-500/90 text-[9px] font-semibold leading-none text-white shadow-sm transition-transform hover:scale-110"
        >
          <span className="-rotate-45">
            {decisionCount > 9 ? "9+" : decisionCount}
          </span>
        </button>
      )}
    </div>
  )
}

interface AIRecommendationBadgeProps {
  count: number
  reducedMotion?: boolean
  onClick?: () => void
}

export function AIRecommendationBadge({
  count,
  reducedMotion = false,
  onClick,
}: AIRecommendationBadgeProps) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} KI-Vorschlag${count === 1 ? "" : "e"}`}
      className={`pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-full border border-violet-300 bg-violet-500/30 text-white shadow-sm transition-transform hover:scale-110 ${
        reducedMotion ? "shadow-[0_0_4px_rgba(167,139,250,0.4)]" : "animate-pulse"
      }`}
      data-testid="ai-recommendation-badge"
    >
      <Sparkles className="h-2.5 w-2.5 text-violet-100" aria-hidden />
      {count > 1 && (
        <span className="ml-0.5 text-[8px] font-semibold leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  )
}
