import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import { createWorkItemChecked } from "@/lib/work-items/create-work-item"
import {
  WORK_ITEM_DESCRIPTION_MAX,
  WORK_ITEM_TITLE_MAX,
} from "@/lib/assistant/work-item-command"

/**
 * PROJ-144 — POST /api/assistant/work-item-drafts/[draftId]/confirm
 *
 * Schritt 2 des Zwei-Schritt-Flusses und das erste echte Bestätigungs-Gate des
 * Assistenten: **hier** entsteht das Work-Item, nicht beim Diktat (AC-144.16).
 *
 * Die Reihenfolge ist sicherheitsrelevant (Tech Design D5):
 *   1. Entwurf laden (RLS: nur eigene) und Offenheit prüfen
 *   2. Schreibrecht ERNEUT prüfen — zwischen Diktat und Klick kann die Rolle
 *      gewechselt haben
 *   3. Entwurf **beanspruchen** (open → claiming), bedingt auf `status='open'`
 *   4. Work-Item über den geteilten, geprüften Pfad anlegen
 *   5. Entwurf abschließen (confirmed + Verweis)
 *
 * Erst beanspruchen, dann anlegen: ein Doppelklick oder ein zweiter Tab
 * verliert das bedingte Update und kann kein zweites Work-Item erzeugen
 * (AC-144.19). Die naive Reihenfolge hätte genau dieses Loch.
 */

const confirmSchema = z.object({
  // Der Nutzer darf den Titel vor dem Anlegen korrigieren — die
  // Spracherkennung hört „Rechnungsimport" gelegentlich als „Rechnung Sport".
  // Ohne diese Möglichkeit wäre die Bestätigung eine Formsache.
  title: z.string().trim().min(1).max(WORK_ITEM_TITLE_MAX).optional(),
  description: z
    .string()
    .max(WORK_ITEM_DESCRIPTION_MAX)
    .nullable()
    .optional(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await context.params
  if (!z.string().uuid().safeParse(draftId).success) {
    return apiError("validation_error", "Invalid draft id.", 400, "draftId")
  }

  let body: unknown = {}
  const rawBody = await request.text()
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      return apiError("invalid_body", "Body must be valid JSON.", 400)
    }
  }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const moduleDenied = await requireModuleActive(supabase, tenantId, "assistant", {
    intent: "write",
  })
  if (moduleDenied) return moduleDenied

  // 1. Entwurf laden. RLS lässt nur eigene Zeilen durch; fremde und nicht
  //    vorhandene Entwürfe sind daher nicht unterscheidbar — das ist gewollt.
  const { data: draftRow, error: draftError } = await supabase
    .from("assistant_work_item_drafts")
    .select("id, project_id, target_kind, title, description, status")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle()

  if (draftError) return apiError("internal_error", draftError.message, 500)
  if (!draftRow) return apiError("not_found", "Draft not found.", 404)

  const draft = draftRow as {
    id: string
    project_id: string
    target_kind: string
    title: string
    description: string | null
    status: string
  }

  if (draft.status !== "open") {
    return apiError(
      "draft_not_open",
      draft.status === "confirmed"
        ? "This draft has already been created."
        : "This draft is no longer open.",
      409,
    )
  }

  // 2. Schreibrecht erneut prüfen (404 bei fremdem Mandanten, 403 bei zu
  //    niedriger Rolle) — der Rollenwechsel zwischen den Schritten führt zu
  //    einer klaren Absage statt zu einem halben Zustand.
  const access = await requireProjectAccess(
    supabase,
    draft.project_id,
    userId,
    "edit",
  )
  if (access.error) return access.error

  const title = parsed.data.title ?? draft.title
  const description =
    parsed.data.description === undefined
      ? draft.description
      : parsed.data.description

  // 3. Beanspruchen. Das bedingte `status='open'` ist der Doppelklick-Schutz.
  const { data: claimed, error: claimError } = await supabase
    .from("assistant_work_item_drafts")
    .update({ status: "claiming", title, description })
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id")
    .maybeSingle()

  if (claimError) return apiError("internal_error", claimError.message, 500)
  if (!claimed) {
    return apiError(
      "draft_not_open",
      "This draft is being created or was already used.",
      409,
    )
  }

  // 4. Anlegen über den geteilten, geprüften Pfad (D3): Methoden-Sichtbarkeit,
  //    Elternregeln, Mandantenbindung und RLS gelten unverändert.
  const created = await createWorkItemChecked({
    supabase,
    userId,
    projectId: draft.project_id,
    input: {
      kind: draft.target_kind,
      title,
      description,
    },
  })

  if (!created.ok) {
    // Freigeben, damit der Nutzer es nach einer Korrektur erneut versuchen kann.
    await supabase
      .from("assistant_work_item_drafts")
      .update({ status: "open" })
      .eq("id", draftId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "claiming")

    const { code, message, status, field } = created.failure
    return apiError(code, message, status, field)
  }

  const workItem = created.row as { id: string }

  // 5. Abschließen. Der Verweis ist zugleich die Verbraucht-Sicherung.
  const { error: finalizeError } = await supabase
    .from("assistant_work_item_drafts")
    .update({ status: "confirmed", created_work_item_id: workItem.id })
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)

  if (finalizeError) {
    // Das Work-Item existiert bereits — es wäre falsch, das dem Nutzer als
    // Fehlschlag zu melden. Der Entwurf bleibt auf `claiming` und damit
    // unbestätigbar; der Aufräum-Lauf entfernt ihn.
    return NextResponse.json(
      {
        work_item: created.row,
        draft_id: draftId,
        warning: "draft_finalize_failed",
      },
      { status: 201 },
    )
  }

  // Handlungs-Protokoll des mutierenden Schritts (AC-144.27). Bewusst über die
  // bestehende Assistant-Aktionstabelle statt über ein zweites Protokoll;
  // ohne Sitzungs-/Turn-Bezug, weil die Bestätigung ein eigener Vorgang ist.
  await supabase.from("assistant_action_events").insert({
    tenant_id: tenantId,
    user_id: userId,
    project_id: draft.project_id,
    recognized_intent: "work_item_create_draft",
    action_key: "work_item_draft.confirm",
    confirmation_state: "confirmed",
    executed_tools: [
      {
        key: "work_item.create",
        label: "Work-Item anlegen",
        status: "executed",
        metadata: {
          draft_id: draftId,
          work_item_id: workItem.id,
          kind: draft.target_kind,
        },
      },
    ],
    result_status: "success",
  })

  return NextResponse.json(
    { work_item: created.row, draft_id: draftId },
    { status: 201 },
  )
}
