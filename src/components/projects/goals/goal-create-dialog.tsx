"use client"

/**
 * PROJ-65 ε.3a — GoalCreateDialog (modal).
 *
 * Triggered by:
 *  - Toolbar "+ Ziel erstellen" CTA
 *  - GoalDetailPanel "+ Teilziel anlegen" (pre-selects parent_goal_id)
 *  - Empty-State CTA when project has zero goals
 *
 * Posts to ε.1 backend POST /api/projects/[id]/goals on submit, then
 * notifies parent to re-fetch snapshot.
 */

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Loader2, Target } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import {
  GoalFormSchema,
  type GoalFormValues,
} from "./goal-detail-panel"
import {
  SourceRefCombobox,
  type SourceRefOption,
} from "./source-ref-combobox"

interface GoalCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phases: SourceRefOption[]
  milestones: SourceRefOption[]
  parentGoals: Array<{ id: string; title: string }>
  /** Pre-select a parent (when triggered from "+ Teilziel anlegen"). */
  defaultParentGoalId?: string | null
  onCreated: (goalId: string) => void
}

export function GoalCreateDialog({
  open,
  onOpenChange,
  projectId,
  phases,
  milestones,
  parentGoals,
  defaultParentGoalId,
  onCreated,
}: GoalCreateDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(GoalFormSchema),
    defaultValues: {
      title: "",
      description: "",
      success_criteria: "",
      target_date: "",
      status: "draft",
      parent_goal_id: defaultParentGoalId ?? null,
      source_ref: { kind: "none", id: null },

    },
  })

  React.useEffect(() => {
    if (!open) {
      form.reset()
      setError(null)
    } else {
      form.reset({
        title: "",
        description: "",
        success_criteria: "",
        target_date: "",
        status: "draft",
        parent_goal_id: defaultParentGoalId ?? null,
        source_ref: { kind: "none", id: null },

      })
    }
  }, [open, defaultParentGoalId, form])

  async function onSubmit(values: GoalFormValues) {
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
        `/api/projects/${encodeURIComponent(projectId)}/goals`,
        {
          method: "POST",
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
      const body2 = (await res.json()) as { goal?: { id: string } }
      const newId = body2.goal?.id ?? ""
      toast.success("Ziel angelegt")
      onCreated(newId)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(`Anlegen fehlgeschlagen: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="goal-create-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" aria-hidden />
            Neues Ziel anlegen
          </DialogTitle>
          <DialogDescription>
            Lege ein Projektziel mit optionaler Quelle (Phase / Meilenstein) an.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Titel <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
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
                  <FormLabel>Erfolgskriterien (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
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
                    />
                  </FormControl>
                  <FormDescription>
                    Optional — Phase oder Meilenstein als Auto-Suggest-Quelle.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="target_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Termin (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ?? ""}
                      onChange={field.onChange}
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
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Top-Level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Top-Level</SelectItem>
                        {parentGoals.map((p) => (
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

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="goal-create-submit"
              >
                {submitting && (
                  <Loader2
                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
                    aria-hidden
                  />
                )}
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
