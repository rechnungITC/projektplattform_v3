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
import {
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

const NO_PHASE_VALUE = "__none__"

const taskSchema = z.object({
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
  responsible_user_id: z.string().nullable(),
  phase_id: z.string().nullable(),
  due_date: z.string().nullable(),
  priority: z.enum(WORK_ITEM_PRIORITIES),
  workstream: z
    .string()
    .max(80, "Workstream darf höchstens 80 Zeichen lang sein")
    .optional()
    .or(z.literal("")),
})

type TaskFormValues = z.infer<typeof taskSchema>

interface MaTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** When set, the dialog edits this task; otherwise it creates a new one. */
  item?: WorkItemWithProfile | null
  onSaved: () => void | Promise<void>
}

function readWorkstream(item: WorkItemWithProfile | null | undefined): string {
  const attrs = (item?.attributes ?? {}) as Record<string, unknown>
  const ws = attrs.ma_workstream
  return typeof ws === "string" ? ws : ""
}

export function MaTaskDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onSaved,
}: MaTaskDialogProps) {
  const { currentTenant } = useAuth()
  const { phases } = usePhases(projectId)
  const [submitting, setSubmitting] = React.useState(false)
  const isEdit = Boolean(item)

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      responsible_user_id: null,
      phase_id: null,
      due_date: null,
      priority: "medium",
      workstream: "",
    },
  })

  // Reset the form each time the dialog opens (create → blank, edit → item).
  const { reset } = form
  React.useEffect(() => {
    if (!open) return
    reset({
      title: item?.title ?? "",
      description: item?.description ?? "",
      responsible_user_id: item?.responsible_user_id ?? null,
      phase_id: item?.phase_id ?? null,
      due_date: item?.due_date ?? null,
      priority: item?.priority ?? "medium",
      workstream: readWorkstream(item),
    })
  }, [open, item, reset])

  async function onSubmit(values: TaskFormValues) {
    setSubmitting(true)
    try {
      const workstream = values.workstream?.trim() ?? ""
      // Preserve existing attributes on edit; only touch the ma_workstream tag.
      const baseAttrs = (item?.attributes ?? {}) as Record<string, unknown>
      const attributes: Record<string, unknown> = { ...baseAttrs }
      if (workstream) attributes.ma_workstream = workstream
      else delete attributes.ma_workstream

      const commonPayload = {
        title: values.title.trim(),
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        responsible_user_id: values.responsible_user_id,
        phase_id: values.phase_id,
        due_date: values.due_date,
        priority: values.priority,
        attributes,
      }

      let response: Response
      if (isEdit && item) {
        response = await fetch(
          `/api/projects/${projectId}/work-items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(commonPayload),
          }
        )
      } else {
        response = await fetch(`/api/projects/${projectId}/work-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "task",
            status: "todo",
            parent_id: null,
            ...commonPayload,
          }),
        })
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Speichern fehlgeschlagen.")
      }

      toast.success(isEdit ? "Aufgabe aktualisiert." : "Aufgabe angelegt.")
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
          </DialogTitle>
          <DialogDescription>
            Aufgabe mit Verantwortlichem, Frist und Phase. Der Status wird in der
            Liste gepflegt.
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
                    <Input
                      {...field}
                      placeholder="Was ist zu tun?"
                      disabled={submitting}
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <SelectItem value={NO_PHASE_VALUE}>Keine Phase</SelectItem>
                        {phases.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sequence_number}. {p.name}
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
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frist</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>Fälligkeitsdatum (optional).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                name="workstream"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workstream</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="z. B. Financial DD"
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>Optionaler Freitext-Tag.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Details (optional)"
                      rows={3}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
