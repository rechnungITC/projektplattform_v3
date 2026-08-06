"use client"

import { LayoutTemplate, ShieldAlert } from "lucide-react"
import * as React from "react"
import { useFormContext } from "react-hook-form"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import {
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
  MA_CONFIDENTIALITY_LEVELS,
  MA_CONFIDENTIALITY_LEVEL_LABELS,
} from "@/types/confidentiality"
import {
  listMaProjectTemplates,
  type MaProjectTemplate,
} from "@/lib/ma-project/templates-api"
import { DEAL_SIDES, DEAL_SIDE_LABELS } from "@/types/ma-project"
import type { WizardData } from "@/types/wizard"

interface StepMaFoundationProps {
  tenantId: string
}

const NO_TEMPLATE = "__none__"

/**
 * PROJ-94 — conditional "M&A-Grundlage" step (only for project_type 'ma').
 * Collects the strategic foundation written to ma_project_profiles on finalize.
 * mandate_status is NOT set here — it starts 'draft' and transitions later in
 * the project room. Sponsor + objective (Step 1 description) are mandatory.
 */
export function StepMaFoundation({ tenantId }: StepMaFoundationProps) {
  const form = useFormContext<WizardData>()
  const [templates, setTemplates] = React.useState<MaProjectTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void listMaProjectTemplates()
      .then((rows) => {
        if (!cancelled) setTemplates(rows.filter((t) => t.is_active))
      })
      .catch(() => {
        // Non-fatal: the picker just stays empty; a project can start without a template.
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Strategische Grundlage des Deals. Diese Angaben werden versioniert und
        können je nach Vertraulichkeit auf den engeren Deal-Kreis beschränkt
        werden. Die Zielsetzung kommt aus der Beschreibung in Schritt 1.
      </p>

      <FormField
        control={form.control}
        name="ma_foundation.template_id"
        render={({ field }) => {
          const selected = templates.find((t) => t.id === field.value)
          return (
            <FormItem className="rounded-md border bg-muted/10 p-3">
              <FormLabel className="flex items-center gap-1.5">
                <LayoutTemplate
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden
                />
                Projekt-Template
              </FormLabel>
              <Select
                value={field.value ?? NO_TEMPLATE}
                onValueChange={(v) =>
                  field.onChange(v === NO_TEMPLATE ? null : v)
                }
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        templatesLoaded
                          ? "Kein Template (leer starten)"
                          : "Templates werden geladen …"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>
                    Kein Template (leer starten)
                  </SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {selected
                  ? buildTemplatePreview(selected)
                  : "Optional: Standardstruktur (Phasen, Workstreams, Deliverables, Aufgaben) aus einem Template übernehmen. Vorlagen pflegt der Admin unter Stammdaten."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="ma_foundation.deal_side"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deal-Variante</FormLabel>
              <Select
                value={field.value ?? undefined}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Variante wählen" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {DEAL_SIDES.map((side) => (
                    <SelectItem key={side} value={side}>
                      {DEAL_SIDE_LABELS[side]}
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
          name="ma_foundation.confidentiality_level"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                Vertraulichkeit
              </FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MA_CONFIDENTIALITY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {MA_CONFIDENTIALITY_LEVEL_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Need-to-know: höhere Stufen sind nur für freigeschaltete
                Personen sichtbar.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="ma_foundation.sponsor_user_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sponsor *</FormLabel>
            <FormControl>
              <ResponsibleUserPicker
                tenantId={tenantId}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            </FormControl>
            <FormDescription>
              Executive Sponsor / Auftraggeber des Mandats.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="ma_foundation.deal_rationale"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Deal-Rationale</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Warum dieser Deal? Strategische Begründung."
                rows={3}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="ma_foundation.search_profile"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Suchprofil</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Zielkriterien: Branche, Größe, Region, Technologie …"
                rows={3}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="ma_foundation.exclusion_criteria"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Ausschlusskriterien</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Was kommt nicht in Frage (K.-o.-Kriterien)?"
                rows={2}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <fieldset className="space-y-2 rounded-md border bg-muted/10 p-3">
        <legend className="px-1 text-sm font-medium leading-none">
          Investitionsrahmen
        </legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <FormField
            control={form.control}
            name="ma_foundation.investment_frame_amount"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="Betrag (z. B. 5000000)"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ma_foundation.investment_frame_currency"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    maxLength={3}
                    placeholder="EUR"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value.toUpperCase())
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="ma_foundation.investment_frame_note"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Notiz (z. B. EK-finanziert, inkl. Earn-out)"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </fieldset>

      <FormField
        control={form.control}
        name="ma_foundation.strategic_document_link"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Strategie-Dokument (Link)</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="https://…"
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormDescription>
              Optional: Link zur ausführlichen Deal-Rationale / zum Strategie-Dok.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

/**
 * PROJ-Y-96e — builds the wizard template-picker preview text.
 * Shown as FormDescription under the Select once the user picks a template.
 * Exported for unit-test — pinned to spec AC5 "Vorschau zeigt Task-Counts".
 */
export function buildTemplatePreview(template: MaProjectTemplate): string {
  const wsCount = template.workstreams.length
  const delCount = template.deliverables.length
  const tasks = template.tasks ?? []
  const taskCount = tasks.filter((t) => t.target_kind === "task").length
  const subtaskCount = tasks.filter((t) => t.target_kind === "subtask").length

  const parts = [
    `${wsCount} Workstreams`,
    `${delCount} Deliverables`,
    `${taskCount} Aufgaben`,
  ]
  const suffix = subtaskCount > 0 ? ` (${subtaskCount} Sub-Aufgaben)` : ""
  return `Beim Anlegen werden Phasen, ${parts.join(", ")} übernommen${suffix} — danach frei anpassbar.`
}
