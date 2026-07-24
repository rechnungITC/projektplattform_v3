"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
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
import { useStageGates } from "@/hooks/use-stage-gates"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  createEntry,
  updateEntry,
  type CommunicationEntry,
  type CommunicationTemplate,
} from "@/lib/ma-project/communication-api"
import {
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  MA_CONFIDENTIALITY_LEVELS,
} from "@/types/confidentiality"
import {
  TARGET_GROUP_KEYS,
  TARGET_GROUP_LABELS,
  type TargetGroupKey,
} from "@/types/communication-matrix"

const NONE = "__none__"

const entrySchema = z
  .object({
    target_group_key: z.enum(
      TARGET_GROUP_KEYS as unknown as [TargetGroupKey, ...TargetGroupKey[]]
    ),
    target_group_label: z
      .string()
      .max(200, "Bezeichnung darf höchstens 200 Zeichen lang sein")
      .optional()
      .or(z.literal("")),
    message: z
      .string()
      .max(10000, "Botschaft darf höchstens 10000 Zeichen lang sein")
      .optional()
      .or(z.literal("")),
    channel: z
      .string()
      .max(200, "Kanal darf höchstens 200 Zeichen lang sein")
      .optional()
      .or(z.literal("")),
    planned_date: z.string().nullable(),
    responsible_user_id: z.string().nullable(),
    approver_user_id: z.string().nullable(),
    confidentiality_level: z.enum(MA_CONFIDENTIALITY_LEVELS),
    phase_id: z.string().nullable(),
    stage_gate_id: z.string().nullable(),
    work_item_id: z.string().nullable(),
    template_id: z.string().nullable(),
  })
  .refine(
    (v) =>
      v.target_group_key !== "custom" ||
      (v.target_group_label ?? "").trim().length > 0,
    {
      message: "Bezeichnung ist bei „Individuell“ erforderlich",
      path: ["target_group_label"],
    }
  )

type EntryFormValues = z.infer<typeof entrySchema>

interface CommunicationEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** When set, edits this entry; otherwise creates a new one. */
  entry?: CommunicationEntry | null
  /** Templates available for prefill on create (empty on edit). */
  templates: CommunicationTemplate[]
  onSaved: () => void | Promise<void>
}

export function CommunicationEntryDialog({
  open,
  onOpenChange,
  projectId,
  entry,
  templates,
  onSaved,
}: CommunicationEntryDialogProps) {
  const { currentTenant } = useAuth()
  const { phases } = usePhases(projectId)
  const { stageGates } = useStageGates(projectId)
  const { items: workItems } = useWorkItems(projectId)
  const [submitting, setSubmitting] = React.useState(false)
  const isEdit = Boolean(entry)

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      target_group_key: "geschaeftsfuehrung",
      target_group_label: "",
      message: "",
      channel: "",
      planned_date: null,
      responsible_user_id: null,
      approver_user_id: null,
      confidentiality_level: "standard",
      phase_id: null,
      stage_gate_id: null,
      work_item_id: null,
      template_id: null,
    },
  })

  const { reset, setValue, control } = form
  const targetGroupKey = useWatch({ control, name: "target_group_key" })

  React.useEffect(() => {
    if (!open) return
    const key = (entry?.target_group_key ?? "geschaeftsfuehrung") as TargetGroupKey
    reset({
      target_group_key: (TARGET_GROUP_KEYS as readonly string[]).includes(key)
        ? key
        : "custom",
      target_group_label: entry?.target_group_label ?? "",
      message: entry?.message ?? "",
      channel: entry?.channel ?? "",
      planned_date: entry?.planned_date ?? null,
      responsible_user_id: entry?.responsible_user_id ?? null,
      approver_user_id: entry?.approver_user_id ?? null,
      confidentiality_level: entry?.confidentiality_level ?? "standard",
      phase_id: entry?.phase_id ?? null,
      stage_gate_id: entry?.stage_gate_id ?? null,
      work_item_id: entry?.work_item_id ?? null,
      template_id: null,
    })
  }, [open, entry, reset])

  // AC5 — applying a template PREFILLS defaults client-side (create only).
  function applyTemplate(templateId: string) {
    if (templateId === NONE) {
      setValue("template_id", null)
      return
    }
    const t = templates.find((x) => x.id === templateId)
    setValue("template_id", templateId)
    if (!t) return
    if (
      t.default_target_group_key &&
      (TARGET_GROUP_KEYS as readonly string[]).includes(
        t.default_target_group_key
      )
    ) {
      setValue("target_group_key", t.default_target_group_key as TargetGroupKey)
    }
    if (t.default_channel) setValue("channel", t.default_channel)
    setValue("confidentiality_level", t.default_confidentiality)
    if (t.body_skeleton) setValue("message", t.body_skeleton)
  }

  async function onSubmit(values: EntryFormValues) {
    setSubmitting(true)
    try {
      const base = {
        target_group_key: values.target_group_key,
        target_group_label:
          values.target_group_key === "custom"
            ? (values.target_group_label ?? "").trim() || null
            : null,
        message: values.message?.trim() ? values.message.trim() : null,
        channel: values.channel?.trim() ? values.channel.trim() : null,
        planned_date: values.planned_date,
        responsible_user_id: values.responsible_user_id,
        approver_user_id: values.approver_user_id,
        confidentiality_level: values.confidentiality_level,
        phase_id: values.phase_id,
        stage_gate_id: values.stage_gate_id,
        work_item_id: values.work_item_id,
      }
      if (isEdit && entry) {
        await updateEntry(projectId, entry.id, base)
        toast.success("Eintrag aktualisiert.")
      } else {
        await createEntry(projectId, {
          ...base,
          template_id: values.template_id,
        })
        toast.success("Eintrag angelegt.")
      }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Eintrag bearbeiten" : "Neuer Kommunikationseintrag"}
          </DialogTitle>
          <DialogDescription>
            Zielgruppe, Botschaft, Kanal und Termin. Freigabe erfolgt über den
            Workflow (Einreichen → Freigeben/Ablehnen → Versendet).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {!isEdit && templates.length > 0 && (
              <FormField
                control={form.control}
                name="template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vorlage (optional)</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={applyTemplate}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Vorlage anwenden" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Keine Vorlage</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Übernimmt Zielgruppe, Kanal, Vertraulichkeit und Textgerüst.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="target_group_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zielgruppe</FormLabel>
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
                        {TARGET_GROUP_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {TARGET_GROUP_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {targetGroupKey === "custom" && (
                <FormField
                  control={form.control}
                  name="target_group_label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bezeichnung</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="z. B. Betriebsrat"
                          disabled={submitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Botschaft</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Kernbotschaft an diese Zielgruppe"
                      rows={3}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kanal</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="z. B. E-Mail, Townhall"
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="planned_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geplant für</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                name="approver_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Freigeber</FormLabel>
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
                    <FormDescription>
                      Muss vom Verantwortlichen abweichen (SoD).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      {MA_CONFIDENTIALITY_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {MA_CONFIDENTIALITY_LEVEL_LABELS[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="phase_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                      disabled={submitting || phases.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              phases.length === 0 ? "Keine Phasen" : "Phase"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Keine Phase</SelectItem>
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
                name="stage_gate_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage-Gate</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                      disabled={submitting || stageGates.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              stageGates.length === 0 ? "Keine Gates" : "Gate"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Kein Gate</SelectItem>
                        {stageGates.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.label}
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
                name="work_item_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Item</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                      disabled={submitting || workItems.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              workItems.length === 0 ? "Keine" : "Work Item"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Kein Work Item</SelectItem>
                        {workItems.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
