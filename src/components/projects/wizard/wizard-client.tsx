"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { useForm, FormProvider } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { useAuth } from "@/hooks/use-auth"
import { useWizardOverrides } from "@/hooks/use-wizard-overrides"
import { computeRules } from "@/lib/project-rules/engine"
import {
  DraftConflictError,
  discardDraft,
  finalizeDraft,
  getDraft,
  saveDraft,
} from "@/lib/wizard/draft-storage"
import {
  PROJECT_METHODS,
  type ProjectMethod,
} from "@/types/project-method"
import { PROJECT_TYPES, type ProjectType } from "@/types/project"
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  emptyWizardData,
  type WizardData,
  type WizardStep,
} from "@/types/wizard"

import { StepBasics } from "./step-basics"
import { StepFollowups } from "./step-followups"
import { StepMethod } from "./step-method"
import { StepReview } from "./step-review"
import { StepType } from "./step-type"
import { WizardStepper } from "./wizard-stepper"

const projectNumberPattern = /^[A-Za-z0-9-]+$/

const wizardSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(255),
  description: z.string().max(5000),
  project_number: z
    .string()
    .max(100)
    .refine(
      (val) => val === "" || projectNumberPattern.test(val),
      "Nur Buchstaben, Ziffern, Bindestriche"
    ),
  planned_start_date: z.string().nullable(),
  planned_end_date: z.string().nullable(),
  responsible_user_id: z.string().uuid("Projektleitung wählen"),
  project_type: z
    .enum(PROJECT_TYPES as unknown as [ProjectType, ...ProjectType[]])
    .nullable(),
  project_method: z
    .enum(PROJECT_METHODS as unknown as [ProjectMethod, ...ProjectMethod[]])
    .nullable(),
  type_specific_data: z.record(z.string(), z.string()),
})

interface WizardClientProps {
  draftId?: string
}

/**
 * Top-level orchestrator. Owns:
 * - the React Hook Form instance for the full wizard data
 * - current step navigation
 * - draft auto-save on Next/Back transitions
 * - per-step validation gating
 * - finalize → POST /api/projects (proper finalize endpoint comes in /backend)
 */
export function WizardClient({ draftId }: WizardClientProps) {
  const router = useRouter()
  const { user, currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  // PROJ-5 + PROJ-16 — fetch tenant-side overrides once. Fail-soft: if the
  // fetch errors (RLS, network), the wizard falls back to the unmodified
  // code catalog and never refuses to render.
  const overrides = useWizardOverrides()

  const [step, setStep] = React.useState<WizardStep>("basics")
  const [furthestStep, setFurthestStep] = React.useState<WizardStep>("basics")
  const [draftIdState, setDraftIdState] = React.useState<string | undefined>(
    draftId
  )
  const [lastSeenUpdatedAt, setLastSeenUpdatedAt] = React.useState<
    string | undefined
  >(undefined)
  const [conflict, setConflict] = React.useState<{
    draftId: string
    message: string
  } | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [savingDraft, setSavingDraft] = React.useState(false)

  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: emptyWizardData(user.id),
    mode: "onChange",
  })

  // Hydrate from existing draft if present.
  React.useEffect(() => {
    if (!draftId || !tenantId) return
    let cancelled = false
    void (async () => {
      try {
        const existing = await getDraft(draftId)
        if (cancelled) return
        if (existing) {
          form.reset(existing.data)
          setLastSeenUpdatedAt(existing.updated_at)
        } else {
          toast.error("Entwurf nicht gefunden", {
            description:
              "Der Entwurf wurde gelöscht oder gehört einem anderen Mandanten.",
          })
          router.replace("/projects/drafts")
        }
      } catch (err) {
        toast.error("Entwurf konnte nicht geladen werden", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draftId, tenantId, form, router])

  const persistDraft = React.useCallback(
    async (data: WizardData, options?: { silent?: boolean }) => {
      if (!tenantId) return null
      try {
        setSavingDraft(true)
        const saved = await saveDraft({
          id: draftIdState,
          tenantId,
          data,
          expectedUpdatedAt: draftIdState ? lastSeenUpdatedAt : undefined,
        })
        setDraftIdState(saved.id)
        setLastSeenUpdatedAt(saved.updated_at)
        setConflict(null)
        if (!options?.silent) {
          toast.success("Entwurf gespeichert")
        }
        return saved
      } catch (err) {
        if (err instanceof DraftConflictError) {
          setConflict({
            draftId: err.current.id,
            message: err.message,
          })
          toast.warning("Entwurf wurde anderswo geändert", {
            description:
              "Eine andere Sitzung hat eine neuere Version gespeichert.",
          })
        } else {
          toast.error("Entwurf konnte nicht gespeichert werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
        }
        return null
      } finally {
        setSavingDraft(false)
      }
    },
    [tenantId, draftIdState, lastSeenUpdatedAt]
  )

  const reloadFromConflict = React.useCallback(async () => {
    if (!conflict) return
    try {
      const fresh = await getDraft(conflict.draftId)
      if (fresh) {
        form.reset(fresh.data)
        setLastSeenUpdatedAt(fresh.updated_at)
        setConflict(null)
        toast.success("Neueste Version geladen")
      }
    } catch (err) {
      toast.error("Konnte neueste Version nicht laden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }, [conflict, form])

  const validateStep = React.useCallback(
    async (target: WizardStep): Promise<boolean> => {
      const data = form.getValues()
      switch (target) {
        case "basics": {
          const ok = await form.trigger([
            "name",
            "responsible_user_id",
            "planned_start_date",
            "planned_end_date",
            "project_number",
            "description",
          ])
          if (!ok) return false
          if (
            data.planned_start_date &&
            data.planned_end_date &&
            new Date(data.planned_end_date) <
              new Date(data.planned_start_date)
          ) {
            form.setError("planned_end_date", {
              type: "manual",
              message: "Endedatum muss am oder nach dem Startdatum liegen",
            })
            return false
          }
          return true
        }
        case "type": {
          if (!data.project_type) {
            form.setError("project_type", {
              type: "manual",
              message: "Projekttyp wählen",
            })
            return false
          }
          form.clearErrors("project_type")
          return true
        }
        case "method": {
          // method is optional — null is valid ("noch nicht festgelegt")
          return true
        }
        case "followups": {
          if (!data.project_type) return false
          const rules = computeRules(
            data.project_type,
            data.project_method,
            overrides.projectTypeOverrides.get(data.project_type) ?? null
          )
          let ok = true
          for (const info of rules.required_info) {
            const value = data.type_specific_data[info.key] ?? ""
            if (value.trim().length === 0) {
              form.setError(`type_specific_data.${info.key}` as const, {
                type: "manual",
                message: `${info.label_de} ist erforderlich`,
              })
              ok = false
            } else {
              form.clearErrors(
                `type_specific_data.${info.key}` as const
              )
            }
          }
          return ok
        }
        case "review":
          return true
      }
    },
    [form, overrides.projectTypeOverrides]
  )

  const goToStep = React.useCallback(
    async (target: WizardStep) => {
      const targetIndex = WIZARD_STEPS.indexOf(target)
      const currentIndex = WIZARD_STEPS.indexOf(step)
      if (targetIndex < currentIndex) {
        // backward — no validation, no save
        setStep(target)
        return
      }
      // forward — validate every step from current up to target-1
      for (let i = currentIndex; i < targetIndex; i++) {
        const ok = await validateStep(WIZARD_STEPS[i])
        if (!ok) {
          setStep(WIZARD_STEPS[i])
          return
        }
      }
      // auto-save on transition (silent)
      await persistDraft(form.getValues(), { silent: true })
      setStep(target)
      const newFurthestIndex = Math.max(
        WIZARD_STEPS.indexOf(furthestStep),
        targetIndex
      )
      setFurthestStep(WIZARD_STEPS[newFurthestIndex])
    },
    [step, validateStep, form, furthestStep, persistDraft]
  )

  const onCreate = React.useCallback(async () => {
    if (!tenantId) {
      toast.error("Kein aktiver Mandant ausgewählt")
      return
    }
    const data = form.getValues()
    if (!data.project_type) {
      toast.error("Projekttyp fehlt")
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    try {
      // Ensure the latest answers are in the server-side draft before finalizing.
      // The finalize endpoint reads the draft and uses it as the source of truth.
      // persistDraft handles conflict (409) detection and surfaces the banner;
      // returns null on error so we abort finalize.
      const draft = await persistDraft(data, { silent: true })
      if (!draft) {
        setSubmitting(false)
        return
      }
      const project = await finalizeDraft(draft.id)
      // PROJ-56-δ — handoff into the project-room with the
      // wizard-source flag so the Readiness-Checklist surfaces
      // its onboarding banner.
      toast.success("Projekt angelegt", {
        description:
          "Projekt-Setup-Checkliste prüfen, damit das Projekt steuerbar ist.",
      })
      router.replace(
        project?.id
          ? `/projects/${project.id}?from_wizard=1`
          : "/projects",
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unbekannter Fehler"
      setSubmitError(message)
      toast.error("Projekt konnte nicht angelegt werden", {
        description: message,
      })
      setSubmitting(false)
    }
  }, [form, tenantId, persistDraft, router])

  const onCancelClick = React.useCallback(() => {
    if (!form.formState.isDirty && !draftIdState) {
      router.push("/projects")
      return
    }
    setCancelOpen(true)
  }, [form.formState.isDirty, draftIdState, router])

  const onCancelDiscard = React.useCallback(async () => {
    if (!tenantId) return
    setCancelOpen(false)
    if (draftIdState) {
      try {
        await discardDraft(draftIdState)
        toast.success("Entwurf verworfen")
      } catch (err) {
        toast.error("Entwurf konnte nicht verworfen werden", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    }
    router.push("/projects")
  }, [tenantId, draftIdState, router])

  const onCancelSaveAndExit = React.useCallback(async () => {
    setCancelOpen(false)
    const data = form.getValues()
    const saved = await persistDraft(data, { silent: true })
    if (saved) {
      toast.success("Entwurf gespeichert")
      router.push("/projects/drafts")
    }
  }, [form, persistDraft, router])

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Kein aktiver Mandant ausgewählt.
        </CardContent>
      </Card>
    )
  }

  const currentIndex = WIZARD_STEPS.indexOf(step)
  const isLast = step === "review"
  const data = form.getValues()

  return (
    <FormProvider {...form}>
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>
            Neues Projekt — Schritt {currentIndex + 1} von {WIZARD_STEPS.length}
            {": "}
            <span className="text-muted-foreground font-normal">
              {WIZARD_STEP_LABELS[step]}
            </span>
          </CardTitle>
          <WizardStepper
            currentStep={step}
            furthestStep={furthestStep}
            onStepClick={(target) => void goToStep(target)}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {conflict ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Entwurf wurde anderswo geändert</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{conflict.message}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void reloadFromConflict()}
                >
                  Neueste Version laden
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {submitError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>Projekt konnte nicht angelegt werden</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{submitError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onCreate()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  Erneut versuchen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {step === "basics" ? (
            <StepBasics tenantId={tenantId} />
          ) : step === "type" ? (
            <StepType />
          ) : step === "method" ? (
            <StepMethod
              projectType={data.project_type}
              methodEnabled={overrides.methodEnabled}
              hasMethodOverrides={overrides.hasMethodOverrides}
            />
          ) : step === "followups" ? (
            <StepFollowups
              projectType={data.project_type as ProjectType}
              projectMethod={data.project_method}
              projectTypeOverride={
                data.project_type
                  ? overrides.projectTypeOverrides.get(data.project_type) ??
                    null
                  : null
              }
            />
          ) : (
            <StepReview
              projectTypeOverride={
                data.project_type
                  ? overrides.projectTypeOverrides.get(data.project_type) ??
                    null
                  : null
              }
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancelClick}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void persistDraft(form.getValues())}
                disabled={savingDraft || submitting}
              >
                {savingDraft ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="mr-2 h-4 w-4" aria-hidden />
                )}
                Entwurf speichern
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const prev = WIZARD_STEPS[currentIndex - 1]
                  if (prev) void goToStep(prev)
                }}
                disabled={currentIndex === 0 || submitting}
              >
                Zurück
              </Button>
              {isLast ? (
                <Button
                  type="button"
                  onClick={() => void onCreate()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Projekt anlegen
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    const next = WIZARD_STEPS[currentIndex + 1]
                    if (next) void goToStep(next)
                  }}
                  disabled={submitting}
                >
                  Weiter
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wizard abbrechen?</AlertDialogTitle>
            <AlertDialogDescription>
              Du hast Änderungen vorgenommen. Was soll mit dem aktuellen Stand
              passieren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
            <AlertDialogCancel className="sm:order-1">
              Weiter bearbeiten
            </AlertDialogCancel>
            <div className="flex flex-col gap-2 sm:order-2 sm:flex-row sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onCancelDiscard()}
              >
                Entwurf verwerfen
              </Button>
              <AlertDialogAction
                onClick={() => void onCancelSaveAndExit()}
              >
                Speichern & schließen
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  )
}
