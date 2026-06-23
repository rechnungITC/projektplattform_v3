"use client"

/**
 * PROJ-135 — Wizard step "Rückfragen" (dialogic clarifying questions).
 *
 * Appears only when a kickoff artefact was uploaded in the ki_backlog step
 * (AC-135.3). On entering, the step asks the AI (via the draft-scoped
 * `/api/wizard-drafts/[id]/clarifying-questions` endpoint) for 0–6 questions
 * about gaps in the kickoff, grounded in the Vorhaben. The user answers what
 * they want — every question is skippable and the whole step is skippable; it
 * NEVER blocks "Weiter" (AC-135.7).
 *
 * Answers are stored in the draft's `clarifying` block; on finalize the
 * backend appends the answered Q&A to the kickoff's content_excerpt so the
 * downstream PROJ-70/88/89 generation reads sharper input. The generated
 * questions are persisted too, so navigating back doesn't re-spend an AI call.
 *
 * Fail-open render states: loading (bounded ~20s), empty ("keine Rückfragen
 * nötig"), blocked ("lokaler Provider erforderlich"), error (+ retry).
 */

import * as React from "react"
import { useFormContext } from "react-hook-form"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { generateClarifyingQuestions } from "@/lib/ai-proposals/clarifying-questions-api"
import type {
  ClarifyingData,
  ClarifyingQuestionItem,
  ClarifyingStatus,
  WizardData,
} from "@/types/wizard"

interface StepClarifyingProps {
  /** The live draft id (set by the autosave that runs on entering this step).
   *  Undefined only in the unlikely case the autosave hasn't completed. */
  draftId?: string
}

type ViewStatus = ClarifyingStatus | "loading"

export function StepClarifying({ draftId }: StepClarifyingProps) {
  const form = useFormContext<WizardData>()

  // Lazy init from the persisted draft block (resume without re-generating).
  const initial = React.useMemo<ClarifyingData | undefined>(
    () => form.getValues().clarifying,
    [form],
  )
  const [questions, setQuestions] = React.useState<ClarifyingQuestionItem[]>(
    () => initial?.questions ?? [],
  )
  const [answers, setAnswers] = React.useState<string[]>(() =>
    (initial?.questions ?? []).map(
      (q) =>
        initial?.answers?.find((a) => a.question === q.question)?.answer ?? "",
    ),
  )
  const [skipped, setSkipped] = React.useState<boolean[]>(() =>
    (initial?.questions ?? []).map(() => false),
  )
  const [status, setStatus] = React.useState<ViewStatus>(
    () => initial?.status ?? (initial?.questions?.length ? "ready" : "idle"),
  )
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // Persist questions + the derived answers projection into the draft form so
  // the autosave / finalize sees them. Called from event handlers (never from
  // an effect) to stay clear of the React-Compiler set-state-in-effect rule.
  const syncForm = React.useCallback(
    (
      qs: ClarifyingQuestionItem[],
      ans: string[],
      skip: boolean[],
      st: ClarifyingStatus,
    ) => {
      const block: ClarifyingData = {
        questions: qs,
        answers: qs
          .map((q, i) => ({ q, i }))
          .filter(({ i }) => !skip[i] && ans[i]?.trim())
          .map(({ q, i }) => ({
            question: q.question,
            answer: ans[i].trim(),
            gap_tag: q.gap_tag,
          })),
        status: st,
      }
      form.setValue("clarifying", block, { shouldDirty: true })
    },
    [form],
  )

  const generate = React.useCallback(async () => {
    if (!draftId) {
      setStatus("error")
      setErrorMsg(
        "Entwurf wird noch gespeichert — bitte einen Moment warten und erneut versuchen.",
      )
      return
    }
    setStatus("loading")
    setErrorMsg(null)
    try {
      const result = await generateClarifyingQuestions(draftId, 5)
      if (result.external_blocked) {
        setQuestions([])
        setAnswers([])
        setSkipped([])
        setStatus("blocked")
        syncForm([], [], [], "blocked")
        return
      }
      const qs: ClarifyingQuestionItem[] = result.questions.map((q) => ({
        question: q.question,
        rationale: q.rationale,
        gap_tag: q.gap_tag,
      }))
      if (qs.length === 0) {
        setQuestions([])
        setAnswers([])
        setSkipped([])
        setStatus("empty")
        syncForm([], [], [], "empty")
        return
      }
      const freshAnswers = qs.map(() => "")
      const freshSkipped = qs.map(() => false)
      setQuestions(qs)
      setAnswers(freshAnswers)
      setSkipped(freshSkipped)
      setStatus("ready")
      syncForm(qs, freshAnswers, freshSkipped, "ready")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Unbekannter Fehler")
    }
  }, [draftId, syncForm])

  // Auto-generate once on entering the step when nothing was generated yet.
  const didAutoRun = React.useRef(false)
  React.useEffect(() => {
    if (didAutoRun.current) return
    if (status === "idle" && questions.length === 0 && draftId) {
      didAutoRun.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot clarifying generation when the step opens (PROJ-70-ε pattern)
      void generate()
    }
  }, [status, questions.length, draftId, generate])

  const onAnswerChange = (index: number, value: string) => {
    const next = answers.slice()
    next[index] = value
    setAnswers(next)
    syncForm(questions, next, skipped, "ready")
  }

  const onToggleSkip = (index: number) => {
    const nextSkip = skipped.slice()
    nextSkip[index] = !nextSkip[index]
    const nextAnswers = answers.slice()
    if (nextSkip[index]) nextAnswers[index] = "" // clear when skipping
    setSkipped(nextSkip)
    setAnswers(nextAnswers)
    syncForm(questions, nextAnswers, nextSkip, "ready")
  }

  const onSkipAll = () => {
    const allSkipped = questions.map(() => true)
    const cleared = questions.map(() => "")
    setSkipped(allSkipped)
    setAnswers(cleared)
    syncForm(questions, cleared, allSkipped, "ready")
  }

  const answeredCount = answers.filter((a, i) => !skipped[i] && a.trim()).length

  return (
    <div className="space-y-4" data-testid="wizard-clarifying-step">
      <div className="flex items-start gap-2 rounded-md border border-violet-400/30 bg-violet-500/5 p-3 text-sm text-violet-900 dark:text-violet-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
        <p>
          Die KI hat dein Kickoff-Dokument gelesen und stellt ein paar gezielte
          Rückfragen zu Lücken, die sie gefunden hat. Beantworte, was du
          möchtest — jede Frage ist <strong>optional</strong>. Deine Antworten
          schärfen die anschließende KI-Generierung von Backlog, Stakeholdern
          und Risiken. Du kannst den Schritt auch komplett überspringen.
        </p>
      </div>

      {status === "loading" && (
        <div
          className="flex items-center gap-2 rounded-md border bg-muted/10 p-6 text-sm text-muted-foreground"
          data-testid="wizard-clarifying-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Analysiere das Kickoff-Dokument … (bis ~20&nbsp;Sekunden)
        </div>
      )}

      {status === "empty" && (
        <div
          className="flex items-start gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-200"
          data-testid="wizard-clarifying-empty"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Keine Rückfragen nötig — das Kickoff-Dokument ist ausreichend klar.
            Du kannst direkt weiter.
          </p>
        </div>
      )}

      {status === "blocked" && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200"
          data-testid="wizard-clarifying-blocked"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Das Dokument enthält personenbezogene Daten (Class-3) und es ist
            kein mandanteneigenes lokales KI-Modell konfiguriert — die
            Rückfragen wurden übersprungen. Du kannst trotzdem weiter; die
            spätere Generierung respektiert dieselbe Class-3-Regel.
          </p>
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          data-testid="wizard-clarifying-error"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {errorMsg ?? "Rückfragen konnten nicht erzeugt werden."} Du kannst
              den Schritt überspringen oder es erneut versuchen.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void generate()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Erneut versuchen
          </Button>
        </div>
      )}

      {status === "ready" && questions.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {answeredCount} von {questions.length} beantwortet
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onSkipAll}
                data-testid="wizard-clarifying-skip-all"
              >
                Alle überspringen
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void generate()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Neu generieren
              </Button>
            </div>
          </div>

          <ul className="space-y-3" data-testid="wizard-clarifying-questions">
            {questions.map((q, i) => (
              <li
                key={`${i}-${q.question}`}
                className={`rounded-md border p-3 transition-opacity ${
                  skipped[i] ? "opacity-50" : ""
                }`}
                data-testid="wizard-clarifying-question"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {q.gap_tag && (
                        <Badge variant="secondary" className="text-[10px]">
                          {q.gap_tag}
                        </Badge>
                      )}
                      <span className="text-sm font-medium">{q.question}</span>
                    </div>
                    {q.rationale && (
                      <p className="text-xs text-muted-foreground">
                        {q.rationale}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    aria-pressed={skipped[i]}
                    onClick={() => onToggleSkip(i)}
                  >
                    {skipped[i] ? "Einbeziehen" : "Überspringen"}
                  </Button>
                </div>
                <Textarea
                  value={answers[i] ?? ""}
                  onChange={(e) => onAnswerChange(i, e.target.value)}
                  disabled={skipped[i]}
                  placeholder="Deine Antwort (optional) …"
                  rows={2}
                  data-testid="wizard-clarifying-answer"
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        Hinweis: Class-3-Inhalte (personenbezogene Daten) werden serverseitig
        erkannt und ausschließlich an ein mandanteneigenes lokales Modell
        geleitet — nie an ein externes Cloud-Modell. Das „Vorhaben“ bleibt
        unverändert; die Antworten werden nur dem Kickoff-Kontext hinzugefügt.
      </p>
    </div>
  )
}
