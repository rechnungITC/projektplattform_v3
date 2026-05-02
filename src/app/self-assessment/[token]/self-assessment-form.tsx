"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  PERSONALITY_DIMENSION_DESCRIPTIONS,
  PERSONALITY_DIMENSION_LABELS,
  PERSONALITY_DIMENSIONS,
  SKILL_DIMENSION_LABELS,
  SKILL_DIMENSIONS,
} from "@/types/stakeholder-profile"

type SkillKey = (typeof SKILL_DIMENSIONS)[number]
type PersonalityKey = (typeof PERSONALITY_DIMENSIONS)[number]

type SkillState = Record<SkillKey, number | null>
type PersonalityState = Record<PersonalityKey, number | null>

const DEFAULT_SKILL: SkillState = SKILL_DIMENSIONS.reduce((acc, key) => {
  acc[key] = 50
  return acc
}, {} as SkillState)

const DEFAULT_PERSONALITY: PersonalityState = PERSONALITY_DIMENSIONS.reduce(
  (acc, key) => {
    acc[key] = 50
    return acc
  },
  {} as PersonalityState,
)

interface SelfAssessmentFormProps {
  token: string
  firstName: string
}

type ConfirmationState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted" }
  | { kind: "error"; message: string }

export function SelfAssessmentForm({
  token,
  firstName,
}: SelfAssessmentFormProps) {
  const [skill, setSkill] = React.useState<SkillState>(DEFAULT_SKILL)
  const [personality, setPersonality] =
    React.useState<PersonalityState>(DEFAULT_PERSONALITY)
  const [state, setState] = React.useState<ConfirmationState>({ kind: "idle" })

  if (state.kind === "submitted") {
    return (
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          </div>
          <CardTitle>Antwort gespeichert</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Vielen Dank, {firstName}. Ihre Selbst-Einschätzung ist gespeichert.
            Sie können dieses Fenster jetzt schließen.
          </p>
          <p className="text-xs text-muted-foreground">
            Die Antwort ist endgültig. Wenn Sie etwas korrigieren möchten,
            melden Sie sich bitte beim Projektmanager.
          </p>
        </CardContent>
      </Card>
    )
  }

  const submitting = state.kind === "submitting"

  const handleSkillChange = (key: SkillKey, value: number) => {
    setSkill((prev) => ({ ...prev, [key]: value }))
  }
  const handlePersonalityChange = (key: PersonalityKey, value: number) => {
    setPersonality((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    setState({ kind: "submitting" })
    try {
      const response = await fetch(
        `/api/self-assessment/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill, personality }),
        },
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      }
      setState({ kind: "submitted" })
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fachliche Einschätzung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {SKILL_DIMENSIONS.map((key) => (
            <SliderRow
              key={key}
              id={`skill-${key}`}
              label={SKILL_DIMENSION_LABELS[key]}
              value={skill[key]}
              onChange={(v) => handleSkillChange(key, v)}
              disabled={submitting}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Persönlichkeitseinschätzung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {PERSONALITY_DIMENSIONS.map((key) => (
            <SliderRow
              key={key}
              id={`personality-${key}`}
              label={PERSONALITY_DIMENSION_LABELS[key]}
              description={PERSONALITY_DIMENSION_DESCRIPTIONS[key]}
              value={personality[key]}
              onChange={(v) => handlePersonalityChange(key, v)}
              disabled={submitting}
            />
          ))}
        </CardContent>
      </Card>

      {state.kind === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Profil absenden
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Sobald Sie absenden, ist Ihre Antwort endgültig. Mehrfaches Klicken
        hat keine zusätzliche Wirkung.
      </p>
    </div>
  )
}

interface SliderRowProps {
  id: string
  label: string
  description?: string
  value: number | null
  onChange: (value: number) => void
  disabled?: boolean
}

function SliderRow({
  id,
  label,
  description,
  value,
  onChange,
  disabled,
}: SliderRowProps) {
  const numeric = value ?? 50
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span
          className="text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {numeric}
        </span>
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <Slider
        id={id}
        min={0}
        max={100}
        step={5}
        value={[numeric]}
        onValueChange={(v) => onChange(v[0] ?? 50)}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}
