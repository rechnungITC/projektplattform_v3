import { z } from "zod"

// PROJ-45-α — tenant-wide trade catalog (Gewerke).

export const CONSTRUCTION_TRADE_SELECT =
  "id, tenant_id, key, label, sort_order, is_active, created_at, updated_at"

/**
 * `key` is the stable identity a rename must not touch (lock L7): the label
 * changes, the key does not. Kept to the shape the DB CHECK enforces so a bad
 * value is rejected before it reaches Postgres.
 */
export const createConstructionTradeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Nur Kleinbuchstaben, Ziffern und Unterstriche."),
  label: z.string().trim().min(1).max(120),
  sort_order: z.number().int().min(0).max(100000).optional(),
})

export const updateConstructionTradeSchema = z
  .object({
    // No `key` here on purpose: renaming the label is the supported operation,
    // changing the identity is not.
    label: z.string().trim().min(1).max(120).optional(),
    sort_order: z.number().int().min(0).max(100000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })
