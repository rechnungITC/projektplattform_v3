"use client"

import { ShieldAlert } from "lucide-react"
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
import { DEAL_SIDES, DEAL_SIDE_LABELS } from "@/types/ma-project"
import type { WizardData } from "@/types/wizard"

interface StepMaFoundationProps {
  tenantId: string
}

/**
 * PROJ-94 — conditional "M&A-Grundlage" step (only for project_type 'ma').
 * Collects the strategic foundation written to ma_project_profiles on finalize.
 * mandate_status is NOT set here — it starts 'draft' and transitions later in
 * the project room. Sponsor + objective (Step 1 description) are mandatory.
 */
export function StepMaFoundation({ tenantId }: StepMaFoundationProps) {
  const form = useFormContext<WizardData>()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Strategische Grundlage des Deals. Diese Angaben werden versioniert und
        können je nach Vertraulichkeit auf den engeren Deal-Kreis beschränkt
        werden. Die Zielsetzung kommt aus der Beschreibung in Schritt 1.
      </p>

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

      <div className="space-y-2 rounded-md border bg-muted/10 p-3">
        <FormLabel>Investitionsrahmen</FormLabel>
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
      </div>

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
