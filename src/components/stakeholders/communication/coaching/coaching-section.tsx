"use client"

import { Loader2, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  listCoachingRecommendations,
  submitCoachingReviewBatch,
  triggerCoachingGeneration,
  type CoachingDecision,
  type CoachingRecommendation,
} from "@/lib/stakeholder-coaching/api"
import type { StakeholderInteraction } from "@/lib/stakeholder-interactions/api"

import { RecommendationCard } from "./recommendation-card"

/**
 * PROJ-34-ε.ε — Coaching-Empfehlungen Section am Stakeholder-Detail-Tab.
 *
 * Liefert:
 *   - "✦ Coaching-Empfehlungen anfragen"-Button (Pull-Trigger, locked
 *     2026-05-13)
 *   - Counter "{n} offen"
 *   - Liste der draft/accepted/rejected/modified Recommendations
 *   - Per-Card Accept/Reject/Modify via γ.2-Reuse-Pattern
 *
 * Datenquellen werden auf Backend-Seite aggregiert; das Frontend
 * triggert und reviewt. External_blocked-Toast wenn kein AI-Provider.
 */

const PROFILE_FIELD_LABELS: Record<string, string> = {
  big5_openness: "Big5: Offenheit",
  big5_conscientiousness: "Big5: Gewissenhaftigkeit",
  big5_extraversion: "Big5: Extraversion",
  big5_agreeableness: "Big5: Verträglichkeit",
  big5_neuroticism: "Big5: Neurotizismus",
  skill_decision_power: "Skill: Entscheidungsmacht",
  skill_domain_knowledge: "Skill: Fachwissen",
  skill_it_affinity: "Skill: IT-Affinität",
  skill_method_competence: "Skill: Methodenkompetenz",
  skill_negotiation_skill: "Skill: Verhandlung",
  reasoning: "Begründung",
  attitude: "Haltung",
  management_level: "Management-Ebene",
  decision_authority: "Entscheidungsbefugnis",
  communication_need: "Kommunikationsbedarf",
  preferred_channel: "Bevorzugter Kanal",
  risk_score: "Risiko-Score",
  escalation_pattern: "Eskalations-Pattern",
  tonality_hint: "Tonalitäts-Hint",
}

interface CoachingSectionProps {
  projectId: string
  stakeholderId: string
  /** All interactions for this stakeholder — used to label cited IDs. */
  interactions: StakeholderInteraction[]
  /** Project-edit role gate (from useProjectAccess in parent). */
  canEdit: boolean
}

export function CoachingSection({
  projectId,
  stakeholderId,
  interactions,
  canEdit,
}: CoachingSectionProps) {
  const [recommendations, setRecommendations] = React.useState<
    CoachingRecommendation[] | null
  >(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [triggering, setTriggering] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    listCoachingRecommendations(projectId, stakeholderId)
      .then((rows) => {
        if (!cancelled) setRecommendations(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error("Coaching-Empfehlungen konnten nicht geladen werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          setRecommendations([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId, stakeholderId, reloadTick])

  const refresh = React.useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  const onTrigger = async () => {
    setTriggering(true)
    try {
      const out = await triggerCoachingGeneration(projectId, stakeholderId)
      if (out.run.status === "external_blocked") {
        toast.info("KI-Coaching nicht verfügbar", {
          description:
            "Kein kompatibler AI-Provider hinterlegt. Empfehlungen müssen manuell formuliert werden.",
        })
        refresh()
        return
      }
      if (out.recommendations.length === 0) {
        toast.info("Keine Empfehlungen erzeugt", {
          description:
            "Das Modell konnte aus dem aktuellen Kontext keine sinnvolle Empfehlung ableiten.",
        })
      } else {
        toast.success(
          `${out.recommendations.length} Coaching-Empfehlung${out.recommendations.length === 1 ? "" : "en"} generiert.`,
        )
      }
      refresh()
    } catch (err) {
      toast.error("Coaching-Anfrage fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setTriggering(false)
    }
  }

  const onDecision = React.useCallback(
    async (decision: CoachingDecision) => {
      await submitCoachingReviewBatch(projectId, stakeholderId, [decision])
      refresh()
    },
    [projectId, stakeholderId, refresh],
  )

  const interactionLabelMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const it of interactions) {
      const date = new Date(it.interaction_date).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
      map.set(it.id, `${date} · ${it.channel}`)
    }
    return map
  }, [interactions])

  const profileFieldLabelMap = React.useMemo(
    () => new Map<string, string>(Object.entries(PROFILE_FIELD_LABELS)),
    [],
  )

  const openCount = React.useMemo(
    () =>
      (recommendations ?? []).filter((r) => r.review_state === "draft").length,
    [recommendations],
  )

  return (
    <section
      className="space-y-2 rounded-lg border border-border/60 bg-card p-3"
      aria-labelledby="coaching-section-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3
            id="coaching-section-heading"
            className="text-sm font-semibold"
          >
            Coaching-Empfehlungen
          </h3>
          {openCount > 0 ? (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {openCount} offen
            </span>
          ) : null}
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onTrigger}
            disabled={triggering}
            aria-label="Coaching-Empfehlungen anfragen"
          >
            {triggering ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden />
            )}
            Coaching anfragen
          </Button>
        ) : null}
      </div>

      {recommendations == null ? (
        <p className="text-xs text-muted-foreground">Lade Empfehlungen…</p>
      ) : recommendations.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {canEdit
            ? "Noch keine Empfehlungen. '✦ Coaching anfragen' klicken."
            : "Noch keine Empfehlungen."}
        </p>
      ) : (
        <div className="space-y-2">
          {recommendations.map((r) => (
            <RecommendationCard
              key={r.id}
              recommendation={r}
              interactionLabelMap={interactionLabelMap}
              profileFieldLabelMap={profileFieldLabelMap}
              canEdit={canEdit}
              onDecision={onDecision}
            />
          ))}
        </div>
      )}
    </section>
  )
}
