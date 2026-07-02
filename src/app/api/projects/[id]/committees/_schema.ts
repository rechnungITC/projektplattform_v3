import { z } from "zod"

// PROJ-98 — committees & committee members. Shared Zod schemas + select shape.

export const CONFIDENTIALITY_LEVELS = ["standard", "confidential", "strict"] as const
export const COMMITTEE_MEMBER_ROLES = ["chair", "member", "observer"] as const

const optionalText = z.string().trim().max(4000).nullish()
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code.")
  .nullish()
const thresholdEur = z.number().nonnegative().nullish()

export const createCommitteeSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  purpose: optionalText,
  cadence: z.string().trim().max(200).nullish(),
  decision_scope: optionalText,
  value_threshold_eur: thresholdEur,
  value_threshold_currency: currency,
  escalation_scope: optionalText,
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).optional(),
})

export const updateCommitteeSchema = createCommitteeSchema

export const addCommitteeMemberSchema = z.object({
  stakeholder_id: z.string().uuid(),
  role_in_committee: z.enum(COMMITTEE_MEMBER_ROLES).optional(),
  is_voting: z.boolean().optional(),
})

export const updateCommitteeMemberSchema = z
  .object({
    role_in_committee: z.enum(COMMITTEE_MEMBER_ROLES).optional(),
    is_voting: z.boolean().optional(),
  })
  .refine((v) => v.role_in_committee !== undefined || v.is_voting !== undefined, {
    message: "Provide role_in_committee and/or is_voting.",
  })

// Committee row + embedded members (each with its stakeholder name). RLS on
// committee_members + stakeholders applies to the embed.
export const COMMITTEE_SELECT =
  "id, name, purpose, cadence, decision_scope, value_threshold_eur, value_threshold_currency, escalation_scope, confidentiality_level, sort_order, created_at, updated_at, " +
  "members:committee_members(id, stakeholder_id, role_in_committee, is_voting, stakeholder:stakeholders(id, name))"