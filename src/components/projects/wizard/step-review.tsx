"use client"

import { AlertTriangle, CheckCircle2, FileCheck2 } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { parseLocalDate } from "@/lib/dates/iso-date"
import { computeRules } from "@/lib/project-rules/engine"
import type { ProjectTypeOverrideFields } from "@/types/master-data"
import { isAutoSource } from "@/types/project-skill"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"
import { PROJECT_TYPE_LABELS } from "@/types/project"
import type { WizardData } from "@/types/wizard"

const REVIEW_COVERAGE_LABELS = {
  needs_clarification: "Klärung nötig",
  sufficient: "Ausreichend bestätigt",
  unknown: "Unbekannt",
  not_applicable: "Nicht relevant",
  skipped: "Übersprungen",
} as const

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
  const projectContext = useWatch({
    control: form.control,
    name: "project_context",
  })

  const typeLabel =
    data.project_type !== null ? PROJECT_TYPE_LABELS[data.project_type] : "—"
  const methodLabel = data.project_method
    ? PROJECT_METHOD_LABELS[data.project_method]
    : "Noch nicht festgelegt"

  // PROJ-78 — defensive read: drafts created before this step exist without
  // the `skills` block.
  const skillAssignments = data.skills?.assignments ?? []
  const autoSkillCount = skillAssignments.filter((a) =>
    isAutoSource(a.assignment_source),
  ).length

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

      {/* PROJ-78 — the skill set chosen in the "Skills" step. Zero skills is a
          valid outcome, so the card renders an explicit "keine" instead of
          being hidden. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Skills ({skillAssignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {skillAssignments.length === 0 ? (
            <Row
              label="Zugeordnet"
              value="Keine — im Projektraum unter „Projekt-Skills“ nachtragbar"
            />
          ) : (
            <Row
              label="Zugeordnet"
              value={`${skillAssignments.length} Skill(s) — davon ${autoSkillCount} automatisch vorgeschlagen`}
            />
          )}
        </CardContent>
      </Card>

      {/* PROJ-70-ε (AC-ε2) — surface the uploaded kickoff artefact so the
          user knows a KI-Backlog run will start after the project is
          created. */}
      {data.ki_backlog?.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">KI-Backlog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.ki_backlog.context_source_id ? (
              <Row
                label="Kickoff-Datei"
                value={`${data.ki_backlog.filename ?? "hochgeladen"} — KI-Backlog wird nach dem Anlegen generiert`}
              />
            ) : (
              <Row
                label="Kickoff-Datei"
                value="Keine Datei hochgeladen — Schritt wird übersprungen"
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="wizard-review-project-context">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-4 w-4" aria-hidden />
            Projektkontext
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            {projectContext.analysis_status === "ai_analyzed" ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden />
            )}
            <AlertTitle>
              {projectContext.analysis_status === "ai_analyzed"
                ? "KI-Analyse liegt vor"
                : "Erfasst, nicht KI-analysiert"}
            </AlertTitle>
            <AlertDescription>
              Die Dokumentation wird unabhängig vom Analyse-Status zusammen
              mit dem Projekt angelegt. KI-Interpretationen gelten nie als
              bestätigte Stammdaten.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label htmlFor="project-context-summary" className="text-sm font-medium">
              Bestätigte Zusammenfassung
            </label>
            <Textarea
              id="project-context-summary"
              value={projectContext.summary}
              onChange={(event) =>
                form.setValue("project_context.summary", event.target.value, {
                  shouldDirty: true,
                })
              }
              placeholder="Die bestätigte Zusammenfassung kann vor der Anlage ergänzt werden."
              rows={5}
              maxLength={20000}
            />
            <p className="text-xs text-muted-foreground">
              Änderungen hier betreffen die Dokumentation, nicht automatisch
              die Projekt-Stammdaten.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Skill-Abdeckung</h3>
            {projectContext.skill_coverage.filter((row) => !row.stale).length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Skills ausgewählt — keine Skill-Abdeckung bewertet.
              </p>
            ) : (
              <ul className="space-y-2">
                {projectContext.skill_coverage
                  .filter((row) => !row.stale)
                  .map((row) => (
                    <li
                      key={`${row.skill_id}:${row.skill_version_id ?? "unresolved"}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <span>{row.skill_name}</span>
                      <Badge
                        variant={
                          row.state === "sufficient" ? "default" : "secondary"
                        }
                      >
                        {REVIEW_COVERAGE_LABELS[row.state]}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {projectContext.gaps.length > 0 ||
          projectContext.assumptions.length > 0 ||
          projectContext.contradictions.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <ReviewList title="Offene Lücken" items={projectContext.gaps} />
              <ReviewList title="Annahmen" items={projectContext.assumptions} />
              <ReviewList
                title="Widersprüche"
                items={projectContext.contradictions}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Quellen &amp; Herkunft</h3>
            <ul className="space-y-2">
              {projectContext.statements.map((statement) => (
                <li key={statement.id} className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Badge variant="outline">{statement.source_label}</Badge>
                    <Badge variant="secondary">
                      {statement.origin === "ai_interpretation"
                        ? "KI-Interpretation — zu bestätigen"
                        : "Bestätigte Quelle"}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap">{statement.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Keine</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
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
