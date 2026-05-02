/**
 * PROJ-24 — synthetic INSERT/DELETE audit helper for the cost stack.
 *
 * The PROJ-10 audit trigger only fires on UPDATE; INSERT and DELETE on
 * `role_rates` and `work_item_cost_lines` are emitted from the API routes
 * via `audit_log_entries` writes. RLS on `audit_log_entries` only permits
 * SELECT, so writes go through the service-role admin client.
 *
 * Same shape as PROJ-22 budget-postings synthetic audit (see
 * `api/projects/[id]/budget/postings/route.ts`):
 *   - field_name = `<entity>_created` / `<entity>_deleted`
 *   - old_value  = null for INSERT, snapshot for DELETE
 *   - new_value  = snapshot for INSERT, null for DELETE
 *   - change_reason = short human-readable label
 *
 * Audit-failures are NEVER fatal — the caller's primary mutation already
 * succeeded; an audit hiccup must not surface as a 5xx to the user. Errors
 * are logged via console.error so they show up in Vercel logs.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export type CostAuditEntity = "role_rates" | "work_item_cost_lines"
export type CostAuditAction = "insert" | "delete"

export interface CostAuditInput {
  tenantId: string
  entity: CostAuditEntity
  entityId: string
  action: CostAuditAction
  /** For INSERT: the new row snapshot. For DELETE: null. */
  newValue: Record<string, unknown> | null
  /** For DELETE: the deleted row snapshot. For INSERT: null. */
  oldValue: Record<string, unknown> | null
  actorUserId: string
  /** Short human-readable label, max 100 chars (DB-CHECK). */
  reason: string
}

const FIELD_NAME_BY_ACTION: Record<CostAuditAction, string> = {
  insert: "row_created",
  delete: "row_deleted",
}

/**
 * Write one synthetic audit row for an INSERT/DELETE on a cost-stack
 * entity. Best-effort: failures are logged but never thrown.
 */
export async function writeCostAuditEntry(input: CostAuditInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("audit_log_entries").insert({
      tenant_id: input.tenantId,
      entity_type: input.entity,
      entity_id: input.entityId,
      field_name: FIELD_NAME_BY_ACTION[input.action],
      old_value: input.oldValue,
      new_value: input.newValue,
      actor_user_id: input.actorUserId,
      change_reason: input.reason,
    })
    if (error) {
      console.error(
        `[cost-audit] failed to write ${input.action} audit for ${input.entity} ${input.entityId}: ${error.message}`
      )
    }
  } catch (err) {
    console.error(
      `[cost-audit] unexpected error writing ${input.action} audit for ${input.entity} ${input.entityId}:`,
      err
    )
  }
}
