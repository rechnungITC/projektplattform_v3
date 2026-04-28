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
import {
  PROJECT_METHODS,
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import type { Project } from "@/types/project"
import { dateToIsoDate } from "@/lib/dates/iso-date"

import { DatePickerField } from "./date-picker-field"
import { ResponsibleUserPicker } from "./responsible-user-picker"

const projectNumberPattern = /^[A-Za-z0-9-]+$/

const editProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(255, "Name must be 255 characters or fewer"),
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
    // PROJ-6: method becomes nullable. Empty / null means "noch nicht
    // festgelegt" — first save commits it; further changes are blocked
    // by the DB trigger.
    project_method: z
      .enum([
        "scrum",
        "kanban",
        "safe",
        "waterfall",
        "pmi",
        "prince2",
        "vxt2",
      ])
      .nullable(),
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

type EditProjectValues = z.infer<typeof editProjectSchema>

interface EditProjectMasterDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Pick<
    Project,
    | "id"
    | "tenant_id"
    | "name"
    | "description"
    | "project_number"
    | "planned_start_date"
    | "planned_end_date"
    | "responsible_user_id"
  > & { project_method?: ProjectMethod | null }
  onSaved: () => void | Promise<void>
}

export function EditProjectMasterDataDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: EditProjectMasterDataDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)

  const defaultValues = React.useMemo<EditProjectValues>(
    () => ({
      name: project.name,
      description: project.description ?? "",
      project_number: project.project_number ?? "",
      planned_start_date: project.planned_start_date
        ? parseIsoDate(project.planned_start_date)
        : null,
      planned_end_date: project.planned_end_date
        ? parseIsoDate(project.planned_end_date)
        : null,
      responsible_user_id: project.responsible_user_id,
      project_method: (project.project_method ?? null) as ProjectMethod | null,
    }),
    [project]
  )

  const form = useForm<EditProjectValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues,
  })

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  const onSubmit = async (values: EditProjectValues) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
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
        // PROJ-7: send project_method along with the master-data update.
        // Backend column is added in the PROJ-7 migration; until then, the
        // PATCH route silently ignores unknown fields (Supabase update
        // accepts subset).
        project_method: values.project_method,
      }

      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.status === 404) {
        toast.warning("Update endpoint pending implementation", {
          description:
            "Backend route PATCH /api/projects/[id] is not built yet.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Could not update project", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Project updated")
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Could not update project", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update master data. Project type and lifecycle status cannot be
            changed here.
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
              name="project_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project number</FormLabel>
                  <FormControl>
                    <Input
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
                      rows={4}
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
                      tenantId={project.tenant_id}
                      value={field.value}
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
              name="project_method"
              render={({ field }) => {
                const methodLocked = project.project_method != null
                return (
                  <FormItem>
                    <FormLabel>
                      Methode{methodLocked ? " (fixiert)" : ""}
                    </FormLabel>
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) =>
                        field.onChange(v === "__none__" ? null : v)
                      }
                      disabled={submitting || methodLocked}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Methode wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">
                          Noch nicht festgelegt
                        </SelectItem>
                        {PROJECT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PROJECT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {methodLocked
                        ? "Die Methode ist nach der Erstwahl fixiert. Lege ein Sub-Projekt mit einer anderen Methode an, oder beantrage eine Methoden-Migration."
                        : "Sobald gesetzt, ist die Methode fixiert. Sub-Projekte können später eine andere Methode haben."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )
              }}
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
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function parseIsoDate(value: string): Date {
  // Treat the bare YYYY-MM-DD as a local-time date so it doesn't shift on render.
  const [yearStr, monthStr, dayStr] = value.slice(0, 10).split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  return new Date(year, month - 1, day)
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
