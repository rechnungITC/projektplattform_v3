"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
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
import { useAuth } from "@/hooks/use-auth"
import { usePhases } from "@/hooks/use-phases"
import { useSprints } from "@/hooks/use-sprints"
import {
  WORK_ITEM_KIND_LABELS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"

const NO_SPRINT_VALUE = "__none__"
const NO_PHASE_VALUE = "__none__"

const editWorkItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Titel ist erforderlich")
    .max(255, "Titel darf höchstens 255 Zeichen lang sein"),
  description: z
    .string()
    .max(10000, "Beschreibung darf höchstens 10000 Zeichen lang sein")
    .optional()
    .or(z.literal("")),
  priority: z.enum(WORK_ITEM_PRIORITIES),
  responsible_user_id: z.string().nullable(),
  sprint_id: z.string().nullable(),
  phase_id: z.string().nullable(),
  planned_start: z.string().nullable(),
  planned_end: z.string().nullable(),
  attributes_json: z
    .string()
    .max(20000, "Attribute (JSON) zu groß")
    .refine(
      (raw) => {
        if (!raw || raw.trim() === "") return true
        try {
          const parsed: unknown = JSON.parse(raw)
          return (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed)
          )
        } catch {
          return false
        }
      },
      { message: "Muss gültiges JSON-Objekt sein" }
    ),
})

type EditWorkItemValues = z.infer<typeof editWorkItemSchema>

interface EditWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onSaved: () => void | Promise<void>
}

export function EditWorkItemDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onSaved,
}: EditWorkItemDialogProps) {
  const { currentTenant } = useAuth()
  const { sprints } = useSprints(projectId)
  const { phases } = usePhases(projectId)
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<EditWorkItemValues>({
    resolver: zodResolver(editWorkItemSchema),
    defaultValues: {
      title: item.title,
      description: item.description ?? "",
      priority: item.priority,
      responsible_user_id: item.responsible_user_id,
      sprint_id: item.sprint_id,
      phase_id: item.phase_id,
      planned_start: item.planned_start ?? null,
      planned_end: item.planned_end ?? null,
      attributes_json: stringifyAttributes(item.attributes),
    },
  })

  React.useEffect(() => {
    if (open) {
      form.reset({
        title: item.title,
        description: item.description ?? "",
        priority: item.priority,
        responsible_user_id: item.responsible_user_id,
        sprint_id: item.sprint_id,
        phase_id: item.phase_id,
        planned_start: item.planned_start ?? null,
        planned_end: item.planned_end ?? null,
        attributes_json: stringifyAttributes(item.attributes),
      })
    }
  }, [open, item, form])

  const onSubmit = async (values: EditWorkItemValues) => {
    setSubmitting(true)
    try {
      const attributes = parseAttributes(values.attributes_json)
      const payload = {
        title: values.title.trim(),
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        priority: values.priority,
        responsible_user_id: values.responsible_user_id,
        sprint_id: values.sprint_id,
        phase_id: values.phase_id,
        planned_start: values.planned_start,
        planned_end: values.planned_end,
        attributes,
      }

      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Work Item konnte nicht aktualisiert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Gespeichert")
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Work Item konnte nicht aktualisiert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Bearbeiten
            <WorkItemKindBadge kind={item.kind} />
          </DialogTitle>
          <DialogDescription>
            Typ ({WORK_ITEM_KIND_LABELS[item.kind]}), übergeordnetes Element und
            Status werden separat geändert.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel</FormLabel>
                  <FormControl>
                    <Input maxLength={255} disabled={submitting} {...field} />
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
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea rows={4} disabled={submitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorität</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WORK_ITEM_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {WORK_ITEM_PRIORITY_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sprint_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sprint</FormLabel>
                    <Select
                      value={field.value ?? NO_SPRINT_VALUE}
                      onValueChange={(v) =>
                        field.onChange(v === NO_SPRINT_VALUE ? null : v)
                      }
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_SPRINT_VALUE}>
                          Kein Sprint
                        </SelectItem>
                        {sprints.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phase_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase</FormLabel>
                    <Select
                      value={field.value ?? NO_PHASE_VALUE}
                      onValueChange={(v) =>
                        field.onChange(v === NO_PHASE_VALUE ? null : v)
                      }
                      disabled={submitting || phases.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              phases.length === 0
                                ? "Keine Phasen vorhanden"
                                : "Phase wählen"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PHASE_VALUE}>
                          Keine Phase
                        </SelectItem>
                        {phases.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sequence_number}. {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Ordnet das Item zeitlich einer Projekt-Phase zu (für
                      Wasserfall-WBS + Gantt).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="planned_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geplanter Start</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Eigenes Start-Datum (optional). Im Gantt sichtbar.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="planned_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geplantes Ende</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || null)
                        }
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Eigenes End-Datum (optional). Im Gantt sichtbar.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="responsible_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verantwortlich</FormLabel>
                  <FormControl>
                    {currentTenant?.id ? (
                      <ResponsibleUserPicker
                        tenantId={currentTenant.id}
                        value={field.value ?? undefined}
                        onChange={(id) => field.onChange(id || null)}
                        disabled={submitting}
                        placeholder="Mitglied wählen"
                      />
                    ) : (
                      <Input disabled placeholder="Kein Tenant" />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attributes_json"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attribute (JSON, optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      disabled={submitting}
                      placeholder='{"story_points": 3}'
                      className="font-mono text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Methoden-spezifische Felder wie story_points, slack_days,
                    acceptance_criteria.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Speichern
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function stringifyAttributes(attrs: Record<string, unknown>): string {
  if (!attrs || Object.keys(attrs).length === 0) return ""
  try {
    return JSON.stringify(attrs, null, 2)
  } catch {
    return ""
  }
}

function parseAttributes(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === "") return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fallthrough
  }
  return {}
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Anfrage fehlgeschlagen (${response.status})`
    }
    return data.message ?? `Anfrage fehlgeschlagen (${response.status})`
  } catch {
    return `Anfrage fehlgeschlagen (${response.status})`
  }
}
