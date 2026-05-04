/**
 * Project members POST Zod schema — colocated module so the route AND
 * the drift-test can both import it.
 *
 * No trim-able fields: user_id is UUID, role is enum. Provided as
 * structural twin to the other entity _schema.ts modules.
 */

import { z } from "zod"

export const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["lead", "editor", "viewer"]),
})

export function normalizeMemberPayload<T extends Record<string, unknown>>(
  data: T
): T {
  return { ...data } as T
}
