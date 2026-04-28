"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { Button } from "@/components/ui/button"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  STAKEHOLDER_KINDS,
  STAKEHOLDER_KIND_LABELS,
  STAKEHOLDER_ORIGINS,
  STAKEHOLDER_ORIGIN_LABELS,
  STAKEHOLDER_SCORES,
  STAKEHOLDER_SCORE_LABELS,
  type Stakeholder,
  type StakeholderKind,
  type StakeholderOrigin,
  type StakeholderScore,
} from "@/types/stakeholder"

import type { StakeholderInput } from "@/lib/stakeholders/api"

const formSchema = z.object({
  kind: z.enum(STAKEHOLDER_KINDS as unknown as [StakeholderKind, ...StakeholderKind[]]),
  origin: z.enum(
    STAKEHOLDER_ORIGINS as unknown as [StakeholderOrigin, ...StakeholderOrigin[]]
  ),
  name: z.string().trim().min(1, "Name ist erforderlich").max(255),
  role_key: z.string().max(100),
  org_unit: z.string().max(255),
  contact_email: z
    .string()
    .max(320)
    .refine(
      (val) => val === "" || /^\S+@\S+\.\S+$/.test(val),
      "Ungültige E-Mail-Adresse"
    ),
  contact_phone: z.string().max(64),
  influence: z.enum(
    STAKEHOLDER_SCORES as unknown as [StakeholderScore, ...StakeholderScore[]]
  ),
  impact: z.enum(
    STAKEHOLDER_SCORES as unknown as [StakeholderScore, ...StakeholderScore[]]
  ),
  linked_user_id: z.string(),
  notes: z.string().max(5000),
})

type FormValues = z.infer<typeof formSchema>

interface StakeholderFormProps {
  tenantId: string
  initial?: Stakeholder | null
  prefillRoleKey?: string | null
  onCancel: () => void
  onSubmit: (input: StakeholderInput) => Promise<void> | void
  submitting?: boolean
  /** Optional secondary action shown on edit (e.g. deactivate). */
  secondaryAction?: React.ReactNode
}

function emptyValues(prefillRoleKey?: string | null): FormValues {
  return {
    kind: "person",
    origin: "internal",
    name: "",
    role_key: prefillRoleKey ?? "",
    org_unit: "",
    contact_email: "",
    contact_phone: "",
    influence: "medium",
    impact: "medium",
    linked_user_id: "",
    notes: "",
  }
}

function fromStakeholder(s: Stakeholder): FormValues {
  return {
    kind: s.kind,
    origin: s.origin,
    name: s.name,
    role_key: s.role_key ?? "",
    org_unit: s.org_unit ?? "",
    contact_email: s.contact_email ?? "",
    contact_phone: s.contact_phone ?? "",
    influence: s.influence,
    impact: s.impact,
    linked_user_id: s.linked_user_id ?? "",
    notes: s.notes ?? "",
  }
}

/**
 * Stakeholder edit/create form. Used inside a Sheet drawer in the
 * stakeholder tab. Empty strings on optional text fields are converted
 * to null when handed off to the API helper.
 */
export function StakeholderForm({
  tenantId,
  initial,
  prefillRoleKey,
  onCancel,
  onSubmit,
  submitting = false,
  secondaryAction,
}: StakeholderFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial ? fromStakeholder(initial) : emptyValues(prefillRoleKey),
  })

  React.useEffect(() => {
    form.reset(initial ? fromStakeholder(initial) : emptyValues(prefillRoleKey))
  }, [initial, prefillRoleKey, form])

  const handleSubmit = async (values: FormValues) => {
    const input: StakeholderInput = {
      kind: values.kind,
      origin: values.origin,
      name: values.name.trim(),
      role_key: values.role_key.trim() || null,
      org_unit: values.org_unit.trim() || null,
      contact_email: values.contact_email.trim() || null,
      contact_phone: values.contact_phone.trim() || null,
      influence: values.influence,
      impact: values.impact,
      linked_user_id: values.linked_user_id || null,
      notes: values.notes.trim() || null,
    }
    await onSubmit(input)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-5"
      >
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Typ *</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex gap-4"
                >
                  {STAKEHOLDER_KINDS.map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <RadioGroupItem value={k} id={`kind-${k}`} />
                      <span className="text-sm">
                        {STAKEHOLDER_KIND_LABELS[k]}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="origin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Herkunft *</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex gap-4"
                >
                  {STAKEHOLDER_ORIGINS.map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <RadioGroupItem value={o} id={`origin-${o}`} />
                      <span className="text-sm">
                        {STAKEHOLDER_ORIGIN_LABELS[o]}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input placeholder="z. B. Anna Schmidt" {...field} />
              </FormControl>
              <FormDescription>Personenbezogen — Class-3.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="role_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rolle</FormLabel>
                <FormControl>
                  <Input
                    placeholder="z. B. Sponsor, Key-User"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Frei wählbar; Vorschläge erscheinen in der Sidebar.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="org_unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organisationseinheit</FormLabel>
                <FormControl>
                  <Input placeholder="z. B. Einkauf" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-Mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="name@firma.de"
                    {...field}
                  />
                </FormControl>
                <FormDescription>Class-3.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contact_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input placeholder="+49 …" {...field} />
                </FormControl>
                <FormDescription>Class-3.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="linked_user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verknüpftes Konto (optional)</FormLabel>
              <FormControl>
                <ResponsibleUserPicker
                  tenantId={tenantId}
                  value={field.value || undefined}
                  onChange={(v) => field.onChange(v)}
                  placeholder="— kein Konto —"
                />
              </FormControl>
              <FormDescription>
                Falls dieser Stakeholder auch einen Plattform-Account hat.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="influence"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Einfluss</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAKEHOLDER_SCORES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STAKEHOLDER_SCORE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="impact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Impact</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAKEHOLDER_SCORES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STAKEHOLDER_SCORE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notizen</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormDescription>Class-3.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div>{secondaryAction}</div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
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
          </div>
        </div>
      </form>
    </Form>
  )
}
