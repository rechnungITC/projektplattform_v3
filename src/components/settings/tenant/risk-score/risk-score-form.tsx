"use client"

import { Loader2, RotateCcw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  resetRiskScoreOverrides,
  updateRiskScoreOverrides,
  type RiskScoreSettings,
} from "@/lib/risk-score/api"
import type { RiskScoreConfig } from "@/lib/risk-score/defaults"
import {
  riskScoreOverridesSchema,
} from "@/lib/risk-score/merge-overrides"

import {
  formStateToOverrides,
  type BucketKey,
  type FormState,
  type ScalarKey,
} from "./form-state"

/**
 * Controlled form. Owner of the state is the page-client (so the live-preview
 * can read the same source of truth without a save round-trip — Bug-3 fix).
 */
interface RiskScoreFormProps {
  tenantId: string
  defaults: RiskScoreConfig
  formState: FormState
  setFormState: React.Dispatch<React.SetStateAction<FormState>>
  onSettingsChanged: (next: RiskScoreSettings) => void
}

interface BucketField {
  key: string
  label: string
}

interface BucketGroup {
  group: BucketKey
  title: string
  description: string
  fields: BucketField[]
}

const ATTITUDE_GROUP: BucketGroup = {
  group: "attitude_factor",
  title: "Haltung (attitude)",
  description:
    "Multiplikatoren je nach Haltung des Stakeholders gegenüber dem Projekt.",
  fields: [
    { key: "supportive", label: "Unterstützend" },
    { key: "neutral", label: "Neutral" },
    { key: "critical", label: "Kritisch" },
    { key: "blocking", label: "Blockierend" },
  ],
}

const CONFLICT_GROUP: BucketGroup = {
  group: "conflict_factor",
  title: "Konflikt-Potenzial",
  description: "Multiplikatoren je nach Konflikt-Bereitschaft.",
  fields: [
    { key: "low", label: "Gering" },
    { key: "medium", label: "Mittel" },
    { key: "high", label: "Hoch" },
    { key: "critical", label: "Kritisch" },
  ],
}

const AUTHORITY_GROUP: BucketGroup = {
  group: "authority_factor",
  title: "Entscheidungs-Befugnis",
  description:
    "Multiplikatoren je nach formaler Entscheidungs-Macht des Stakeholders.",
  fields: [
    { key: "none", label: "Keine" },
    { key: "advisory", label: "Beratend" },
    { key: "recommending", label: "Empfehlend" },
    { key: "deciding", label: "Entscheidend" },
  ],
}

const INFLUENCE_NORM_GROUP: BucketGroup = {
  group: "influence_norm",
  title: "Influence-Norm",
  description:
    "Normalisierungs-Werte (0..1) für die Influence-Stufen. Wirken multiplikativ mit Influence-Weight.",
  fields: [
    { key: "low", label: "Niedrig" },
    { key: "medium", label: "Mittel" },
    { key: "high", label: "Hoch" },
    { key: "critical", label: "Kritisch" },
  ],
}

const IMPACT_NORM_GROUP: BucketGroup = {
  group: "impact_norm",
  title: "Impact-Norm",
  description:
    "Normalisierungs-Werte (0..1) für die Impact-Stufen. Wirken multiplikativ mit Impact-Weight.",
  fields: [
    { key: "low", label: "Niedrig" },
    { key: "medium", label: "Mittel" },
    { key: "high", label: "Hoch" },
    { key: "critical", label: "Kritisch" },
  ],
}

export function RiskScoreForm({
  tenantId,
  defaults,
  formState,
  setFormState,
  onSettingsChanged,
}: RiskScoreFormProps) {
  const [submitting, setSubmitting] = React.useState<"save" | "reset" | null>(
    null,
  )
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  )
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false)

  const handleSave = async () => {
    const overrides = formStateToOverrides(formState)
    const parsed = riskScoreOverridesSchema.safeParse(overrides)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setValidationError(first?.message ?? "Ungültige Eingabe.")
      return
    }
    setValidationError(null)
    setSubmitting("save")
    try {
      const next = await updateRiskScoreOverrides(tenantId, parsed.data)
      onSettingsChanged(next)
      toast.success("Risk-Score-Konfiguration gespeichert")
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(null)
    }
  }

  const handleResetConfirmed = async () => {
    setResetDialogOpen(false)
    setSubmitting("reset")
    try {
      const next = await resetRiskScoreOverrides(tenantId)
      onSettingsChanged(next)
      toast.success("Override-Werte zurückgesetzt — Defaults aktiv")
    } catch (err) {
      toast.error("Zurücksetzen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(null)
    }
  }

  // Bug-7 fix: clear validation error as soon as the user types again.
  const clearValidationOnEdit = () => {
    if (validationError) setValidationError(null)
  }

  const updateBucket = (group: BucketKey, key: string, value: string) => {
    clearValidationOnEdit()
    setFormState((s) => ({
      ...s,
      [group]: { ...s[group], [key]: value },
    }))
  }

  const updateScalar = (key: ScalarKey, value: string) => {
    clearValidationOnEdit()
    setFormState((s) => ({ ...s, [key]: value }))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Skalare Multiplikatoren</CardTitle>
          <CardDescription>
            Übergreifende Faktoren. Leer lassen für System-Default. Range 0..10.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScalarInput
            label="Influence-Weight"
            id="influence_weight"
            value={formState.influence_weight}
            placeholder={String(defaults.influence_weight)}
            onChange={(v) => updateScalar("influence_weight", v)}
            disabled={submitting !== null}
          />
          <ScalarInput
            label="Impact-Weight"
            id="impact_weight"
            value={formState.impact_weight}
            placeholder={String(defaults.impact_weight)}
            onChange={(v) => updateScalar("impact_weight", v)}
            disabled={submitting !== null}
          />
          <ScalarInput
            label="Adversity-Weight (Big5-Modifier)"
            id="adversity_weight"
            value={formState.adversity_weight}
            placeholder={String(defaults.adversity_weight)}
            onChange={(v) => updateScalar("adversity_weight", v)}
            disabled={submitting !== null}
          />
        </CardContent>
      </Card>

      <BucketCard
        group={ATTITUDE_GROUP}
        values={formState.attitude_factor}
        defaults={defaults.attitude_factor as unknown as Record<string, number>}
        disabled={submitting !== null}
        onChange={(k, v) => updateBucket("attitude_factor", k, v)}
      />
      <BucketCard
        group={CONFLICT_GROUP}
        values={formState.conflict_factor}
        defaults={defaults.conflict_factor as unknown as Record<string, number>}
        disabled={submitting !== null}
        onChange={(k, v) => updateBucket("conflict_factor", k, v)}
      />
      <BucketCard
        group={AUTHORITY_GROUP}
        values={formState.authority_factor}
        defaults={defaults.authority_factor as unknown as Record<string, number>}
        disabled={submitting !== null}
        onChange={(k, v) => updateBucket("authority_factor", k, v)}
      />
      <BucketCard
        group={INFLUENCE_NORM_GROUP}
        values={formState.influence_norm}
        defaults={defaults.influence_norm as unknown as Record<string, number>}
        disabled={submitting !== null}
        onChange={(k, v) => updateBucket("influence_norm", k, v)}
      />
      <BucketCard
        group={IMPACT_NORM_GROUP}
        values={formState.impact_norm}
        defaults={defaults.impact_norm as unknown as Record<string, number>}
        disabled={submitting !== null}
        onChange={(k, v) => updateBucket("impact_norm", k, v)}
      />

      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setResetDialogOpen(true)}
          disabled={submitting !== null}
        >
          {submitting === "reset" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
          )}
          Auf Defaults zurücksetzen
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={submitting !== null}
        >
          {submitting === "save" && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Konfiguration speichern
        </Button>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Override-Werte zurücksetzen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle tenant-spezifischen Multiplikator-Overrides werden gelöscht.
              Die System-Defaults werden wieder aktiv. Diese Aktion ist nicht
              umkehrbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting !== null}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetConfirmed}
              disabled={submitting !== null}
            >
              Zurücksetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ScalarInputProps {
  label: string
  id: string
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}

function ScalarInput({
  label,
  id,
  value,
  placeholder,
  disabled,
  onChange,
}: ScalarInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={0.1}
        min={0}
        max={10}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

interface BucketCardProps {
  group: BucketGroup
  values: Record<string, string>
  defaults: Record<string, number>
  disabled: boolean
  onChange: (key: string, value: string) => void
}

function BucketCard({
  group,
  values,
  defaults,
  disabled,
  onChange,
}: BucketCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.title}</CardTitle>
        <CardDescription>{group.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {group.fields.map((f) => (
          <ScalarInput
            key={f.key}
            label={f.label}
            id={`${group.group}-${f.key}`}
            value={values[f.key] ?? ""}
            placeholder={String(defaults[f.key] ?? "")}
            disabled={disabled}
            onChange={(v) => onChange(f.key, v)}
          />
        ))}
      </CardContent>
    </Card>
  )
}
