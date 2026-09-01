"use client"

/**
 * PROJ-Y-5a — unified Project-context step.
 *
 * This frontend slice deliberately treats AI as optional. The draft always
 * captures the trusted wizard frame and manual answers; the following backend
 * stage may add adaptive questions, but can never become the only completion
 * path or establish canonical skill coverage.
 */

import {
  CheckCircle2,
  CircleHelp,
  FileText,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react"
import * as React from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { listSkills } from "@/lib/skills/api"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"
import {
  PROJECT_CONTEXT_COVERAGE_STATES,
  type ProjectContextCoverageState,
  type ProjectContextData,
  type ProjectContextSkillCoverage,
  type ProjectContextStatement,
} from "@/types/project-context"
import { PROJECT_TYPE_LABELS } from "@/types/project"
import type { Skill } from "@/types/skill"
import type { SkillWizardAssignment, WizardData } from "@/types/wizard"

const COVERAGE_LABELS: Record<ProjectContextCoverageState, string> = {
  needs_clarification: "Klärung nötig",
  sufficient: "Ausreichend bestätigt",
  unknown: "Unbekannt",
  not_applicable: "Nicht relevant",
  skipped: "Übersprungen",
}

const COVERAGE_BADGE_VARIANT: Record<
  ProjectContextCoverageState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  needs_clarification: "destructive",
  sufficient: "default",
  unknown: "secondary",
  not_applicable: "outline",
  skipped: "outline",
}

function coverageKey(row: ProjectContextSkillCoverage): string {
  return `${row.skill_id}:${row.skill_version_id ?? "unresolved"}`
}

/** Preserve history, mark removed/changed versions stale, add new snapshots. */
export function synchronizeSkillCoverage(
  existing: ProjectContextSkillCoverage[],
  assignments: SkillWizardAssignment[],
  catalog: Skill[],
): ProjectContextSkillCoverage[] {
  const selected = new Map(assignments.map((item) => [item.skill_id, item]))
  const skillById = new Map(catalog.map((skill) => [skill.id, skill]))
  const next = existing.map((row) => ({ ...row, stale: true }))

  for (const skillId of selected.keys()) {
    const skill = skillById.get(skillId)
    const versionId = skill?.current_version_id ?? null
    const exactIndex = next.findIndex(
      (row) =>
        row.skill_id === skillId && row.skill_version_id === versionId,
    )
    if (exactIndex >= 0) {
      next[exactIndex] = {
        ...next[exactIndex],
        skill_name: skill?.name ?? next[exactIndex].skill_name,
        stale: false,
      }
      continue
    }
    next.push({
      skill_id: skillId,
      skill_version_id: versionId,
      skill_name: skill?.name ?? "Skill wird aufgelöst",
      state: "needs_clarification",
      evidence_statement_ids: [],
      stale: false,
    })
  }

  return next
}

function buildFrameStatements(data: WizardData): ProjectContextStatement[] {
  const statements: ProjectContextStatement[] = []
  const add = (id: string, text: string, sourceLabel: string) => {
    if (!text.trim()) return
    statements.push({
      id: `frame:${id}`,
      text: text.trim(),
      origin: "wizard_selection",
      source_label: sourceLabel,
      confirmed: true,
      affected_skill_version_ids: [],
    })
  }

  add("name", data.name, "Projektname")
  add("description", data.description, "Vorhaben")
  if (data.project_type) {
    add("type", PROJECT_TYPE_LABELS[data.project_type], "Projekttyp")
  }
  if (data.project_method) {
    add("method", PROJECT_METHOD_LABELS[data.project_method], "Methode")
  }
  for (const [key, value] of Object.entries(data.type_specific_data)) {
    add(`detail:${key}`, value, "Bestätigte Detailangabe")
  }
  if (data.ki_backlog.context_source_id) {
    statements.push({
      id: `kickoff:${data.ki_backlog.context_source_id}`,
      text: data.ki_backlog.filename ?? "Kickoff-Dokument",
      origin: "kickoff_evidence",
      source_label: "Kickoff-Datei",
      confirmed: true,
      affected_skill_version_ids: [],
    })
  }
  return statements
}

function mergeTrustedFrame(
  context: ProjectContextData,
  data: WizardData,
): ProjectContextData {
  const retained = context.statements.filter(
    (statement) =>
      !statement.id.startsWith("frame:") &&
      !statement.id.startsWith("kickoff:"),
  )
  const legacyAnswers = data.clarifying?.answers ?? []
  const existingIds = new Set(retained.map((statement) => statement.id))
  const legacyStatements = legacyAnswers
    .map((answer, index): ProjectContextStatement => ({
      id: `legacy:${index}:${answer.question}`,
      text: answer.answer,
      origin: "user_answer",
      source_label: `Frühere Kickoff-Rückfrage: ${answer.question}`,
      confirmed: true,
      affected_skill_version_ids: [],
    }))
    .filter((statement) => !existingIds.has(statement.id))
  const existingTurnIds = new Set(context.turns.map((turn) => turn.id))
  const legacyTurns = legacyAnswers
    .flatMap((answer, index) => [
      {
        id: `legacy:${index}:question`,
        role: "assistant" as const,
        content: answer.question,
        status: "complete" as const,
      },
      {
        id: `legacy:${index}:answer`,
        role: "user" as const,
        content: answer.answer,
        status: "complete" as const,
      },
    ])
    .filter((turn) => !existingTurnIds.has(turn.id))

  return {
    ...context,
    statements: [
      ...buildFrameStatements(data),
      ...retained,
      ...legacyStatements,
    ],
    turns: [...context.turns, ...legacyTurns],
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

interface StepProjectContextProps {
  onRequestAiQuestion?: () => Promise<{
    question: string | null
    rationale: string | null
    reason_code: ProjectContextData["reason_code"]
  } | null>
}

export function StepProjectContext({ onRequestAiQuestion }: StepProjectContextProps = {}) {
  const form = useFormContext<WizardData>()
  const watchedContext = useWatch({
    control: form.control,
    name: "project_context",
  }) as ProjectContextData
  const watchedAssignments = useWatch({
    control: form.control,
    name: "skills.assignments",
  })
  const assignments = React.useMemo(
    () => watchedAssignments ?? [],
    [watchedAssignments],
  )
  const [catalog, setCatalog] = React.useState<Skill[]>([])
  const [catalogLoading, setCatalogLoading] = React.useState(true)
  const [catalogError, setCatalogError] = React.useState<string | null>(null)
  const [manualAnswer, setManualAnswer] = React.useState("")
  const [askingAi, setAskingAi] = React.useState(false)
  const [aiRationale, setAiRationale] = React.useState<string | null>(null)
  const idSequence = React.useRef(0)
  const idPrefix = React.useId()

  React.useEffect(() => {
    let cancelled = false
    void listSkills()
      .then((skills) => {
        if (!cancelled) setCatalog(skills)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCatalogError(
            error instanceof Error
              ? error.message
              : "Skill-Katalog konnte nicht geladen werden.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The step opens only after the frame was selected. Mirror that trusted
  // frame and the exact client-visible skill versions into the resumable draft.
  React.useEffect(() => {
    if (catalogLoading) return
    const current = form.getValues().project_context
    const framed = mergeTrustedFrame(current, form.getValues())
    const synchronized = {
      ...framed,
      skill_coverage: synchronizeSkillCoverage(
        framed.skill_coverage,
        assignments,
        catalog,
      ),
    }
    if (!sameValue(current, synchronized)) {
      form.setValue("project_context", synchronized, { shouldDirty: true })
    }
  }, [assignments, catalog, catalogLoading, form])

  const context = watchedContext
  const currentCoverage = context.skill_coverage.filter((row) => !row.stale)
  const resolvedCoverage = currentCoverage.filter(
    (row) => row.state !== "needs_clarification",
  ).length
  const coveragePercent =
    currentCoverage.length === 0
      ? 100
      : Math.round((resolvedCoverage / currentCoverage.length) * 100)
  const unresolved = currentCoverage.filter(
    (row) => row.state === "needs_clarification",
  )

  const updateContext = (next: ProjectContextData) => {
    form.setValue("project_context", next, { shouldDirty: true })
  }

  const addManualAnswer = () => {
    const text = manualAnswer.trim()
    if (!text) return
    idSequence.current += 1
    const id = `manual:${idPrefix}:${idSequence.current}`
    const affectedVersions = unresolved
      .map((row) => row.skill_version_id)
      .filter((value): value is string => Boolean(value))
    const statement: ProjectContextStatement = {
      id,
      text,
      origin: "user_answer",
      source_label: "Manuelle Eingabe",
      confirmed: true,
      affected_skill_version_ids: affectedVersions,
    }
    updateContext({
      ...context,
      summary: context.summary.trim()
        ? `${context.summary.trim()}\n\n${text}`
        : text,
      statements: [...context.statements, statement],
      turns: [
        ...context.turns,
        {
          id: `${id}:turn`,
          role: "user",
          content: text,
          status: "complete",
        },
      ],
      finished: false,
    })
    setManualAnswer("")
  }

  const setCoverageState = (
    target: ProjectContextSkillCoverage,
    state: ProjectContextCoverageState,
  ) => {
    const evidence =
      state === "sufficient"
        ? context.statements
            .filter((statement) => statement.confirmed)
            .map((statement) => statement.id)
        : target.evidence_statement_ids
    updateContext({
      ...context,
      skill_coverage: context.skill_coverage.map((row) =>
        coverageKey(row) === coverageKey(target)
          ? { ...row, state, evidence_statement_ids: evidence }
          : row,
      ),
      finished: false,
    })
  }

  const finishWithDocumentedGaps = () => {
    const skippedNames = unresolved.map((row) => row.skill_name)
    updateContext({
      ...context,
      skill_coverage: context.skill_coverage.map((row) =>
        !row.stale && row.state === "needs_clarification"
          ? { ...row, state: "skipped" }
          : row,
      ),
      gaps: [
        ...new Set([
          ...context.gaps,
          ...skippedNames.map(
            (name) => `Kontextabdeckung für „${name}“ blieb offen.`,
          ),
        ]),
      ],
      finished: true,
    })
  }

  const askAi = async () => {
    if (!onRequestAiQuestion) return
    setAskingAi(true)
    try {
      const result = await onRequestAiQuestion()
      setAiRationale(result?.rationale ?? null)
    } finally {
      setAskingAi(false)
    }
  }

  const latestAiQuestion = [...context.turns]
    .reverse()
    .find((turn) => turn.role === "assistant" && turn.status === "complete")

  return (
    <div className="space-y-5" data-testid="wizard-project-context-step">
      <Alert>
        <Sparkles className="h-4 w-4" aria-hidden />
        <AlertTitle>Ein gemeinsamer Projektkontext</AlertTitle>
        <AlertDescription>
          Hier laufen Stammdaten, Detail-Fragen, ausgewählte Skills und ein
          optionales Kickoff zusammen. Du entscheidest, ob die Abdeckung
          ausreicht. Offene Punkte blockieren die Projektanlage nicht.
        </AlertDescription>
      </Alert>

      <Alert variant="default" data-testid="project-context-manual-status">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <AlertTitle>Manuelle Erfassung aktiv</AlertTitle>
        <AlertDescription>
          Der Kontext wird vollständig dokumentiert, auch wenn keine
          KI-Analyse erfolgt. Er wird deshalb ehrlich als „erfasst, nicht
          KI-analysiert“ gekennzeichnet.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" aria-hidden />
            Bereits bekannter Kontext
          </CardTitle>
        </CardHeader>
        <CardContent>
          {context.statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Der bestätigte Wizard-Rahmen wird vorbereitet …
            </p>
          ) : (
            <ul className="space-y-3">
              {context.statements.map((statement) => (
                <li
                  key={statement.id}
                  className="rounded-md border bg-muted/20 p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{statement.source_label}</Badge>
                    {statement.origin === "ai_interpretation" ? (
                      <Badge variant="secondary">KI-Interpretation</Badge>
                    ) : (
                      <Badge variant="secondary">Bestätigte Quelle</Badge>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">
                    {statement.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-4 w-4" aria-hidden />
            Projektkontext ergänzen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestAiQuestion ? (
            <Alert>
              <Sparkles className="h-4 w-4" aria-hidden />
              <AlertTitle>Aktuelle Klärungsfrage</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>{latestAiQuestion.content}</p>
                {aiRationale ? (
                  <p className="text-xs text-muted-foreground">{aiRationale}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <div>
            <p className="text-sm font-medium">
              Was sollte das Projektteam zusätzlich wissen?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Klärbereich: {unresolved.length > 0 ? "ausgewählte Skills" : "gemeinsamer Projektkontext"}
              {unresolved.length > 0
                ? ` — ${unresolved.map((row) => row.skill_name).join(", ")}`
                : ""}
            </p>
          </div>
          <Textarea
            value={manualAnswer}
            onChange={(event) => setManualAnswer(event.target.value)}
            placeholder="Ziele, Grenzen, Begriffe, Annahmen oder noch offene Entscheidungen …"
            rows={4}
            maxLength={10000}
            aria-label="Projektkontext ergänzen"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {manualAnswer.length} / 10.000 Zeichen
            </span>
            <div className="flex flex-wrap gap-2">
              {onRequestAiQuestion ? (
                <Button type="button" variant="outline" onClick={() => void askAi()} disabled={askingAi}>
                  {askingAi ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Nächste KI-Frage
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={addManualAnswer}
                disabled={!manualAnswer.trim()}
              >
                Aussage übernehmen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Skill-Abdeckung</CardTitle>
            <Badge variant="outline">
              {resolvedCoverage} / {currentCoverage.length} geklärt
            </Badge>
          </div>
          <Progress value={coveragePercent} aria-label="Skill-Abdeckung" />
        </CardHeader>
        <CardContent>
          {catalogLoading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : catalogError ? (
            <Alert variant="destructive" role="alert">
              <CircleHelp className="h-4 w-4" aria-hidden />
              <AlertTitle>Skill-Versionen nicht auflösbar</AlertTitle>
              <AlertDescription>
                {catalogError} Deine manuellen Eingaben bleiben erhalten; die
                Versionen werden vor der Anlage serverseitig erneut geprüft.
              </AlertDescription>
            </Alert>
          ) : currentCoverage.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm font-medium">Keine Skills ausgewählt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Gemeinsamer Projektkontext kann trotzdem dokumentiert werden.
                Es wird keine Skill-Abdeckung erfunden.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {currentCoverage.map((row) => (
                <li
                  key={coverageKey(row)}
                  className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_220px] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.skill_name}</span>
                      <Badge variant={COVERAGE_BADGE_VARIANT[row.state]}>
                        {COVERAGE_LABELS[row.state]}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Version: {row.skill_version_id ?? "wird serverseitig aufgelöst"}
                    </p>
                  </div>
                  <Select
                    value={row.state}
                    onValueChange={(value) =>
                      setCoverageState(
                        row,
                        value as ProjectContextCoverageState,
                      )
                    }
                  >
                    <SelectTrigger aria-label={`Abdeckung für ${row.skill_name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CONTEXT_COVERAGE_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {COVERAGE_LABELS[state]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-xl text-xs text-muted-foreground">
              Nur deine Auswahl ändert den bestätigten Zustand. Eine spätere
              KI-Empfehlung darf „Ausreichend bestätigt“ nicht selbst setzen.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={finishWithDocumentedGaps}
              disabled={unresolved.length === 0 && context.finished}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
              {unresolved.length > 0
                ? "Beenden und Lücken dokumentieren"
                : "Kontextdialog abschließen"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
