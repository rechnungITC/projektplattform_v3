import { z } from "zod"

// PROJ-100b — clearance-profile catalog. 'standard' is never granted (it is the
// open default), so a profile's level mirrors the grant schema.
export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  granted_level: z.enum(["confidential", "strict"]),
  is_active: z.boolean().optional(),
})

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullish(),
    granted_level: z.enum(["confidential", "strict"]).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export type CreateProfileInput = z.infer<typeof createProfileSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
