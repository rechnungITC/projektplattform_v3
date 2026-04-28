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
import type { OpenItemInput } from "@/lib/open-items/api"
import type { OpenItem } from "@/types/open-item"

const formSchema = z.object({
  title: z.string().trim().min(1, "Titel ist erforderlich").max(255),
  description: z.string().max(5000).optional(),
  status: z.enum(["open", "in_clarification", "closed"] as const),
  contact: z.string().max(255).optional(),
})

type FormValues = z.infer<typeof formSchema>

interface OpenItemFormProps {
  initial?: OpenItem
  onSubmit: (input: OpenItemInput) => Promise<void>
  onCancel: () => void
  submitting: boolean
}

export function OpenItemForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: OpenItemFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      status:
        initial?.status === "converted" ? "open" : initial?.status ?? "open",
      contact: initial?.contact ?? "",
    },
  })

  const handleSubmit = async (values: FormValues) => {
    const input: OpenItemInput = {
      title: values.title.trim(),
      description: values.description?.trim() || null,
      status: values.status,
      contact: values.contact?.trim() || null,
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
                  placeholder="z. B. Klärung mit Datenschutzbeauftragten"
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
                    <SelectItem value="open">Offen</SelectItem>
                    <SelectItem value="in_clarification">
                      In Klärung
                    </SelectItem>
                    <SelectItem value="closed">Geschlossen</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ansprechpartner</FormLabel>
                <FormControl>
                  <Input placeholder="Name oder Rolle" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
            ) : initial ? (
              "Speichern"
            ) : (
              "Punkt anlegen"
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
