"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useAuth } from "@/hooks/use-auth"
import {
  PROJECT_METHODS,
  PROJECT_METHOD_DESCRIPTIONS,
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  type ProjectType,
} from "@/types/project"

import { DatePickerField } from "./date-picker-field"
import { ResponsibleUserPicker } from "./responsible-user-picker"

const projectNumberPattern = /^[A-Za-z0-9-]+$/

const newProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(255, "Name must be 255 characters or fewer"),
    project_type: z.enum(["erp", "construction", "software", "general"]),
    project_method: z.enum([
      "scrum",
      "kanban",
      "safe",
      "waterfall",
      "pmi",
      "general",
    ]),
    description: z
      .string()
      .max(5000, "Description must be 5000 characters or fewer")
      .optional()
      .or(z.literal("")),
    project_number: z
      .string()
      .max(100, "Project number must be 100 characters or fewer")
      .regex(projectNumberPattern, {
        message: "Use only letters, digits and dashes",
      })
      .optional()
      .or(z.literal("")),
    planned_start_date: z.date().nullable().optional(),
    planned_end_date: z.date().nullable().optional(),
    responsible_user_id: z.string().uuid("Pick a responsible user"),
  })
  .refine(
    (values) => {
      if (!values.planned_start_date || !values.planned_end_date) return true
      return values.planned_end_date >= values.planned_start_date
    },
    {
      message: "End date must be on or after the start date",
      path: ["planned_end_date"],
    }
  )

type NewProjectValues = z.infer<typeof newProjectSchema>

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  onCreated: () => void | Promise<void>
}

export function NewProjectDialog({
  open,
  onOpenChange,
  tenantId,
  onCreated,
}: NewProjectDialogProps) {
  const { user } = useAuth()
  const [submitting, setSubmitting] = React.useState(false)

  const form = useForm<NewProjectValues>({
    resolver: zodResolver(newProjectSchema),
    defaultValues: {
      name: "",
      project_type: "general" satisfies ProjectType,
      project_method: "general" satisfies ProjectMethod,
      description: "",
      project_number: "",
      planned_start_date: null,
      planned_end_date: null,
      responsible_user_id: user.id,
    },
  })

  React.useEffect(() => {
    if (!open) {
      form.reset({
        name: "",
        project_type: "general",
        project_method: "general",
        description: "",
        project_number: "",
        planned_start_date: null,
        planned_end_date: null,
        responsible_user_id: user.id,
      })
    }
  }, [open, form, user.id])

  const onSubmit = async (values: NewProjectValues) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        project_type: values.project_type,
        // PROJ-7: forward-compatible — POST /api/projects ignores
        // unknown fields today; will persist once the backend
        // migration adds the column.
        project_method: values.project_method,
        description:
          values.description && values.description.length > 0
            ? values.description
            : null,
        project_number:
          values.project_number && values.project_number.length > 0
            ? values.project_number
            : null,
        planned_start_date: dateToIsoDate(values.planned_start_date),
        planned_end_date: dateToIsoDate(values.planned_end_date),
        responsible_user_id: values.responsible_user_id,
        tenant_id: tenantId,
      }

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 404) {
        toast.warning("Create project endpoint pending implementation", {
          description: "Backend route POST /api/projects is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not create project", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Project created", {
        description: `${values.name.trim()} is ready.`,
      })
      await onCreated()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not create project", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Create a project. You can edit master data later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ERP rollout phase 2"
                      maxLength={255}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="project_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a project type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROJECT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {PROJECT_TYPE_LABELS[type]}
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
              name="project_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Methode</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Methode wählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROJECT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PROJECT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {PROJECT_METHOD_DESCRIPTIONS[field.value as ProjectMethod]}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ERP-2026-12"
                      maxLength={100}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional. Letters, digits and dashes only.
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's the goal of this project?"
                      rows={3}
                      maxLength={5000}
                      disabled={submitting}
                      {...field}
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
                    <FormLabel>Planned start</FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        disabled={submitting}
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
                    <FormLabel>Planned end</FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        minDate={form.watch("planned_start_date") ?? null}
                        disabled={submitting}
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
                  <FormLabel>Responsible</FormLabel>
                  <FormControl>
                    <ResponsibleUserPicker
                      tenantId={tenantId}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Create project
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function dateToIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null
  // Use local date components so the UTC offset doesn't shift the day.
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string; code?: string; field?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Request failed (${response.status})`
    }
    return data.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
