"use client"

import { Sparkles } from "lucide-react"
import * as React from "react"

import { Progress } from "@/components/ui/progress"
import type {
  InteractionParticipant,
  ParticipantSignalSource,
} from "@/lib/stakeholder-interactions/api"

/**
 * PROJ-34-γ.2 — Per-participant pills strip for multi-stakeholder interactions.
 *
 * Replaces the single-participant `ParticipantSignalRow` (β) when an
 * interaction has more than one participant. Renders one row per
 * stakeholder with sentiment + cooperation pills and an AI-confidence
 * microbar (only when `_source` starts with `ai_`).
 *
 * Designer §A spec lines 63-67. Halo color matches the source state
 * (ai_proposed = primary, ai_accepted = success-green, ai_rejected =
 * muted-strike, manual = no halo).
 */

const PILL_TONE: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
  [-1]:
    "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  0: "bg-muted text-muted-foreground border-muted-foreground/20",
  1: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  2: "bg-emerald-600/20 text-emerald-800 border-emerald-600/40 dark:text-emerald-200",
}

const SENTIMENT_LABELS: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "Stark negativ",
  [-1]: "Negativ",
  0: "Neutral",
  1: "Positiv",
  2: "Stark positiv",
}

const COOPERATION_LABELS: Record<-2 | -1 | 0 | 1 | 2, string> = {
  [-2]: "Obstruktiv",
  [-1]: "Skeptisch",
  0: "Neutral",
  1: "Kooperativ",
  2: "Sehr kooperativ",
}

function SourceHalo({ source }: { source: ParticipantSignalSource | null }) {
  if (source !== "ai_proposed" && source !== "ai_accepted") return null
  return (
    <Sparkles
      className="h-3 w-3 shrink-0 text-primary"
      aria-label={
        source === "ai_proposed" ? "KI-Vorschlag, ungeprüft" : "KI-akzeptiert"
      }
    />
  )
}

function SignalChip({
  label,
  value,
  source,
  labels,
}: {
  label: string
  value: number | null
  source: ParticipantSignalSource | null
  labels: Record<-2 | -1 | 0 | 1 | 2, string>
}) {
  if (value == null) {
    return (
      <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground">
        {label}: —
      </span>
    )
  }
  const tone = PILL_TONE[value as -2 | -1 | 0 | 1 | 2]
  const halo =
    source === "ai_proposed"
      ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
      : ""
  const suffix =
    source === "ai_rejected"
      ? " ✗"
      : source === "ai_accepted"
        ? " ✓"
        : ""
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${tone} ${halo}`}
    >
      <SourceHalo source={source} />
      {label}: {labels[value as -2 | -1 | 0 | 1 | 2]}
      {suffix}
    </span>
  )
}

function ConfidenceMicrobar({ value }: { value: number | null | undefined }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  // Stub-fallback (γ.1) writes exactly 0.3 — show dashed border as a hint
  // that this is not a real confidence measurement (Designer §D matrix).
  const isStub = Math.abs(value - 0.3) < 0.01
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground ${
        isStub ? "rounded border border-dashed border-amber-500/50 px-1" : ""
      }`}
      aria-valuetext={`KI-Konfidenz ${pct} Prozent`}
    >
      <Progress
        value={pct}
        className="h-1.5 w-12"
        aria-label={`KI-Konfidenz ${pct} Prozent`}
      />
      <span>{pct}%</span>
    </span>
  )
}

interface ParticipantPillsStripProps {
  participants: InteractionParticipant[]
  stakeholderLabels: Map<string, string>
}

export function ParticipantPillsStrip({
  participants,
  stakeholderLabels,
}: ParticipantPillsStripProps) {
  if (participants.length === 0) return null
  return (
    <ul className="space-y-1 rounded-md border border-border/50 bg-muted/30 p-2">
      {participants.map((p) => {
        const isAI =
          p.participant_sentiment_source?.startsWith("ai_") ?? false
        const name = stakeholderLabels.get(p.stakeholder_id) ?? "Stakeholder"
        return (
          <li
            key={p.stakeholder_id}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <span className="min-w-[6rem] truncate font-medium">{name}</span>
            <SignalChip
              label="Stimmung"
              value={p.participant_sentiment}
              source={p.participant_sentiment_source}
              labels={SENTIMENT_LABELS}
            />
            <SignalChip
              label="Kooperation"
              value={p.participant_cooperation_signal}
              source={p.participant_cooperation_signal_source}
              labels={COOPERATION_LABELS}
            />
            {isAI ? (
              <ConfidenceMicrobar
                value={p.participant_sentiment_confidence}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
