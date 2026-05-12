import { z } from "zod"

/**
 * PROJ-34-α — shared Zod schemas for stakeholder interaction routes.
 *
 * Channels / directions / signal sources mirror the DB CHECK constraints
 * in `supabase/migrations/20260512170000_proj34_alpha_interactions.sql`.
 */

export const ChannelEnum = z.enum([
  "email",
  "meeting",
  "chat",
  "phone",
  "other",
])

export const DirectionEnum = z.enum(["inbound", "outbound", "bidirectional"])

export const SourceEnum = z.enum(["manual", "context_ingestion", "assistant"])

export const SignalSourceEnum = z.enum([
  "manual",
  "ai_proposed",
  "ai_accepted",
  "ai_rejected",
])

// CIA-L3: per-participant signal payload. All optional in α — manuelle und
// AI-gestuetzte Werte folgen erst in 34-β / 34-γ.
export const ParticipantInputSchema = z.object({
  stakeholder_id: z.string().uuid(),
  participant_sentiment: z.number().int().min(-2).max(2).optional().nullable(),
  participant_sentiment_source: SignalSourceEnum.optional().nullable(),
  participant_cooperation_signal: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .optional()
    .nullable(),
  participant_cooperation_signal_source: SignalSourceEnum.optional().nullable(),
})

export const CreateInteractionSchema = z.object({
  channel: ChannelEnum,
  direction: DirectionEnum,
  interaction_date: z.string().datetime({ offset: true }),
  summary: z.string().trim().min(1).max(500),
  awaiting_response: z.boolean().optional().default(false),
  response_due_date: z.string().date().optional().nullable(),
  replies_to_interaction_id: z.string().uuid().optional().nullable(),
  source: SourceEnum.optional().default("manual"),
  source_context_id: z.string().uuid().optional().nullable(),
  // mind. 1 Stakeholder ist Pflicht. Der Stakeholder aus der URL
  // wird automatisch ergaenzt, weitere Participants werden hier
  // mitgegeben.
  additional_participants: z.array(ParticipantInputSchema).optional().default([]),
})

// Partial-on-Create schema with defaults stripped — sonst leaken `false`-
// und `'manual'`-Defaults in jeden PATCH-Body und triggern den Update-Pfad
// auch bei leeren Bodies.
export const UpdateInteractionSchema = z.object({
  channel: ChannelEnum.optional(),
  direction: DirectionEnum.optional(),
  interaction_date: z.string().datetime({ offset: true }).optional(),
  summary: z.string().trim().min(1).max(500).optional(),
  awaiting_response: z.boolean().optional(),
  response_due_date: z.string().date().optional().nullable(),
  response_received_date: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable(),
  replies_to_interaction_id: z.string().uuid().optional().nullable(),
})

export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>
export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>
export type ParticipantInput = z.infer<typeof ParticipantInputSchema>
