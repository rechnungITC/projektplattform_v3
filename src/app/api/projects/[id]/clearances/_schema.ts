import { z } from "zod"

// PROJ-100a — grant a need-to-know clearance. 'standard' is never granted
// (it is the open default every tenant member already has), so the grantable
// levels are 'confidential' and 'strict'.
export const grantClearanceSchema = z.object({
  user_id: z.string().uuid(),
  max_level: z.enum(["confidential", "strict"]),
  valid_until: z.string().datetime({ offset: true }).nullish(),
})

export type GrantClearanceInput = z.infer<typeof grantClearanceSchema>
