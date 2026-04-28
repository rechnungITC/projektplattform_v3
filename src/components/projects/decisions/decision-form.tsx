"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DecisionInput } from "@/lib/decisions/api"
import type { Decision } from "@/types/decision"

const formSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich").max(255),
  decision_text: z
    .string()
    .trim()
    .min(1, "Entscheidungstext ist erforderlich")
    .max(10000),
  rationale: z.string().max(10000).optional(),
})

type FormValues = z.infer<typeof formSchema>

interface DecisionFormProps {
  /** When set, form is in revision mode and posts with supersedes_decision_id. */
  supersedes?: Decision
  onSubmit: (input: DecisionInput) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

export function DecisionForm({
  supersedes,
  onSubmit,
  onCancel,
  submitting,
}: DecisionFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: supersedes?.title ?? "",
      decision_text: supersedes?.decision_text ?? "",
      rationale: supersedes?.rationale ?? "",
    },
  })

  const handleSubmit = async (values: FormValues) => {
    const input: DecisionInput = {
      title: values.title.trim(),
      decision_text: values.decision_text.trim(),
      rationale: values.rationale?.trim() || null,
    }
    if (supersedes) {
      input.supersedes_decision_id = supersedes.id
      input.decider_stakeholder_id = supersedes.decider_stakeholder_id
      input.context_phase_id = supersedes.context_phase_id
      input.context_risk_id = supersedes.context_risk_id
    }
    await onSubmit(input)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {supersedes ? (
          <Alert>
            <AlertDescription>
              Du erstellst eine Revision der Entscheidung „{supersedes.title}“.
              Die Originalfassung bleibt unverändert in der Historie sichtbar
              und wird als überholt markiert.
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input placeholder="z. B. ERP-Anbieter ausgewählt" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="decision_text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entscheidung</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Was wurde entschieden?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="rationale"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Begründung</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Warum wurde so entschieden?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Speichern …
              </>
            ) : supersedes ? (
              "Revision speichern"
            ) : (
              "Entscheidung loggen"
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
