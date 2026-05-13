"use client"

import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * PROJ-34-γ.2 — AI-Vorschlag-Pill am InteractionItem-Header.
 *
 * Variants per Designer §D Edge-State Matrix
 * (docs/design/proj-34-gamma2-ai-review.md):
 *
 *   - `proposed`  · {n} offen          → primary-container, clickable
 *   - `stub`      · Lokaler Stub        → tertiary tone, distinguishes neutral
 *   - `loading`   · KI analysiert…     → animated, not clickable
 *   - `failed`    · KI fehlgeschlagen → error tone, clickable to retry
 *
 * Counter shrinks as decisions accumulate; when `pendingCount === 0` the
 * parent unmounts the Pill entirely.
 */

export type AIProposalPillVariant =
  | "proposed"
  | "stub"
  | "loading"
  | "failed"

interface AIProposalPillProps {
  variant: AIProposalPillVariant
  pendingCount: number
  onClick?: () => void
  onRetry?: () => void
  disabled?: boolean
  /** Reduced label for mobile (icon + counter only). */
  compact?: boolean
}

const VARIANT_STYLES: Record<AIProposalPillVariant, string> = {
  proposed:
    "bg-primary/15 text-primary border-primary/40 hover:bg-primary/25",
  stub:
    "bg-amber-500/15 text-amber-700 border-amber-500/40 hover:bg-amber-500/25 dark:text-amber-200",
  loading:
    "bg-muted text-muted-foreground border-muted-foreground/30 cursor-wait",
  failed:
    "bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/25",
}

export function AIProposalPill({
  variant,
  pendingCount,
  onClick,
  onRetry,
  disabled = false,
  compact = false,
}: AIProposalPillProps) {
  const labelText = labelFor(variant, pendingCount, compact)
  const isLoading = variant === "loading"

  const onPillClick = () => {
    if (variant === "failed" && onRetry) {
      onRetry()
    } else if (onClick) {
      onClick()
    }
  }
  const hasHandler =
    (variant === "failed" && onRetry !== undefined) || onClick !== undefined

  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors tabular-nums"
  const tone = VARIANT_STYLES[variant]
  const interactive = !isLoading && !disabled && hasHandler

  const pill = (
    <Button
      type="button"
      onClick={interactive ? onPillClick : undefined}
      disabled={disabled || isLoading}
      aria-label={ariaFor(variant, pendingCount)}
      data-variant={variant}
      data-testid="ai-proposal-pill"
      className={`${base} ${tone} h-auto disabled:opacity-100 ${
        interactive ? "cursor-pointer" : ""
      } ${disabled ? "cursor-not-allowed" : ""}`}
      variant="ghost"
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : variant === "proposed" ? (
        <Sparkles className="h-3 w-3" aria-hidden />
      ) : variant === "stub" ? (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      ) : (
        <RotateCcw className="h-3 w-3" aria-hidden />
      )}
      <span>{labelText}</span>
    </Button>
  )

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent>
          Nur Projekt-Manager dürfen KI-Vorschläge prüfen.
        </TooltipContent>
      </Tooltip>
    )
  }
  return pill
}

function labelFor(
  variant: AIProposalPillVariant,
  count: number,
  compact: boolean,
): string {
  if (compact) {
    if (variant === "loading") return "…"
    if (variant === "failed") return "↻"
    return String(count)
  }
  switch (variant) {
    case "proposed":
      return `KI-Vorschlag · ${count} offen`
    case "stub":
      return "Lokaler Stub · Review nötig"
    case "loading":
      return "KI analysiert…"
    case "failed":
      return "KI fehlgeschlagen · Wiederholen"
  }
}

function ariaFor(
  variant: AIProposalPillVariant,
  count: number,
): string {
  switch (variant) {
    case "proposed":
      return `KI-Vorschlag prüfen: ${count} ${count === 1 ? "Teilnehmer offen" : "Teilnehmer offen"}`
    case "stub":
      return "Lokaler Stub: KI-Provider fehlt, neutrale Platzhalter prüfen"
    case "loading":
      return "KI analysiert die Interaktion"
    case "failed":
      return "KI-Vorschlag fehlgeschlagen, wiederholen"
  }
}