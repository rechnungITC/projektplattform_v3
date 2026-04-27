"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronLeft, Loader2 } from "lucide-react"
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
import { useSprints } from "@/hooks/use-sprints"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  isAllowedParent,
  isKindVisibleInMethod,
  WORK_ITEM_KIND_LABELS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABELS,
  type WorkItemKind,
  type WorkItemWithProfile,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

import { WorkItemKindBadge } from "./work-item-kind-badge"

const NO_PARENT_VALUE = "__none__"
const NO_SPRINT_VALUE = "__none__"

const newWorkItemSchema = z.object({
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
  parent_id: z.string().nullable(),
  status: z.enum(WORK_ITEM_STATUSES),
  priority: z.enum(WORK_ITEM_PRIORITIES),
  responsible_user_id: z.string().nullable(),
  sprint_id: z.string().nullable(),
})

type NewWorkItemValues = z.infer<typeof newWorkItemSchema>

interface NewWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** When set, skips step 1 and pre-selects the kind. */
  initialKind?: WorkItemKind | null
  method: ProjectMethod | null
  onCreated: () => void | Promise<void>
}

export function NewWorkItemDialog({
  open,
  onOpenChange,
  projectId,
  initialKind,
  method,
  onCreated,
}: NewWorkItemDialogProps) {
  const { user, currentTenant } = useAuth()
  const { items: candidateParents } = useWorkItems(projectId)
  const { sprints } = useSprints(projectId)

  const [submitting, setSubmitting] = React.useState(false)
  const [selectedKind, setSelectedKind] = React.useState<WorkItemKind | null>(
    initialKind ?? null
  )

  const SCRUM_KINDS: WorkItemKind[] = [
    "epic",
    "story",
    "task",
    "subtask",
    "bug",
  ]
  const sprintAvailable =
    selectedKind !== null && SCRUM_KINDS.includes(selectedKind)

  const form = useForm<NewWorkItemValues>({
    resolver: zodResolver(newWorkItemSchema),
    defaultValues: {
      title: "",
      description: "",
      parent_id: null,
      status: "todo",
      priority: "medium",
      responsible_user_id: user?.id ?? null,
      sprint_id: null,
    },
  })

  React.useEffect(() => {
    if (open) {
      setSelectedKind(initialKind ?? null)
      form.reset({
        title: "",
        description: "",
        parent_id: null,
        status: "todo",
        priority: "medium",
        responsible_user_id: user?.id ?? null,
        sprint_id: null,
      })
    }
  }, [open, initialKind, user?.id, form])

  const allowedParents = React.useMemo<WorkItemWithProfile[]>(() => {
    if (!selectedKind) return []
    return candidateParents.filter((p) =>
      isAllowedParent(selectedKind, p.kind)
    )
  }, [candidateParents, selectedKind])

  const allowsTopLevel = selectedKind
    ? isAllowedParent(selectedKind, null)
    : false

  const onSubmit = async (values: NewWorkItemValues) => {
    if (!selectedKind) return
    setSubmitting(true)
    try {
      const payload = {
        kind: selectedKind,
        title: values.title.trim(),
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        parent_id: values.parent_id,
        status: values.status,
        priority: values.priority,
        responsible_user_id: values.responsible_user_id,
        sprint_id: sprintAvailable ? values.sprint_id : null,
      }

      const response = await fetch(`/api/projects/${projectId}/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/work-items ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Work Item konnte nicht angelegt werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Work Item angelegt", {
        description: `${WORK_ITEM_KIND_LABELS[selectedKind]} „${values.title.trim()}".`,
      })
      await onCreated()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Work Item konnte nicht angelegt werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Step 1 (kind picker) — when no kind chosen yet.
  if (!selectedKind) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Neues Work Item</DialogTitle>
            <DialogDescription>
              Wähle den Typ. Du kannst ihn später nicht mehr ändern.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(WORK_ITEM_KIND_LABELS) as WorkItemKind[])
              .filter((kind) => isKindVisibleInMethod(kind, method))
              .map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedKind(kind)}
                  className="flex flex-col items-start gap-2 rounded-md border p-3 text-left hover:border-primary/50 hover:bg-accent"
                >
                  <WorkItemKindBadge kind={kind} />
                  <span className="text-sm font-medium">
                    {WORK_ITEM_KIND_LABELS[kind]}
                  </span>
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Step 2 (form) — kind locked.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!initialKind ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedKind(null)}
                aria-label="Typ ändern"
                className="h-7 w-7"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
            Neues Work Item
            <WorkItemKindBadge kind={selectedKind} />
          </DialogTitle>
          <DialogDescription>
            Pflichtfeld ist nur der Titel. Übergeordnete Elemente werden nach
            den erlaubten Typen gefiltert.
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
              name="parent_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Übergeordnet</FormLabel>
                  <Select
                    value={field.value ?? NO_PARENT_VALUE}
                    onValueChange={(v) =>
                      field.onChange(v === NO_PARENT_VALUE ? null : v)
                    }
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Übergeordnet wählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allowsTopLevel ? (
                        <SelectItem value={NO_PARENT_VALUE}>
                          (Top-Level)
                        </SelectItem>
                      ) : null}
                      {allowedParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {WORK_ITEM_KIND_LABELS[p.kind]}: {p.title}
                        </SelectItem>
                      ))}
                      {allowedParents.length === 0 && !allowsTopLevel ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Keine erlaubten Eltern verfügbar.
                        </div>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
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
                        {WORK_ITEM_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {WORK_ITEM_STATUS_LABELS[s]}
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

            {sprintAvailable ? (
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
                          <SelectValue placeholder="Sprint wählen (optional)" />
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
            ) : null}

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
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
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
