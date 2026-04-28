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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { RiskInput } from "@/lib/risks/api"
import {
  RISK_STATUSES,
  RISK_STATUS_LABELS,
  type Risk,
  type RiskStatus,
} from "@/types/risk"

const formSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich").max(255),
  description: z.string().max(5000).optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(RISK_STATUSES as unknown as [RiskStatus, ...RiskStatus[]]),
  mitigation: z.string().max(5000).optional(),
  responsible_user_id: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface RiskFormProps {
  tenantId: string | null
  initial?: Risk
  onSubmit: (input: RiskInput) => Promise<void>
  onCancel: () => void
  submitting: boolean
  secondaryAction?: React.ReactNode
}

const SCALE = [1, 2, 3, 4, 5] as const

export function RiskForm({
  tenantId,
  initial,
  onSubmit,
  onCancel,
  submitting,
  secondaryAction,
}: RiskFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      probability: initial?.probability ?? 3,
      impact: initial?.impact ?? 3,
      status: initial?.status ?? "open",
      mitigation: initial?.mitigation ?? "",
      responsible_user_id: initial?.responsible_user_id ?? "",
    },
  })

  const probability = form.watch("probability")
  const impact = form.watch("impact")
  const score = (Number(probability) || 0) * (Number(impact) || 0)

  const handleSubmit = async (values: FormValues) => {
    const input: RiskInput = {
      title: values.title.trim(),
      description: values.description?.trim() || null,
      probability: Number(values.probability),
      impact: Number(values.impact),
      status: values.status,
      mitigation: values.mitigation?.trim() || null,
      responsible_user_id: values.responsible_user_id?.trim() || null,
    }
    await onSubmit(input)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input
                  placeholder="z. B. Verzögerung der Datenmigration"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Beschreibung</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="probability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wahrscheinlichkeit (1–5)</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SCALE.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
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
            name="impact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Auswirkung (1–5)</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SCALE.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Score = Wahrscheinlichkeit × Auswirkung ={" "}
          <span className="font-mono">{score}</span>
        </p>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RISK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {RISK_STATUS_LABELS[s]}
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
          name="mitigation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minderungsmaßnahme</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Wie wird das Risiko reduziert?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="responsible_user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verantwortlich</FormLabel>
              <FormControl>
                {tenantId ? (
                  <ResponsibleUserPicker
                    tenantId={tenantId}
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v)}
                    placeholder="– keine Zuweisung –"
                  />
                ) : (
                  <Input disabled placeholder="Lade Mitglieder …" />
                )}
              </FormControl>
              <FormDescription>
                Optional. Eine Person aus dem Mandanten.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {secondaryAction ?? <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Speichern …
                </>
              ) : initial ? (
                "Speichern"
              ) : (
                "Risiko anlegen"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
