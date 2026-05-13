"use client"

import {
  Check,
  Pencil,
  Sparkles,
  X,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type {
  CoachingDecision,
  CoachingRecommendation,
  CoachingRecommendationKind,
  CoachingReviewState,
} from "@/lib/stakeholder-coaching/api"

/**
 * PROJ-34-ε.ε — RecommendationCard.
 *
 * Renders one AI coaching recommendation with kind-badge, decision-chip,
 * cited interactions + profile fields, optional tonality hint, and the
 * Accept/Reject/Modify action row. Mirrors the γ.2 DecisionChip/ActionRow
 * visual pattern with a fresh content shape (text + citations vs sliders).
 */

const KIND_LABELS: Record<CoachingRecommendationKind, string> = {
  outreach: "Outreach",
  tonality: "Tonalität",
  escalation: "Eskalation",
  celebration: "Anerkennung",
}

const KIND_TONES: Record<CoachingRecommendationKind, string> = {
  outreach:
    "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  tonality:
    "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  escalation:
    "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
  celebration:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
}

function KindBadge({ kind }: { kind: CoachingRecommendationKind }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_TONES[kind]}`}
      data-testid={`kind-badge-${kind}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {KIND_LABELS[kind]}
    </span>
  )
}

function DecisionChip({ state }: { state: CoachingReviewState }) {
  if (state === "draft") {
    return <Badge variant="outline">offen</Badge>
  }
  if (state === "accepted") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200">
        <Check className="mr-1 h-3 w-3" aria-hidden /> übernommen
      </Badge>
    )
  }
  if (state === "rejected") {
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

interface RecommendationCardProps {
  recommendation: CoachingRecommendation
  /** Lookup for cited interaction labels (date + channel preview). */
  interactionLabelMap: Map<string, string>
  /** Lookup for cited profile-field human labels. */
  profileFieldLabelMap: Map<string, string>
  /** Disables actions when the user lacks edit permission. */
  canEdit: boolean
  /** Called with a decision when user clicks Accept/Reject/Save-Modify. */
  onDecision: (decision: CoachingDecision) => Promise<void> | void
}

export function RecommendationCard({
  recommendation,
  interactionLabelMap,
  profileFieldLabelMap,
  canEdit,
  onDecision,
}: RecommendationCardProps) {
  const r = recommendation
  const [modifying, setModifying] = React.useState(false)
  const [draftText, setDraftText] = React.useState(
    r.modified_text ?? r.recommendation_text,
  )
  const [submitting, setSubmitting] = React.useState(false)

  const tonalityHint = (r.prompt_context_meta as Record<string, unknown>)
    ?.tonality_hint
  const tonalityHintText =
    typeof tonalityHint === "string" && tonalityHint.length > 0
      ? tonalityHint
      : null
  const confidencePct =
    r.confidence == null ? null : Math.round(r.confidence * 100)
  const displayText =
    r.review_state === "modified" && r.modified_text
      ? r.modified_text
      : r.recommendation_text

  const callDecision = async (decision: CoachingDecision) => {
    setSubmitting(true)
    try {
      await onDecision(decision)
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onAccept = () =>
    callDecision({ recommendation_id: r.id, decision: "accept" })
  const onReject = () =>
    callDecision({ recommendation_id: r.id, decision: "reject" })
  const onSaveModify = async () => {
    const trimmed = draftText.trim()
    if (trimmed.length === 0) {
      toast.error("Geänderter Text darf nicht leer sein.")
      return
    }
    await callDecision({
      recommendation_id: r.id,
      decision: "modify",
      modified_text: trimmed,
    })
    setModifying(false)
  }

  return (
    <Card data-testid="coaching-recommendation-card" data-state={r.review_state}>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KindBadge kind={r.recommendation_kind} />
            <DecisionChip state={r.review_state} />
          </div>
          {r.provider ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              ✦ {r.provider}
              {confidencePct != null ? ` · ${confidencePct}%` : ""}
            </span>
          ) : null}
        </div>

        {modifying && r.review_state === "draft" ? (
          <div className="space-y-2">
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              maxLength={1000}
              rows={4}
              aria-label="Empfehlungstext bearbeiten"
            />
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {draftText.length} / 1000
            </p>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{displayText}</p>
        )}

        {r.cited_interaction_ids.length > 0 ||
        r.cited_profile_fields.length > 0 ? (
          <div className="space-y-1 rounded-md border border-dashed border-border/60 bg-muted/30 p-2 text-[11px]">
            {r.cited_interaction_ids.length > 0 ? (
              <div>
                <span className="uppercase tracking-wide text-muted-foreground">
                  Zitierte Interaktionen:{" "}
                </span>
                {r.cited_interaction_ids.map((iid) => (
                  <span
                    key={iid}
                    className="mr-1 inline-block rounded border bg-background px-1.5 py-0.5"
                    title={iid}
                  >
                    {interactionLabelMap.get(iid) ??
                      "(Quelle nicht mehr verfügbar)"}
                  </span>
                ))}
              </div>
            ) : null}
            {r.cited_profile_fields.length > 0 ? (
              <div>
                <span className="uppercase tracking-wide text-muted-foreground">
                  Zitierte Profile-Felder:{" "}
                </span>
                {r.cited_profile_fields.map((key) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="mr-1 text-[10px]"
                  >
                    {profileFieldLabelMap.get(key) ?? key}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tonalityHintText ? (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium">PROJ-35-Tonalität:</span>{" "}
            {tonalityHintText}
          </p>
        ) : null}

        {r.review_state === "draft" && canEdit ? (
          <div
            className="flex flex-wrap gap-2 pt-1"
            data-testid="recommendation-actions"
          >
            {modifying ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={onSaveModify}
                  disabled={submitting}
                  aria-label="Geänderten Text speichern"
                >
                  Speichern
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setModifying(false)
                    setDraftText(r.modified_text ?? r.recommendation_text)
                  }}
                  disabled={submitting}
                >
                  Abbrechen
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAccept}
                  disabled={submitting}
                  aria-label="Empfehlung übernehmen"
                >
                  Übernehmen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onReject}
                  disabled={submitting}
                  aria-label="Empfehlung ablehnen"
                >
                  Ablehnen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setModifying(true)}
                  disabled={submitting}
                  aria-label="Empfehlung anders formulieren"
                >
                  Anders formulieren
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
