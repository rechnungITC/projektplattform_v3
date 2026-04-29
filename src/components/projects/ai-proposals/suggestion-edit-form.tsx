"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { KiRiskSuggestionPayload } from "@/types/ki"

const formSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich").max(255),
  description: z.string().max(5000).optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z.string().max(5000).optional(),
})

type FormValues = z.infer<typeof formSchema>

interface SuggestionEditFormProps {
  initial: KiRiskSuggestionPayload
  onSave: (payload: KiRiskSuggestionPayload) => Promise<void>
  onCancel: () => void
  saving: boolean
}

const SCALE = [1, 2, 3, 4, 5] as const

export function SuggestionEditForm({
  initial,
  onSave,
  onCancel,
  saving,
}: SuggestionEditFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial.title,
      description: initial.description ?? "",
      probability: initial.probability,
      impact: initial.impact,
      mitigation: initial.mitigation ?? "",
    },
  })

  const probability = form.watch("probability")
  const impact = form.watch("impact")
  const score = (Number(probability) || 0) * (Number(impact) || 0)

  const handleSubmit = async (values: FormValues) => {
    await onSave({
      title: values.title.trim(),
      description: values.description?.trim() || null,
      probability: values.probability,
      impact: values.impact,
      status: initial.status,
      mitigation: values.mitigation?.trim() || null,
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input {...field} />
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
                <FormLabel>Wahrsch. (1–5)</FormLabel>
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
                <FormLabel>Auswirk. (1–5)</FormLabel>
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
          Score = <span className="font-mono">{score}</span>
        </p>
        <FormField
          control={form.control}
          name="mitigation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minderungsmaßnahme</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                Speichern …
              </>
            ) : (
              "Übernehmen"
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
