"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronDown, Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { Button } from "@/components/ui/button"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  COMMUNICATION_NEED_LABELS,
  COMMUNICATION_NEEDS,
  DECISION_AUTHORITIES,
  DECISION_AUTHORITY_LABELS,
  MANAGEMENT_LEVEL_LABELS,
  MANAGEMENT_LEVELS,
  PREFERRED_CHANNEL_LABELS,
  PREFERRED_CHANNELS,
  STAKEHOLDER_ATTITUDE_LABELS,
  STAKEHOLDER_ATTITUDES,
  STAKEHOLDER_KINDS,
  STAKEHOLDER_KIND_LABELS,
  STAKEHOLDER_ORIGINS,
  STAKEHOLDER_ORIGIN_LABELS,
  STAKEHOLDER_SCORES,
  STAKEHOLDER_SCORE_LABELS,
  type CommunicationNeed,
  type DecisionAuthority,
  type ManagementLevel,
  type PreferredChannel,
  type Stakeholder,
  type StakeholderAttitude,
  type StakeholderKind,
  type StakeholderOrigin,
  type StakeholderScore,
} from "@/types/stakeholder"

import type { StakeholderInput } from "@/lib/stakeholders/api"
import type { StakeholderType } from "@/types/stakeholder-type"

// PROJ-33 — sentinel for "no selection" in Selects. Maps to null on submit.
const NO_VALUE = "__none__"

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
  // PROJ-33 — qualitative Bewertungs-Felder (alle optional, NO_VALUE → null).
  reasoning: z.string().max(5000),
  stakeholder_type_key: z.string().max(64),
  management_level: z.string(),
  decision_authority: z.string(),
  attitude: z.string(),
  conflict_potential: z.string(),
  communication_need: z.string(),
  preferred_channel: z.string(),
  // PROJ-31 — eligible-approver flag for formal Decisions.
  is_approver: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface StakeholderFormProps {
  tenantId: string
  /** PROJ-33-β — catalog für stakeholder_type_key dropdown. Optional;
   *  empty array fällt auf "kein Typ"-only zurück. */
  stakeholderTypes?: StakeholderType[]
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
    // PROJ-33 — DB-defaults gespiegelt: attitude=neutral, decision_authority=none.
    reasoning: "",
    stakeholder_type_key: "",
    management_level: NO_VALUE,
    decision_authority: "none",
    attitude: "neutral",
    conflict_potential: NO_VALUE,
    communication_need: NO_VALUE,
    preferred_channel: NO_VALUE,
    is_approver: false,
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
    reasoning: s.reasoning ?? "",
    stakeholder_type_key: s.stakeholder_type_key ?? "",
    management_level: s.management_level ?? NO_VALUE,
    decision_authority: s.decision_authority ?? "none",
    attitude: s.attitude ?? "neutral",
    conflict_potential: s.conflict_potential ?? NO_VALUE,
    communication_need: s.communication_need ?? NO_VALUE,
    preferred_channel: s.preferred_channel ?? NO_VALUE,
    is_approver: s.is_approver ?? false,
  }
}

function selectToNullable<T extends string>(value: string): T | null {
  return value && value !== NO_VALUE ? (value as T) : null
}

/**
 * Stakeholder edit/create form. Used inside a Sheet drawer in the
 * stakeholder tab. Empty strings on optional text fields are converted
 * to null when handed off to the API helper.
 */
export function StakeholderForm({
  tenantId,
  stakeholderTypes = [],
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
      // PROJ-33 — qualitative fields: NO_VALUE → null.
      reasoning: values.reasoning.trim() || null,
      stakeholder_type_key: selectToNullable<string>(values.stakeholder_type_key),
      management_level: selectToNullable<ManagementLevel>(values.management_level),
      decision_authority: selectToNullable<DecisionAuthority>(values.decision_authority),
      attitude: selectToNullable<StakeholderAttitude>(values.attitude),
      conflict_potential: selectToNullable<StakeholderScore>(values.conflict_potential),
      communication_need: selectToNullable<CommunicationNeed>(values.communication_need),
      preferred_channel: selectToNullable<PreferredChannel>(values.preferred_channel),
      is_approver: values.is_approver,
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

        <FormField
          control={form.control}
          name="is_approver"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Genehmiger-berechtigt</FormLabel>
                <FormDescription className="text-xs">
                  Erlaubt, diesen Stakeholder als Approver für formale
                  Entscheidungen auszuwählen (PROJ-31). Beim Deaktivieren
                  werden offene Approver-Anfragen automatisch zurückgezogen.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Genehmiger-berechtigt"
                />
              </FormControl>
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

        {/* PROJ-33 Phase 33-α — qualitative Bewertung. Eingeklappt by default,
            damit das Formular nicht überfüllt wirkt. */}
        <Collapsible className="border-t pt-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <span>Qualitative Bewertung (optional)</span>
              <ChevronDown
                className="h-4 w-4 transition-transform data-[state=open]:rotate-180"
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          {/* forceMount: keep all fields mounted so react-hook-form Controllers
              don't lose state when the section is closed. CSS hides the
              content via Radix's data-state attribute. */}
          <CollapsibleContent
            forceMount
            className="mt-4 space-y-4 data-[state=closed]:hidden"
          >
            <FormField
              control={form.control}
              name="reasoning"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Begründung / Treiber</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Warum hat dieser Stakeholder den dokumentierten Einfluss/Impact?"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Frei formuliert. Hilft beim späteren KI-Coaching (PROJ-36).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stakeholder_type_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stakeholder-Typ</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || NO_VALUE}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="– keine Auswahl –" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>– keine Auswahl –</SelectItem>
                        {stakeholderTypes
                          .filter((t) => t.is_active)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.key}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border"
                                  style={{ backgroundColor: t.color }}
                                  aria-hidden
                                />
                                <span>{t.label_de}</span>
                                {t.tenant_id === null && (
                                  <span className="text-xs text-muted-foreground">
                                    (Standard)
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    Globale Defaults + tenant-eigene Typen aus dem Catalog.
                    Tenant-Admin verwaltet eigene Typen unter Stammdaten.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="management_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Management-Ebene</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_VALUE}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="– keine Auswahl –" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VALUE}>– keine Auswahl –</SelectItem>
                          {MANAGEMENT_LEVELS.map((l) => (
                            <SelectItem key={l} value={l}>
                              {MANAGEMENT_LEVEL_LABELS[l]}
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
                name="decision_authority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entscheidungsbefugnis</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || "none"}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DECISION_AUTHORITIES.map((a) => (
                            <SelectItem key={a} value={a}>
                              {DECISION_AUTHORITY_LABELS[a]}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="attitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Haltung</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || "neutral"}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAKEHOLDER_ATTITUDES.map((a) => (
                            <SelectItem key={a} value={a}>
                              {STAKEHOLDER_ATTITUDE_LABELS[a]}
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
                name="conflict_potential"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Konflikt-Potenzial</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_VALUE}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="– keine Auswahl –" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VALUE}>– keine Auswahl –</SelectItem>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="communication_need"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kommunikationsbedarf</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_VALUE}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="– keine Auswahl –" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VALUE}>– keine Auswahl –</SelectItem>
                          {COMMUNICATION_NEEDS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {COMMUNICATION_NEED_LABELS[c]}
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
                name="preferred_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bevorzugter Kanal</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_VALUE}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="– keine Auswahl –" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VALUE}>– keine Auswahl –</SelectItem>
                          {PREFERRED_CHANNELS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PREFERRED_CHANNEL_LABELS[p]}
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
          </CollapsibleContent>
        </Collapsible>

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
