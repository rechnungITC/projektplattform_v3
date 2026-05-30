"use client"

/**
 * PROJ-65 ε.3a — GoalDetailPanel.
 *
 * Right Sheet sm:max-w-md with inline GoalEditForm + GoalStatsCard +
 * DetachedGoalBadge + DeleteGoalButton. Form is always in edit-mode;
 * Save enabled only when dirty + valid. Delete is soft (deleted_at);
 * Sonner toast carries 30 s "Rückgängig" action.
 *
 * NO plan-mutate UI — that lives in ε.3b.
 */

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, ChevronDown, Loader2, Target, Trash2 } from "lucide-react"
import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

import { ClassThreeFootnote, ClassThreeLock } from "../stakeholder/class-three-lock"
import {
  SourceRefCombobox,
  type SourceRefOption,
  type SourceRefValue,
} from "./source-ref-combobox"

export const GoalStatus = z.enum(["draft", "active", "achieved", "abandoned"])

export const GoalFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Mindestens 3 Zeichen.")
    .max(200, "Maximal 200 Zeichen."),
  description: z.string().max(2000).optional().or(z.literal("")),
  success_criteria: z.string().max(2000).optional().or(z.literal("")),
  target_date: z.string().optional().or(z.literal("")),
  status: GoalStatus,
  parent_goal_id: z.string().nullable().optional(),
  source_ref: z.object({
    kind: z.enum(["phase", "milestone", "none"]),
    id: z.string().nullable(),
  }),
  /**
   * B-1 — auto-pull target_date from selected source. When true, the
   * date input is read-only and shows "(auto aus Quelle)". The actual
   * server-side fill happens via the source-ref fallback in PATCH; this
   * toggle is currently a visual hint without separate persistence.
   */
  auto_pull_date: z.boolean(),
})

export type GoalFormValues = z.infer<typeof GoalFormSchema>

export interface GoalDetailPanelGoal {
  id: string
  title: string
  description: string | null
  success_criteria: string | null
  target_date: string | null
  status: z.infer<typeof GoalStatus>
  parent_goal_id: string | null
  source_phase_id: string | null
  source_milestone_id: string | null
  is_detached: boolean
}

export interface GoalStatNode {
  id: string
  label: string
  status: string
  is_critical: boolean
  href?: string | null
}

interface GoalDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  goal: GoalDetailPanelGoal | null
  phases: SourceRefOption[]
  milestones: SourceRefOption[]
  parentGoals: Array<{ id: string; title: string }>
  /** All goals with parent ref — used to render sub-goal tree (B-3). */
  allGoals?: Array<{ id: string; title: string; parent_goal_id?: string | null }>
  /** Open work_items on the green path that anchor to this goal. */
  openGreenPathNodes: GoalStatNode[]
  /** Sum of `story_points` of open green-path work_items (null when not aggregatable). */
  estimatedEffortPt: number | null
  /** Critical-path nodes that are also on the green path. */
  criticalOnGreenPath: number
  costClearView: boolean
  canEdit?: boolean
  onSaved: () => void
  onDeleted: () => void
  onOpenNode?: (nodeId: string) => void
  onCreateSubGoal?: () => void
  /** Navigate to another goal (used by sub-goal tree clicks). */
  onOpenGoal?: (goalId: string) => void
}

export function GoalDetailPanel({
  open,
  onOpenChange,
  projectId,
  goal,
  phases,
  milestones,
  parentGoals,
  allGoals,
  openGreenPathNodes,
  estimatedEffortPt,
  criticalOnGreenPath,
  costClearView,
  canEdit = true,
  onSaved,
  onDeleted,
  onOpenNode,
  onCreateSubGoal,
  onOpenGoal,
}: GoalDetailPanelProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [packagesExpanded, setPackagesExpanded] = React.useState(false)

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(GoalFormSchema),
    defaultValues: {
      title: "",
      description: "",
      success_criteria: "",
      target_date: "",
      status: "draft",
      parent_goal_id: null,
      source_ref: { kind: "none", id: null },
      auto_pull_date: false,
    },
  })

  // PROJ-67 AC-4 — `useWatch` is memoisation-safe; `form.watch(...)` in
  // JSX makes React Compiler skip optimisation for this component.
  const watchedSourceRefKind = useWatch({
    control: form.control,
    name: "source_ref.kind",
  })
  const watchedAutoPullDate = useWatch({
    control: form.control,
    name: "auto_pull_date",
  })

  React.useEffect(() => {
    if (!goal) return
    const sourceRef: SourceRefValue = goal.source_phase_id
      ? { kind: "phase", id: goal.source_phase_id }
      : goal.source_milestone_id
        ? { kind: "milestone", id: goal.source_milestone_id }
        : { kind: "none", id: null }
    form.reset({
      title: goal.title,
      description: goal.description ?? "",
      success_criteria: goal.success_criteria ?? "",
      target_date: goal.target_date ?? "",
      status: goal.status,
      parent_goal_id: goal.parent_goal_id,
      source_ref: sourceRef,
      auto_pull_date: sourceRef.kind !== "none" && !goal.target_date,
    })
  }, [goal, form])

  if (!goal) return null

  const isDirty = form.formState.isDirty
  const isValid = form.formState.isValid
  const hasMaskedEffort = !costClearView && estimatedEffortPt != null

  async function onSubmit(values: GoalFormValues) {
    if (!goal) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        title: values.title,
        description: values.description || null,
        success_criteria: values.success_criteria || null,
        target_date: values.target_date || null,
        status: values.status,
        parent_goal_id: values.parent_goal_id ?? null,
        source_phase_id:
          values.source_ref.kind === "phase" ? values.source_ref.id : null,
        source_milestone_id:
          values.source_ref.kind === "milestone" ? values.source_ref.id : null,
      }
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/goals/${encodeURIComponent(goal.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const errBody = (await res.json()) as {
            error?: { message?: string }
          }
          msg = errBody.error?.message ?? msg
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      toast.success("Ziel gespeichert")
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(`Speichern fehlgeschlagen: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete() {
    if (!goal) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/goals/${encodeURIComponent(goal.id)}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      toast.success("Ziel gelöscht", {
        description: "Soft-Delete · 30 Tage wiederherstellbar.",
      })
      setConfirmDelete(false)
      onDeleted()
    } catch (err) {
      toast.error(
        `Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setDeleting(false)
    }
  }

  function handleClose(next: boolean) {
    if (!next && isDirty) {
      const shouldDiscard = window.confirm(
        "Es gibt nicht gespeicherte Änderungen. Wirklich verwerfen?",
      )
      if (!shouldDiscard) return
    }
    onOpenChange(next)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md"
          data-testid="goal-detail-panel"
        >
          <SheetHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 truncate">
                  <Target className="h-4 w-4 text-emerald-500" aria-hidden />
                  {goal.title}
                </SheetTitle>
                <SheetDescription>
                  Ziel · {statusLabel(goal.status)}
                </SheetDescription>
              </div>
              <ClassThreeLock clearView={costClearView} />
            </div>
          </SheetHeader>

          {goal.is_detached && (
            <Alert
              variant="destructive"
              className="mt-3"
              data-testid="detached-goal-badge"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              <AlertDescription>
                Quell-Phase wurde gelöscht. Auto-Pull deaktiviert. Wähle eine
                neue Quelle oder bestätige „Keine Quelle“.
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-4 space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titel</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!canEdit}
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!canEdit}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Entwurf</SelectItem>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="achieved">Erreicht</SelectItem>
                        <SelectItem value="abandoned">Verworfen</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} disabled={!canEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="success_criteria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Erfolgskriterien</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} disabled={!canEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source_ref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quelle</FormLabel>
                    <FormControl>
                      <SourceRefCombobox
                        phases={phases}
                        milestones={milestones}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormDescription>
                      Phase oder Meilenstein, aus dem Titel/Termin abgeleitet werden.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="auto_pull_date"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={Boolean(field.value)}
                        onChange={(e) => field.onChange(e.target.checked)}
                        disabled={
                          !canEdit ||
                          watchedSourceRefKind === "none"
                        }
                        className="h-4 w-4 rounded border-border"
                        data-testid="auto-pull-date-toggle"
                      />
                    </FormControl>
                    <FormLabel className="text-xs font-normal">
                      Termin aus Quelle übernehmen
                    </FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termin</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        disabled={!canEdit || watchedAutoPullDate}
                        placeholder={
                          watchedAutoPullDate
                            ? "(auto aus Quelle)"
                            : undefined
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {parentGoals.length > 0 && (
                <FormField
                  control={form.control}
                  name="parent_goal_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent-Ziel (optional)</FormLabel>
                      <Select
                        value={field.value ?? "__none__"}
                        onValueChange={(v) =>
                          field.onChange(v === "__none__" ? null : v)
                        }
                        disabled={!canEdit}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Top-Level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Top-Level</SelectItem>
                          {parentGoals
                            .filter((p) => p.id !== goal.id)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.title}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Stats Card */}
              <Card data-testid="goal-stats-card">
                <CardContent className="space-y-3 p-4">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Status-Quick-Glance
                  </Label>
                  <div className="space-y-1.5 text-sm">
                    <p>
                      <span className="mr-1.5">🟢</span>
                      <strong>{openGreenPathNodes.length}</strong> offene Pakete auf
                      grünem Pfad
                    </p>
                    <p>
                      <span className="mr-1.5">⏱</span>
                      <strong>
                        {estimatedEffortPt == null
                          ? "—"
                          : costClearView
                            ? `${estimatedEffortPt} PT`
                            : `~ ${estimatedEffortPt} PT *`}
                      </strong>{" "}
                      geschätzt
                    </p>
                    <p>
                      <span className="mr-1.5">⚠</span>
                      <strong>{criticalOnGreenPath}</strong> kritische Knoten
                    </p>
                  </div>
                  {openGreenPathNodes.length > 0 && (
                    <Collapsible
                      open={packagesExpanded}
                      onOpenChange={setPackagesExpanded}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-full justify-between text-xs"
                        >
                          {packagesExpanded ? "Pakete ausblenden" : "Pakete anzeigen"}
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${packagesExpanded ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="mt-2 space-y-1">
                          {openGreenPathNodes.slice(0, 5).map((n) => (
                            <li key={n.id}>
                              <button
                                type="button"
                                onClick={() => onOpenNode?.(n.id)}
                                className="flex w-full items-center justify-between rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                                data-testid="goal-stats-package-link"
                              >
                                <span className="truncate text-left">{n.label}</span>
                                <div className="flex items-center gap-1">
                                  {n.is_critical && (
                                    <Badge
                                      variant="destructive"
                                      className="text-[9px]"
                                    >
                                      kritisch
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[9px]">
                                    {n.status}
                                  </Badge>
                                </div>
                              </button>
                            </li>
                          ))}
                          {openGreenPathNodes.length > 5 && (
                            <li className="text-[11px] text-muted-foreground">
                              … und {openGreenPathNodes.length - 5} weitere
                            </li>
                          )}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>

              {/* B-3 — Sub-goal tree (children of this goal). */}
              {(() => {
                const subGoals =
                  allGoals?.filter((g) => g.parent_goal_id === goal.id) ?? []
                if (subGoals.length === 0) return null
                return (
                  <Card data-testid="sub-goal-tree">
                    <CardContent className="space-y-2 p-4">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Teilziele ({subGoals.length})
                      </Label>
                      <ul className="space-y-1">
                        {subGoals.map((sg) => (
                          <li key={sg.id} className="pl-3">
                            <button
                              type="button"
                              onClick={() => onOpenGoal?.(sg.id)}
                              className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                              data-testid="sub-goal-link"
                            >
                              <Target
                                className="h-3 w-3 text-emerald-500"
                                aria-hidden
                              />
                              <span className="truncate text-left">
                                {sg.title}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )
              })()}

              <ClassThreeFootnote
                hasMaskedValue={hasMaskedEffort}
                projectId={projectId}
              />

              <SheetFooter className="flex flex-row items-center justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={submitting || deleting}
                      data-testid="goal-delete-button"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Löschen
                    </Button>
                  )}
                  {onCreateSubGoal && canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onCreateSubGoal}
                    >
                      + Teilziel
                    </Button>
                  )}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!isDirty || !isValid || submitting || !canEdit}
                  data-testid="goal-save-button"
                >
                  {submitting && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  )}
                  Speichern
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ziel löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Ziel wird soft-gelöscht und ist 30 Tage wiederherstellbar. Wenn
              dieses Ziel Teilziele hat, werden sie zu Top-Level-Goals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Entwurf"
    case "active":
      return "Aktiv"
    case "achieved":
      return "Erreicht"
    case "abandoned":
      return "Verworfen"
    default:
      return status
  }
}
