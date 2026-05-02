"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  updatePersonalityProfile,
  updateSkillProfile,
} from "@/lib/stakeholder-profiles/api"
import {
  PERSONALITY_DIMENSIONS,
  PERSONALITY_DIMENSION_DESCRIPTIONS,
  PERSONALITY_DIMENSION_LABELS,
  SKILL_DIMENSIONS,
  SKILL_DIMENSION_LABELS,
  type StakeholderPersonalityProfile,
  type StakeholderSkillProfile,
} from "@/types/stakeholder-profile"

/**
 * PROJ-33 Phase 33-γ — Edit-Sheet für PM-Fremd-Bewertung.
 *
 * Two-Tab-Form: Skill (5 Slider) + Big5 (5 Slider mit Tooltips).
 * Saves via 2 separate PUTs (skill/personality), but both fire from one
 * "Speichern"-Button.
 */

interface ProfileEditSheetProps {
  projectId: string
  stakeholderId: string
  stakeholderName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSkill: StakeholderSkillProfile | null
  initialPersonality: StakeholderPersonalityProfile | null
  onSaved: () => void
}

type SkillState = Record<(typeof SKILL_DIMENSIONS)[number], number | null>
type PersonalityState = Record<
  (typeof PERSONALITY_DIMENSIONS)[number],
  number | null
>

export function ProfileEditSheet({
  projectId,
  stakeholderId,
  stakeholderName,
  open,
  onOpenChange,
  initialSkill,
  initialPersonality,
  onSaved,
}: ProfileEditSheetProps) {
  const [skill, setSkill] = React.useState<SkillState>(() =>
    extractSkill(initialSkill),
  )
  const [personality, setPersonality] = React.useState<PersonalityState>(() =>
    extractPersonality(initialPersonality),
  )
  const [submitting, setSubmitting] = React.useState(false)

  // Reset state when sheet opens with new data
  React.useEffect(() => {
    if (open) {
      setSkill(extractSkill(initialSkill))
      setPersonality(extractPersonality(initialPersonality))
    }
  }, [open, initialSkill, initialPersonality])

  const handleSave = async () => {
    setSubmitting(true)
    try {
      await Promise.all([
        updateSkillProfile(projectId, stakeholderId, {
          domain_knowledge_fremd: skill.domain_knowledge,
          method_competence_fremd: skill.method_competence,
          it_affinity_fremd: skill.it_affinity,
          negotiation_skill_fremd: skill.negotiation_skill,
          decision_power_fremd: skill.decision_power,
        }),
        updatePersonalityProfile(projectId, stakeholderId, {
          openness_fremd: personality.openness,
          conscientiousness_fremd: personality.conscientiousness,
          extraversion_fremd: personality.extraversion,
          agreeableness_fremd: personality.agreeableness,
          emotional_stability_fremd: personality.emotional_stability,
        }),
      ])
      toast.success(`Profil von „${stakeholderName}" gespeichert`)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>Profil bearbeiten: {stakeholderName}</SheetTitle>
          <SheetDescription>
            PM-Fremdbewertung. Selbsteinschätzung des Stakeholders folgt in
            Phase 33-δ via Magic-Link.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <Tabs defaultValue="skill">
            <TabsList className="w-full">
              <TabsTrigger value="skill" className="flex-1">
                Skill (fachlich)
              </TabsTrigger>
              <TabsTrigger value="personality" className="flex-1">
                Persönlichkeit (Big5)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="skill" className="space-y-5 pt-5">
              {SKILL_DIMENSIONS.map((dim) => (
                <SliderRow
                  key={dim}
                  label={SKILL_DIMENSION_LABELS[dim]}
                  value={skill[dim]}
                  onChange={(v) => setSkill((s) => ({ ...s, [dim]: v }))}
                  disabled={submitting}
                />
              ))}
            </TabsContent>

            <TabsContent value="personality" className="space-y-5 pt-5">
              {PERSONALITY_DIMENSIONS.map((dim) => (
                <SliderRow
                  key={dim}
                  label={PERSONALITY_DIMENSION_LABELS[dim]}
                  description={PERSONALITY_DIMENSION_DESCRIPTIONS[dim]}
                  value={personality[dim]}
                  onChange={(v) =>
                    setPersonality((s) => ({ ...s, [dim]: v }))
                  }
                  disabled={submitting}
                />
              ))}
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Speichern …
              </>
            ) : (
              "Speichern"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface SliderRowProps {
  label: string
  description?: string
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}

function SliderRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: SliderRowProps) {
  const numeric = value ?? 50
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">{label}</Label>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Erklärung zu ${label}`}
                  className="rounded-full border h-4 w-4 text-[10px] leading-none text-muted-foreground hover:bg-muted"
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums w-10 text-right">
            {value === null ? "—" : value}
          </span>
          {value !== null && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => onChange(null)}
              disabled={disabled}
            >
              clear
            </button>
          )}
        </div>
      </div>
      <Slider
        value={[numeric]}
        onValueChange={([v]) => onChange(v ?? 0)}
        min={0}
        max={100}
        step={5}
        disabled={disabled}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

function extractSkill(p: StakeholderSkillProfile | null): SkillState {
  return {
    domain_knowledge: p?.domain_knowledge_fremd ?? null,
    method_competence: p?.method_competence_fremd ?? null,
    it_affinity: p?.it_affinity_fremd ?? null,
    negotiation_skill: p?.negotiation_skill_fremd ?? null,
    decision_power: p?.decision_power_fremd ?? null,
  }
}

function extractPersonality(
  p: StakeholderPersonalityProfile | null,
): PersonalityState {
  return {
    openness: p?.openness_fremd ?? null,
    conscientiousness: p?.conscientiousness_fremd ?? null,
    extraversion: p?.extraversion_fremd ?? null,
    agreeableness: p?.agreeableness_fremd ?? null,
    emotional_stability: p?.emotional_stability_fremd ?? null,
  }
}
