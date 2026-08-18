import { z } from "zod"

import {
  CONSTRUCTION_DEFECT_ACTIONS,
  CONSTRUCTION_DEFECT_SEVERITIES,
  CONSTRUCTION_DEFECT_STATUSES,
} from "@/types/construction-defect"

// PROJ-45-β — shared SELECT lists and request schemas for the defect routes.

/**
 * Explicit column list, never `*` — the schema-drift guard compares exactly
 * these names against the migration schema.
 *
 * The trade is joined two levels deep because the display label lives in the
 * tenant catalog and is never copied down (lock L7): defect → project trade →
 * catalog trade.
 */
export const DEFECT_SELECT =
  "id, tenant_id, project_id, defect_number, title, description, trade_id, " +
  "section_id, severity, status, due_date, responsible_user_id, vendor_id, " +
  "reported_done_by, reported_done_at, created_by, created_at, updated_at, " +
  "trade:project_construction_trades(id, trade_id, trade:construction_trades(id, key, label)), " +
  "section:construction_sections(id, label, path), " +
  "vendor:vendors(id, name)"

export const DEFECT_EVENT_SELECT =
  "id, tenant_id, defect_id, event_type, status_before, status_after, reason, " +
  "actor_id, created_at"

export const idSchema = z.string().uuid()

/** House style for a Postgres `date` on the wire (mirrors work-items/_schema). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD erwartet")

export const createDefectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Mandatory (lock L13) — the trade carries responsibility and the notice.
  trade_id: z.string().uuid(),
  severity: z.enum(CONSTRUCTION_DEFECT_SEVERITIES).optional(),
  section_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  due_date: isoDate.nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
})

/**
 * PATCH body. Every optional field is paired with an explicit `clear_*` switch,
 * because omitting a value means "leave unchanged" in the RPC — PROJ-122 shipped
 * a live defect where a withdrawn value silently survived an update that omitted
 * it. A value and its own `clear_*` flag together is ambiguous and refused.
 *
 * `trade_id` has no switch on purpose: the trade stays mandatory, so it can be
 * re-pointed but not emptied.
 */
export const updateDefectSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    clear_description: z.literal(true).optional(),
    severity: z.enum(CONSTRUCTION_DEFECT_SEVERITIES).optional(),
    trade_id: z.string().uuid().optional(),
    section_id: z.string().uuid().optional(),
    clear_section: z.literal(true).optional(),
    due_date: isoDate.optional(),
    clear_due_date: z.literal(true).optional(),
    responsible_user_id: z.string().uuid().optional(),
    clear_responsible: z.literal(true).optional(),
    vendor_id: z.string().uuid().optional(),
    clear_vendor: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })
  .refine((v) => !(v.description !== undefined && v.clear_description), {
    message: "Beschreibung kann nicht gleichzeitig gesetzt und geleert werden.",
  })
  .refine((v) => !(v.section_id !== undefined && v.clear_section), {
    message: "Bauabschnitt kann nicht gleichzeitig gesetzt und geleert werden.",
  })
  .refine((v) => !(v.due_date !== undefined && v.clear_due_date), {
    message: "Frist kann nicht gleichzeitig gesetzt und geleert werden.",
  })
  .refine((v) => !(v.responsible_user_id !== undefined && v.clear_responsible), {
    message: "Verantwortlicher kann nicht gleichzeitig gesetzt und geleert werden.",
  })
  .refine((v) => !(v.vendor_id !== undefined && v.clear_vendor), {
    message: "Nachunternehmer kann nicht gleichzeitig gesetzt und geleert werden.",
  })

export const transitionDefectSchema = z.object({
  action: z.enum(CONSTRUCTION_DEFECT_ACTIONS),
  reason: z.string().trim().max(2000).optional(),
})

/** Query-param guards for the list filters. */
export const defectStatusFilterSchema = z.enum(CONSTRUCTION_DEFECT_STATUSES)
export const defectSeverityFilterSchema = z.enum(CONSTRUCTION_DEFECT_SEVERITIES)

/**
 * Turns any Postgres error raised by one of the defect RPCs into the α-shaped
 * HTTP answer. Kept in one place so the three mutation routes cannot drift:
 *   42501 role refusal / four-eyes gate     -> 403
 *   23514 constraint (transition, guards)   -> 422
 *   22023 unknown enum value                -> 422
 *   23503 dangling reference                -> 422
 *   23505 duplicate                         -> 409
 *   P0002 project or defect not found       -> 404
 */
export function defectRpcErrorStatus(code: string | undefined): {
  code: string
  status: number
} | null {
  switch (code) {
    case "42501":
      return { code: "forbidden", status: 403 }
    case "23514":
      return { code: "constraint_violation", status: 422 }
    case "22023":
      return { code: "invalid_value", status: 422 }
    case "23503":
      return { code: "invalid_reference", status: 422 }
    case "23505":
      return { code: "duplicate_key", status: 409 }
    case "P0002":
      return { code: "not_found", status: 404 }
    default:
      return null
  }
}
