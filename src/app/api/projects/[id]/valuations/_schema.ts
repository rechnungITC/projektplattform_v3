import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"
import { VALUATION_LINK_KINDS, VALUATION_METHODS } from "@/types/valuation"

// PROJ-120 — Bewertungsversionen je Deal (unveränderliche Kette) + Findings-Links.

const levels = ["standard", "confidential", "strict"] as const
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

// Deal-Werte können groß sein → numeric(18,2) in der DB. Die Obergrenze hier
// verhindert nur offensichtlichen Unsinn und Overflow-Versuche.
const money = z
  .number()
  .finite()
  .min(0, "Betrag darf nicht negativ sein.")
  .max(9_999_999_999_999, "Betrag ist unrealistisch groß.")

export const VALUATION_SELECT =
  "id, tenant_id, project_id, version_no, supersedes_valuation_id, is_current, " +
  "version_comment, title, valuation_date, method, value_low, value_high, currency, " +
  "assumptions, author_user_id, confidentiality_level, created_by, created_at, updated_at"

export const VALUATION_LINK_SELECT =
  "id, tenant_id, valuation_id, linked_kind, linked_id, note, created_by, created_at"

export const createValuationVersionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    valuation_date: dateString,
    method: z.enum(VALUATION_METHODS),
    value_low: money.nullish(),
    value_high: money.nullish(),
    currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]).optional(),
    assumptions: z.string().trim().max(8000).nullish(),
    author_user_id: z.string().uuid().nullish(),
    version_comment: z.string().trim().max(2000).nullish(),
    confidentiality_level: z.enum(levels).optional(),
    // Pflicht, sobald bereits eine gültige Version existiert — die RPC lehnt
    // eine zweite Kette sonst mit 23514 ab (F1).
    supersedes_valuation_id: z.string().uuid().nullish(),
  })
  .refine(
    (v) =>
      v.value_low == null ||
      v.value_high == null ||
      v.value_high >= v.value_low,
    {
      message: "Der obere Wert muss größer oder gleich dem unteren Wert sein.",
      path: ["value_high"],
    }
  )

export const createValuationLinkSchema = z.object({
  linked_kind: z.enum(VALUATION_LINK_KINDS),
  linked_id: z.string().uuid(),
  note: z.string().trim().max(2000).nullish(),
})
