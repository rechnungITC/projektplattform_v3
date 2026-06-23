import { z } from "zod"

// PROJ-94 — PATCH the M&A strategic foundation. All fields optional (partial
// update). mandate_status is NOT here — it transitions via the dedicated
// /ma-profile/mandate route (state machine + audit). Mirrors the DB column
// caps so a bad payload fails at the API with a 400 instead of a 23514.
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish()

export const patchMaProfileSchema = z
  .object({
    deal_side: z.enum(["buy", "sell", "jv", "carve_out"]).nullish(),
    sponsor_user_id: z.string().uuid(),
    deal_rationale: optionalText(20000),
    search_profile: optionalText(20000),
    exclusion_criteria: optionalText(20000),
    investment_frame_amount: z.number().nonnegative().nullish(),
    investment_frame_currency: z.string().trim().length(3).nullish(),
    investment_frame_note: optionalText(4000),
    strategic_document_link: z.string().trim().url().max(2048).nullish(),
    confidentiality_level: z.enum(["standard", "confidential", "strict"]),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export type PatchMaProfileInput = z.infer<typeof patchMaProfileSchema>

export const transitionMandateSchema = z.object({
  to_status: z.enum(["draft", "submitted", "approved"]),
})
