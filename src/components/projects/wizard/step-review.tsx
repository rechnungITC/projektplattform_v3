"use client"

import { useFormContext } from "react-hook-form"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { parseLocalDate } from "@/lib/dates/iso-date"
import { computeRules } from "@/lib/project-rules/engine"
import type { ProjectTypeOverrideFields } from "@/types/master-data"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"
import { PROJECT_TYPE_LABELS } from "@/types/project"
import type { WizardData } from "@/types/wizard"

function formatDate(iso: string | null): string {
  const d = parseLocalDate(iso)
  if (!d) return "—"
  return d.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

interface StepReviewProps {
  /** PROJ-16 tenant-side override for the chosen project-type, or null. */
  projectTypeOverride?: ProjectTypeOverrideFields | null
}

export function StepReview({ projectTypeOverride }: StepReviewProps = {}) {
  const form = useFormContext<WizardData>()
  const data = form.getValues()

  const typeLabel =
    data.project_type !== null ? PROJECT_TYPE_LABELS[data.project_type] : "—"
  const methodLabel = data.project_method
    ? PROJECT_METHOD_LABELS[data.project_method]
    : "Noch nicht festgelegt"

  const rules =
    data.project_type !== null
      ? computeRules(
          data.project_type,
          data.project_method,
          projectTypeOverride ?? null
        )
      : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name" value={data.name || "—"} />
          <Row label="Projektnummer" value={data.project_number || "—"} />
          <Row
            label="Beschreibung"
            value={data.description || "—"}
            multiline
          />
          <Row
            label="Geplanter Start"
            value={formatDate(data.planned_start_date)}
          />
          <Row
            label="Geplantes Ende"
            value={formatDate(data.planned_end_date)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Typ &amp; Methode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Projekttyp" value={typeLabel} />
          <Row label="Methode" value={methodLabel} />
        </CardContent>
      </Card>

      {rules && rules.required_info.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detail-Fragen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rules.required_info.map((field) => (
              <Row
                key={field.key}
                label={field.label_de}
                value={data.type_specific_data[field.key] || "—"}
                multiline
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={multiline ? "whitespace-pre-wrap" : ""}>{value}</dd>
    </div>
  )
}
