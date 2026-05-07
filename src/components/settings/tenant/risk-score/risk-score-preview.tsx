"use client"

import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { computeRiskScore } from "@/lib/risk-score/compute"
import type {
  Attitude,
  ConflictPotential,
  DecisionAuthority,
  Impact,
  Influence,
  RiskBucket,
  RiskScoreConfig,
} from "@/lib/risk-score/defaults"

const INFLUENCE_OPTS: Influence[] = ["low", "medium", "high", "critical"]
const IMPACT_OPTS: Impact[] = ["low", "medium", "high", "critical"]
const ATTITUDE_OPTS: Attitude[] = [
  "supportive",
  "neutral",
  "critical",
  "blocking",
]
const CONFLICT_OPTS: ConflictPotential[] = ["low", "medium", "high", "critical"]
const AUTHORITY_OPTS: DecisionAuthority[] = [
  "none",
  "advisory",
  "recommending",
  "deciding",
]

interface PreviewState {
  influence: Influence
  impact: Impact
  attitude: Attitude
  conflict_potential: ConflictPotential
  decision_authority: DecisionAuthority
  agreeableness_fremd: number
}

const INITIAL_STATE: PreviewState = {
  influence: "high",
  impact: "high",
  attitude: "critical",
  conflict_potential: "high",
  decision_authority: "deciding",
  agreeableness_fremd: 30,
}

const BUCKET_LABEL: Record<RiskBucket, string> = {
  green: "Grün — keine Action",
  yellow: "Gelb — beobachten",
  orange: "Orange — proaktiv ansprechen",
  red: "Rot — Eskalation",
}

// PROJ-51-γ.2 — migrated to semantic risk tokens.
const BUCKET_CLASSES: Record<RiskBucket, string> = {
  green: "bg-risk-low/10 text-risk-low border-risk-low/20",
  yellow: "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
  orange: "bg-risk-high/10 text-risk-high border-risk-high/20",
  red: "bg-risk-critical/10 text-risk-critical border-risk-critical/20",
}

interface RiskScorePreviewProps {
  effectiveConfig: RiskScoreConfig
}

export function RiskScorePreview({ effectiveConfig }: RiskScorePreviewProps) {
  const [state, setState] = React.useState<PreviewState>(INITIAL_STATE)

  const result = React.useMemo(
    () => computeRiskScore(state, effectiveConfig),
    [state, effectiveConfig],
  )

  const update = <K extends keyof PreviewState>(key: K, value: PreviewState[K]) => {
    setState((s) => ({ ...s, [key]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live-Preview</CardTitle>
        <CardDescription>
          Hypothetisches Stakeholder-Profil — die Werte rechts oben aktualisieren
          sich live mit jeder Multiplikator-Änderung im Form. Werte hier sind
          nur für die Vorschau, sie werden nirgendwo gespeichert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Risk-Score
            </p>
            <p className="text-3xl font-semibold tabular-nums">{result.score}</p>
            <p className="text-xs text-muted-foreground">
              Faktoren: inf {result.factors.influence_norm} · imp{" "}
              {result.factors.impact_norm} · att {result.factors.attitude_factor} ·
              cnf {result.factors.conflict_factor} · auth{" "}
              {result.factors.authority_factor} · big5 {result.factors.big5_modifier}
            </p>
          </div>
          <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${BUCKET_CLASSES[result.bucket]}`}
            aria-label={`Bucket ${result.bucket}`}
          >
            {BUCKET_LABEL[result.bucket]}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldSelect
            label="Einfluss"
            value={state.influence}
            options={INFLUENCE_OPTS}
            onChange={(v) => update("influence", v as Influence)}
          />
          <FieldSelect
            label="Impact"
            value={state.impact}
            options={IMPACT_OPTS}
            onChange={(v) => update("impact", v as Impact)}
          />
          <FieldSelect
            label="Haltung (attitude)"
            value={state.attitude}
            options={ATTITUDE_OPTS}
            onChange={(v) => update("attitude", v as Attitude)}
          />
          <FieldSelect
            label="Konflikt-Potenzial"
            value={state.conflict_potential}
            options={CONFLICT_OPTS}
            onChange={(v) =>
              update("conflict_potential", v as ConflictPotential)
            }
          />
          <FieldSelect
            label="Entscheidungs-Befugnis"
            value={state.decision_authority}
            options={AUTHORITY_OPTS}
            onChange={(v) =>
              update("decision_authority", v as DecisionAuthority)
            }
          />
          <div className="space-y-1.5">
            <Label htmlFor="preview-agreeableness">
              Verträglichkeit (fremd) — {state.agreeableness_fremd}
            </Label>
            <Slider
              id="preview-agreeableness"
              min={0}
              max={100}
              step={5}
              value={[state.agreeableness_fremd]}
              onValueChange={(v) =>
                update("agreeableness_fremd", v[0] ?? 50)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface FieldSelectProps {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}

function FieldSelect({ label, value, options, onChange }: FieldSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
