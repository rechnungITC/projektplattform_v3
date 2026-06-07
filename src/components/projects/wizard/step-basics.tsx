"use client"

import { useFormContext } from "react-hook-form"

import { DatePickerField } from "@/components/projects/date-picker-field"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { dateToIsoDate, parseLocalDate } from "@/lib/dates/iso-date"
import { Sparkles } from "lucide-react"

import type { WizardData } from "@/types/wizard"

interface StepBasicsProps {
  tenantId: string
}

/**
 * Step 1 — name, project number, description, dates, responsible user.
 * Mirrors the field set of today's NewProjectDialog so the migration
 * doesn't lose any input the user already knows about.
 */
export function StepBasics({ tenantId }: StepBasicsProps) {
  const form = useFormContext<WizardData>()

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Projektname *</FormLabel>
            <FormControl>
              <Input placeholder="z. B. ERP-Migration 2026" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="project_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Projektnummer (optional)</FormLabel>
            <FormControl>
              <Input
                placeholder="z. B. PRJ-2026-001"
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormDescription>
              Buchstaben, Ziffern und Bindestriche.
            </FormDescription>
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
              <Textarea
                placeholder="Worum geht es in diesem Projekt?"
                rows={3}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="planned_start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Geplanter Start</FormLabel>
              <FormControl>
                <DatePickerField
                  value={parseLocalDate(field.value)}
                  onChange={(date) => field.onChange(dateToIsoDate(date))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="planned_end_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Geplantes Ende</FormLabel>
              <FormControl>
                <DatePickerField
                  value={parseLocalDate(field.value)}
                  onChange={(date) => field.onChange(dateToIsoDate(date))}
                />
              </FormControl>
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
            <FormLabel>Projektleitung *</FormLabel>
            <FormControl>
              <ResponsibleUserPicker
                tenantId={tenantId}
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormDescription>
              Wer trägt operativ Verantwortung. Lässt sich später ändern.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* PROJ-70-ε (AC-ε5) — opt into the KI-Backlog step. Adds a step
          after the detail questions where a kickoff file is uploaded. */}
      <FormField
        control={form.control}
        name="ki_backlog.enabled"
        render={({ field }) => (
          <FormItem className="flex items-start justify-between gap-4 rounded-md border border-dashed bg-muted/10 p-3">
            <div className="space-y-0.5">
              <FormLabel className="flex items-center gap-1.5">
                <Sparkles
                  className="h-3.5 w-3.5 text-violet-500"
                  aria-hidden
                />
                KI-Backlog aus Kickoff-Datei generieren
              </FormLabel>
              <FormDescription>
                Optional: Lade später im Wizard ein Kickoff-Dokument hoch
                (PDF · DOCX · TXT · MD · EML · MSG). Nach dem Anlegen
                schlägt die KI eine Backlog-Struktur vor.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                aria-label="KI-Backlog-Schritt aktivieren"
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  )
}
