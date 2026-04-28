"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DecisionInput } from "@/lib/decisions/api"
import type { Decision } from "@/types/decision"
import type { Stakeholder } from "@/types/stakeholder"

const NO_DECIDER = "__none__"

const formSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich").max(255),
  decision_text: z
    .string()
    .trim()
    .min(1, "Entscheidungstext ist erforderlich")
    .max(10000),
  rationale: z.string().max(10000).optional(),
  decider_stakeholder_id: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface DecisionFormProps {
  /** When set, form is in revision mode and posts with supersedes_decision_id. */
  supersedes?: Decision
  /** Active stakeholders on this project — populates the decider picker. */
  stakeholders: Stakeholder[]
  onSubmit: (input: DecisionInput) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

export function DecisionForm({
  supersedes,
  stakeholders,
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
      decider_stakeholder_id:
        supersedes?.decider_stakeholder_id ?? NO_DECIDER,
    },
  })

  const handleSubmit = async (values: FormValues) => {
    const decider =
      values.decider_stakeholder_id &&
      values.decider_stakeholder_id !== NO_DECIDER
        ? values.decider_stakeholder_id
        : null

    if (!decider) {
      // Spec edge case: "no decider documented" warning surfaced at save time.
      toast.warning("Kein Entscheider dokumentiert", {
        description:
          "Diese Entscheidung wird ohne Entscheider:in geloggt. Für Compliance-Zwecke empfiehlt sich, eine:n Stakeholder:in zu hinterlegen.",
      })
    }

    const input: DecisionInput = {
      title: values.title.trim(),
      decision_text: values.decision_text.trim(),
      rationale: values.rationale?.trim() || null,
      decider_stakeholder_id: decider,
    }
    if (supersedes) {
      input.supersedes_decision_id = supersedes.id
      input.context_phase_id = supersedes.context_phase_id
      input.context_risk_id = supersedes.context_risk_id
    }
    await onSubmit(input)
  }

  const activeStakeholders = stakeholders.filter((s) => s.is_active)

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

        <FormField
          control={form.control}
          name="decider_stakeholder_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entscheider:in</FormLabel>
              <Select
                value={field.value || NO_DECIDER}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="– keine Auswahl –" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_DECIDER}>
                    – kein:e Entscheider:in –
                  </SelectItem>
                  {activeStakeholders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.role_key ? ` · ${s.role_key}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className="flex items-start gap-1">
                <AlertCircle
                  className="mt-0.5 h-3 w-3 shrink-0 text-amber-600"
                  aria-hidden
                />
                <span>
                  Optional. Ohne Entscheider:in wird beim Speichern eine
                  Compliance-Warnung angezeigt.
                </span>
              </FormDescription>
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
