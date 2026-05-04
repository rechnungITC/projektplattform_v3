/**
 * FX-rates POST Zod schema — admin-only versioned table (PROJ-22).
 * No PATCH route — rate changes are NEW rows.
 */

import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export const fxRateCreateSchema = z
  .object({
    from_currency: z.enum(
      SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
    ),
    to_currency: z.enum(
      SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
    ),
    rate: z.number().positive(),
    valid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
    source: z.enum(["manual", "tenant_override"] as const).optional(),
  })
  .refine((v) => v.from_currency !== v.to_currency, {
    message: "from_currency must differ from to_currency",
    path: ["to_currency"],
  })

/**
 * Pass-through normalize. No trim-able fields — currencies are enums, rate
 * is number, valid_on/source are enums/dates.
 */
export function normalizeFxRatePayload<T extends Record<string, unknown>>(
  data: T
): T {
  return { ...data } as T
}
