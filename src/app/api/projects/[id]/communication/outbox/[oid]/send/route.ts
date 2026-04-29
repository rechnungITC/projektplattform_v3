import { NextResponse } from "next/server"
import { z } from "zod"

import { dispatchOutboxRow } from "@/lib/communication/outbox-service"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import type { CommunicationOutboxEntry } from "@/types/communication"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../../_lib/route-helpers"

// PROJ-13 — dispatch a draft outbox entry through its channel.
// POST /api/projects/[id]/communication/outbox/[oid]/send

const SELECT_COLUMNS =
  "id, tenant_id, project_id, channel, recipient, subject, body, metadata, status, error_detail, sent_at, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string; oid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid outbox id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: outbox, error: readErr } = await supabase
    .from("communication_outbox")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()

  if (readErr) {
    return apiError("read_failed", readErr.message, 500)
  }
  if (!outbox) {
    return apiError("not_found", "Outbox entry not found.", 404)
  }
  if (outbox.status !== "draft") {
    return apiError(
      "invalid_state",
      `Only drafts may be sent. Current status: ${outbox.status}.`,
      409
    )
  }

  const { result, row } = await dispatchOutboxRow({
    supabase,
    outbox: outbox as CommunicationOutboxEntry,
  })

  return NextResponse.json(
    {
      outbox: row,
      dispatch: {
        status: result.status,
        error_detail: result.error_detail,
        class3_blocked: result.class3_blocked,
        stub: result.stub,
      },
    },
    { status: result.status === "sent" ? 200 : 202 }
  )
}
