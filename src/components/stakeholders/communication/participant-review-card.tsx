"use client"

import { Check, ChevronDown, ChevronUp, Pencil, X } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import type {
  InteractionParticipant,
} from "@/lib/stakeholder-interactions/api"

/**
 * PROJ-34-γ.2 — Per-Participant Review-Card inside AIReviewSheet.
 *
 * Stacked vertically (Designer D3). After the 3rd card the parent renders
 * collapsed cards; this component exposes that via `collapsedByDefault`.
 *
 * Local decision state is owned by the parent Sheet; the card only reports
 * changes via `onChange`.
 */

export type CardDecision =
  | { kind: "open" }
  | { kind: "accept" }
  | { kind: "reject" }
  | { kind: "modify"; sentiment: number; cooperation: number }

interface ParticipantReviewCardProps {
  participant: InteractionParticipant
  stakeholderName: string
  decision: CardDecision
  onChange: (next: CardDecision) => void
  collapsedByDefault?: boolean
}

const SLIDER_STOPS = [-2, -1, 0, 1, 2] as const

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

function DecisionChip({ decision }: { decision: CardDecision }) {
  if (decision.kind === "open") {
    return <Badge variant="outline">offen</Badge>
  }
  if (decision.kind === "accept") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200">
        <Check className="mr-1 h-3 w-3" aria-hidden /> übernommen
      </Badge>
    )
  }
  if (decision.kind === "reject") {
    return (
      <Badge variant="secondary">
        <X className="mr-1 h-3 w-3" aria-hidden /> abgelehnt
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-amber-500/20 text-amber-800">
      <Pencil className="mr-1 h-3 w-3" aria-hidden /> geändert
    </Badge>
  )
}

export function ParticipantReviewCard({
  participant,
  stakeholderName,
  decision,
  onChange,
  collapsedByDefault = false,
}: ParticipantReviewCardProps) {
  // Auto-collapse on decision unless the user explicitly toggled. `null`
  // means "follow the auto rule" (collapsedByDefault OR decision !== open).
  const [userToggled, setUserToggled] = React.useState<boolean | null>(null)
  const autoCollapsed = collapsedByDefault || decision.kind !== "open"
  const collapsed = userToggled ?? autoCollapsed
  const onToggleCollapse = () => setUserToggled(!collapsed)

  const aiSentiment = participant.participant_sentiment ?? 0
  const aiCooperation = participant.participant_cooperation_signal ?? 0
  const currentSentiment =
    decision.kind === "modify" ? decision.sentiment : aiSentiment
  const currentCooperation =
    decision.kind === "modify" ? decision.cooperation : aiCooperation

  const confidence = participant.participant_sentiment_confidence ?? null
  const pct = confidence == null ? null : Math.round(confidence * 100)

  const onAccept = () => onChange({ kind: "accept" })
  const onReject = () => onChange({ kind: "reject" })
  const onModify = () =>
    onChange({
      kind: "modify",
      sentiment: currentSentiment,
      cooperation: currentCooperation,
    })

  const setSentiment = (v: number) =>
    onChange({
      kind: "modify",
      sentiment: v,
      cooperation: currentCooperation,
    })
  const setCooperation = (v: number) =>
    onChange({
      kind: "modify",
      sentiment: currentSentiment,
      cooperation: v,
    })

  return (
    <Card data-testid="participant-review-card" data-decision={decision.kind}>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{stakeholderName}</span>
            <DecisionChip decision={decision} />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Aufklappen" : "Einklappen"}
            className="h-7 w-7"
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>

        {collapsed ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Vorschlag: {formatSigned(currentSentiment)} /{" "}
            {formatSigned(currentCooperation)}
            {pct == null ? "" : ` · ${pct}%`}
          </p>
        ) : (
          <>
            <SliderRow
              label="Stimmung"
              value={currentSentiment}
              onChange={setSentiment}
              labels={SENTIMENT_LABELS}
              disabled={decision.kind === "reject"}
            />
            <SliderRow
              label="Kooperation"
              value={currentCooperation}
              onChange={setCooperation}
              labels={COOPERATION_LABELS}
              disabled={decision.kind === "reject"}
            />
            {pct != null ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>KI-Konfidenz</span>
                <Progress
                  value={pct}
                  className="h-1.5 w-24"
                  aria-label={`KI-Konfidenz ${pct} Prozent`}
                />
                <span className="tabular-nums">{pct}%</span>
                {pct < 50 ? (
                  <span aria-label="niedrige Konfidenz">⚠ niedrig</span>
                ) : null}
              </div>
            ) : null}
            <div
              className="flex flex-wrap gap-2 pt-1"
              data-testid="review-actions"
            >
              <Button
                type="button"
                size="sm"
                variant={decision.kind === "accept" ? "default" : "outline"}
                onClick={onAccept}
                aria-label={`Vorschlag für ${stakeholderName} übernehmen`}
              >
                Übernehmen
              </Button>
              <Button
                type="button"
                size="sm"
                variant={decision.kind === "reject" ? "default" : "outline"}
                onClick={onReject}
                aria-label={`Vorschlag für ${stakeholderName} ablehnen`}
              >
                Ablehnen
              </Button>
              <Button
                type="button"
                size="sm"
                variant={decision.kind === "modify" ? "default" : "outline"}
                onClick={onModify}
                aria-label={`Vorschlag für ${stakeholderName} ändern`}
              >
                Anders bewerten
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SliderRow({
  label,
  value,
  onChange,
  labels,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  labels: Record<-2 | -1 | 0 | 1 | 2, string>
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(v) => {
          if (v) onChange(Number(v))
        }}
        disabled={disabled}
        className="justify-start"
      >
        {SLIDER_STOPS.map((stop) => (
          <ToggleGroupItem
            key={stop}
            value={String(stop)}
            aria-label={`${label} ${formatSigned(stop)}: ${labels[stop]}`}
            className="h-7 px-2 text-[11px]"
          >
            {formatSigned(stop)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function formatSigned(v: number): string {
  if (v > 0) return `+${v}`
  return String(v)
}
