import { z } from "zod"

import { PROJECT_METHODS, type ProjectMethod } from "@/types/project-method"
import { PROJECT_TYPES, type ProjectType } from "@/types/project"
import { WORK_ITEM_KINDS, type WorkItemKind } from "@/types/work-item"

export const ASSISTANT_DIALOG_TTL_MS = 30 * 60 * 1000

const projectSlotSchema = z.enum([
  "name",
  "project_type",
  "project_method",
  "description",
])

const workItemSlotSchema = z.enum(["title", "project"])

const baseSchema = z.object({
  schema_version: z.literal(1),
  revision: z.number().int().nonnegative(),
  phase: z.enum(["collecting", "choosing_project", "reviewing"]),
  expires_at: z.string().datetime(),
  started_project_id: z.string().uuid().nullable(),
})

const projectDialogSchema = baseSchema.extend({
  pending_intent: z.literal("project_create_draft"),
  requested_slot: projectSlotSchema.nullable(),
  slots: z.object({
    name: z.string().trim().min(1).max(255).nullable(),
    project_type: z.enum(PROJECT_TYPES).nullable(),
    project_method: z.enum(PROJECT_METHODS).nullable(),
    description: z.string().trim().max(5000).nullable(),
    skipped: z.array(z.enum(["project_type", "project_method", "description"])),
  }),
  candidate_project_ids: z.array(z.string().uuid()).max(6),
})

const workItemDialogSchema = baseSchema.extend({
  pending_intent: z.literal("work_item_create_draft"),
  requested_slot: workItemSlotSchema.nullable(),
  slots: z.object({
    requested_kind: z.enum(WORK_ITEM_KINDS),
    title: z.string().trim().min(1).max(255).nullable(),
    description: z.string().trim().max(10_000).nullable(),
    project_query: z.string().trim().min(1).max(255).nullable(),
    project_id: z.string().uuid().nullable(),
  }),
  candidate_project_ids: z.array(z.string().uuid()).max(6),
})

export const assistantDialogStateSchema = z.discriminatedUnion(
  "pending_intent",
  [projectDialogSchema, workItemDialogSchema],
)

export type AssistantDialogState = z.infer<typeof assistantDialogStateSchema>
export type ProjectDialogState = z.infer<typeof projectDialogSchema>
export type WorkItemDialogState = z.infer<typeof workItemDialogSchema>
export type ProjectDialogSlot = z.infer<typeof projectSlotSchema>

export const assistantContinuationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project_choice"),
    project_id: z.string().uuid(),
    expected_revision: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("approve_project"),
    expected_revision: z.number().int().nonnegative(),
    completion_key: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("correct_project_field"),
    field: projectSlotSchema,
    value: z.string().trim().max(5000),
    expected_revision: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("cancel"),
    expected_revision: z.number().int().nonnegative(),
  }),
])

export type AssistantContinuation = z.infer<typeof assistantContinuationSchema>

export const assistantDialogCompletionSchema = z.object({
  intent: z.literal("project_create_draft"),
  completion_key: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  wizard_draft_id: z.string().uuid(),
  wizard_draft_name: z.string().max(255).nullable(),
  turn_id: z.string().uuid(),
  turn_created_at: z.string().datetime(),
})
export type AssistantDialogCompletion = z.infer<typeof assistantDialogCompletionSchema>

export function parseAssistantDialogState(value: unknown): AssistantDialogState | null {
  const parsed = assistantDialogStateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function isDialogExpired(
  state: AssistantDialogState,
  now = new Date(),
): boolean {
  return Date.parse(state.expires_at) <= now.getTime()
}

export function nextDialogExpiry(now = new Date()): string {
  return new Date(now.getTime() + ASSISTANT_DIALOG_TTL_MS).toISOString()
}

export function nextProjectSlot(
  state: ProjectDialogState,
): ProjectDialogSlot | null {
  if (!state.slots.name) return "name"
  if (!state.slots.project_type && !state.slots.skipped.includes("project_type")) {
    return "project_type"
  }
  if (!state.slots.project_method && !state.slots.skipped.includes("project_method")) {
    return "project_method"
  }
  if (state.slots.description === null && !state.slots.skipped.includes("description")) {
    return "description"
  }
  return null
}

export function isSkipAnswer(value: string): boolean {
  return /^(?:uberspringen|ueberspringen|überspringen|spater|spaeter|später|keine?|ohne|weiss ich noch nicht|weiß ich noch nicht|noch offen)$/i.test(
    value.trim(),
  )
}

export function parseProjectTypeAnswer(value: string): ProjectType | null {
  const text = normalizeAnswer(value)
  if (/\b(erp|sap)\b/.test(text)) return "erp"
  if (/\b(bau|construction|baustelle)\b/.test(text)) return "construction"
  if (/\b(software|app|portal|system)\b/.test(text)) return "software"
  if (/\b(allgemein|general)\b/.test(text)) return "general"
  if (/\b(m&a|ma|merger|akquisition)\b/.test(text)) return "ma"
  return null
}

export function parseProjectMethodAnswer(value: string): ProjectMethod | null {
  const text = normalizeAnswer(value)
  if (/\b(wasserfall|waterfall)\b/.test(text)) return "waterfall"
  if (/\b(prince\s*2|prince2)\b/.test(text)) return "prince2"
  if (/\b(vxt\s*2(?:\.0)?)\b/.test(text)) return "vxt2"
  return PROJECT_METHODS.find((method) => text.includes(method)) ?? null
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}
