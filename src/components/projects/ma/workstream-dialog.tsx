"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
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
  createWorkstream,
  getWorkstream,
  setWorkstreamPhases,
  updateWorkstream,
} from "@/lib/ma-project/workstreams-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import {
  WORKSTREAM_RAG_LABELS,
  WORKSTREAM_RAG_STATUSES,
  type Workstream,
} from "@/types/workstream"

const LEVELS: { value: MaConfidentialityLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "confidential", label: "Vertraulich" },
  { value: "strict", label: "Streng vertraulich" },
]

const workstreamFormSchema = z.object({
  label: z.string().trim().min(1, "Label ist erforderlich").max(120),
  goal: z.string().max(4000).optional().or(z.literal("")),
  lead_user_id: z.string().nullable(),
  rag_status: z.enum(WORKSTREAM_RAG_STATUSES),
  confidentiality_level: z.enum(["standard", "confidential", "strict"]),
  phase_ids: z.array(z.string()),
})

type WorkstreamFormValues = z.infer<typeof workstreamFormSchema>

/** Derive a schema-valid workstream_key (^[a-z][a-z0-9_]{1,40}$) from a label. */
function slugifyKey(label: string): string {
  let s = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 41)
  if (!/^[a-z]/.test(s)) s = `ws_${s}`.slice(0, 41)
  s = s.replace(/_+$/g, "")
  return s.length >= 2 ? s : "workstream"
}

interface WorkstreamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item?: Workstream | null
  onSaved: () => void | Promise<void>
}

export function WorkstreamDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onSaved,
}: WorkstreamDialogProps) {
  const { currentTenant } = useAuth()
  const { phases } = usePhases(projectId)
  const isEdit = Boolean(item)
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<WorkstreamFormValues>({
    resolver: zodResolver(workstreamFormSchema),
    defaultValues: {
      label: "",
      goal: "",
      lead_user_id: null,
      rag_status: "green",
      confidentiality_level: "standard",
      phase_ids: [],
    },
  })

  const { reset, setValue, control } = form
  const phaseIds = useWatch({ control, name: "phase_ids" }) ?? []

  React.useEffect(() => {
    if (!open) return
    reset({
      label: item?.label ?? "",
      goal: item?.goal ?? "",
      lead_user_id: item?.lead_user_id ?? null,
      rag_status: item?.rag_status ?? "green",
      confidentiality_level: item?.confidentiality_level ?? "standard",
      phase_ids: [],
    })
    if (item) {
      void getWorkstream(projectId, item.id)
        .then((r) => setValue("phase_ids", r.phase_ids))
        .catch(() => {})
    }
  }, [open, item, projectId, reset, setValue])

  function togglePhase(id: string) {
    const cur = form.getValues("phase_ids")
    setValue(
      "phase_ids",
      cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]
    )
  }

  async function onSubmit(values: WorkstreamFormValues) {
    setSubmitting(true)
    try {
      let wsId: string
      const scalars = {
        label: values.label.trim(),
        goal: values.goal && values.goal.length > 0 ? values.goal : null,
        lead_user_id: values.lead_user_id,
        rag_status: values.rag_status,
        confidentiality_level: values.confidentiality_level,
      }
      if (isEdit && item) {
        await updateWorkstream(projectId, item.id, scalars)
        wsId = item.id
      } else {
        const created = await createWorkstream(projectId, {
          workstream_key: slugifyKey(values.label),
          ...scalars,
        })
        wsId = created.id
      }
      await setWorkstreamPhases(projectId, wsId, values.phase_ids)
      toast.success(isEdit ? "Workstream aktualisiert." : "Workstream angelegt.")
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
            {isEdit ? "Workstream bearbeiten" : "Neuer Workstream"}
          </DialogTitle>
          <DialogDescription>
            Steuerungseinheit mit Ziel, Verantwortlichem, Status und Phasen.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="z. B. Legal DD"
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
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ziel</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Zielsetzung des Workstreams (optional)"
                      rows={2}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lead_user_id"
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
                        placeholder="Lead wählen"
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
                name="rag_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status (RAG)</FormLabel>
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
                        {WORKSTREAM_RAG_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {WORKSTREAM_RAG_LABELS[s]}
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
                name="confidentiality_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vertraulichkeit</FormLabel>
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
                        {LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Phasen</Label>
              {phases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Phasen im Projekt.
                </p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {phases.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={phaseIds.includes(p.id)}
                        onCheckedChange={() => togglePhase(p.id)}
                        disabled={submitting}
                      />
                      <span>
                        {p.sequence_number}. {p.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

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
