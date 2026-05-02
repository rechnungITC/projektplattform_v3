/**
 * PROJ-33 Phase 33-δ — Self-Assessment Magic-Link Invite (PM-side).
 *
 * POST   /api/projects/[id]/stakeholders/[sid]/self-assessment-invite
 *        Body: {} — generates a 14-day-valid Magic-Link, stores the invite
 *        row, queues an outbox mail (if recipient has an email), writes an
 *        `invite_sent` audit event. Returns { invite_id, magic_link_url }.
 *
 * DELETE /api/projects/[id]/stakeholders/[sid]/self-assessment-invite?invite_id=...
 *        Marks the invite as 'revoked'; subsequent token clicks are
 *        rejected. Writes an `invite_revoked` audit event.
 *
 * Token-flow mirrors PROJ-31 approval-route — but uses a separate signing
 * module + a separate DB table. See spec PROJ-33 §4.5.
 */

import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { buildSelfAssessmentOutboxRow } from "@/lib/stakeholders/self-assessment-mail"
import { signSelfAssessmentToken } from "@/lib/stakeholders/self-assessment-token"

const TOKEN_LIFETIME_DAYS = 14

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return "https://projektplattform-v3.vercel.app"
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Verify stakeholder belongs to this project + tenant. Cross-project leak
  // guard analog PROJ-33-γ profile routes.
  const { data: stakeholder, error: stkErr } = await supabase
    .from("stakeholders")
    .select("id, tenant_id, project_id, name, contact_email, is_active")
    .eq("id", sid)
    .maybeSingle()
  if (stkErr) return apiError("internal_error", stkErr.message, 500)
  if (!stakeholder || stakeholder.project_id !== projectId) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }
  if (!stakeholder.is_active) {
    return apiError(
      "conflict",
      "Stakeholder is deactivated — cannot send invite.",
      409,
    )
  }

  // Refuse if a pending invite already exists. Caller can revoke it first.
  const { data: existing } = await supabase
    .from("stakeholder_self_assessment_invites")
    .select("id, status")
    .eq("stakeholder_id", sid)
    .eq("status", "pending")
    .maybeSingle()
  if (existing) {
    return apiError(
      "conflict",
      "A pending invite already exists for this stakeholder. Revoke it first.",
      409,
    )
  }

  // Insert the invite row with a placeholder token so we have a row id; then
  // sign the HMAC token with stakeholder_id + tenant_id and UPDATE the row.
  // (Pattern mirrors PROJ-31 approval-route.)
  const expiresAt = new Date(
    Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  )
  const placeholderToken = crypto.randomBytes(16).toString("hex")
  const { data: inserted, error: insErr } = await supabase
    .from("stakeholder_self_assessment_invites")
    .insert({
      tenant_id: stakeholder.tenant_id,
      stakeholder_id: sid,
      magic_link_token: placeholderToken,
      magic_link_expires_at: expiresAt.toISOString(),
      status: "pending",
      created_by: userId,
    })
    .select("id")
    .maybeSingle()
  if (insErr || !inserted) {
    return apiError(
      "internal_error",
      insErr?.message ?? "Invite insert failed.",
      500,
    )
  }
  const inviteId = inserted.id

  let token: string
  try {
    token = signSelfAssessmentToken({
      stakeholder_id: sid,
      tenant_id: stakeholder.tenant_id,
      exp: Math.floor(expiresAt.getTime() / 1000),
    })
  } catch (e) {
    // Token-signing failure — roll back the row so the placeholder token is
    // not left dangling.
    await supabase
      .from("stakeholder_self_assessment_invites")
      .delete()
      .eq("id", inviteId)
    return apiError(
      "internal_error",
      e instanceof Error ? e.message : "Token signing failed.",
      500,
    )
  }

  const { error: tokErr } = await supabase
    .from("stakeholder_self_assessment_invites")
    .update({ magic_link_token: token })
    .eq("id", inviteId)
  if (tokErr) return apiError("internal_error", tokErr.message, 500)

  // Audit event — actor_kind='user' (PM-action). profile_kind='skill' is the
  // canonical kind for invite events; the `event_type` makes the meaning clear.
  // (Audit-Events table CHECK currently allows skill|personality — invite
  // events ride on 'skill' to avoid widening the CHECK in this slice.)
  const { error: evtErr } = await supabase
    .from("stakeholder_profile_audit_events")
    .insert({
      tenant_id: stakeholder.tenant_id,
      stakeholder_id: sid,
      profile_kind: "skill",
      event_type: "self_assessed_via_token",
      actor_kind: "user",
      actor_user_id: userId,
      payload: {
        kind: "invite_sent",
        invite_id: inviteId,
        expires_at: expiresAt.toISOString(),
      },
    })
  if (evtErr) {
    // Non-fatal: invite is persisted; audit gap is logged.
    console.error("[PROJ-33-δ] invite_sent audit insert failed:", evtErr.message)
  }

  // Queue outbox row only if recipient has an email. Otherwise PM has to
  // share the link manually (URL is always returned in the response).
  const baseUrl = resolveBaseUrl()
  const magicLinkUrl = `${baseUrl}/self-assessment/${encodeURIComponent(token)}`

  if (stakeholder.contact_email) {
    // Read tenant name (display) for branding. Best-effort — fall back to
    // "Projektplattform" if the read fails.
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", stakeholder.tenant_id)
      .maybeSingle()

    try {
      const outboxRow = buildSelfAssessmentOutboxRow({
        tenantId: stakeholder.tenant_id,
        projectId,
        stakeholderId: sid,
        inviteId,
        firstName: stakeholder.name ?? null,
        tenantBrandingName: tenant?.name ?? null,
        recipient: stakeholder.contact_email,
        token,
        baseUrl,
        createdBy: userId,
      })
      const { error: outErr } = await supabase
        .from("communication_outbox")
        .insert(outboxRow)
      if (outErr) {
        // Non-fatal — pattern reused from PROJ-31. PM can share link manually.
        console.error(
          "[PROJ-33-δ] self-assessment outbox insert failed:",
          outErr.message,
        )
      }
    } catch (e) {
      console.error(
        "[PROJ-33-δ] self-assessment mail-build failed:",
        e instanceof Error ? e.message : e,
      )
    }
  }

  return NextResponse.json(
    {
      invite_id: inviteId,
      magic_link_url: magicLinkUrl,
      expires_at: expiresAt.toISOString(),
    },
    { status: 201 },
  )
}

const deleteSchema = z.object({
  invite_id: z.string().uuid(),
})

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const url = new URL(request.url)
  const parsed = deleteSchema.safeParse({
    invite_id: url.searchParams.get("invite_id"),
  })
  if (!parsed.success) {
    return apiError("validation_error", "invite_id required.", 400, "invite_id")
  }
  const { invite_id: inviteId } = parsed.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Verify the invite belongs to this stakeholder + project (cross-project guard).
  const { data: invite, error: invErr } = await supabase
    .from("stakeholder_self_assessment_invites")
    .select(
      "id, tenant_id, stakeholder_id, status, " +
        "stakeholders!stakeholder_self_assessment_invites_stakeholder_id_fkey(project_id)",
    )
    .eq("id", inviteId)
    .maybeSingle()
  if (invErr) return apiError("internal_error", invErr.message, 500)
  type InviteRow = {
    id: string
    tenant_id: string
    stakeholder_id: string
    status: string
    stakeholders?: { project_id?: string } | null
  }
  const inv = invite as unknown as InviteRow | null
  if (!inv || inv.stakeholder_id !== sid) {
    return apiError("not_found", "Invite not found.", 404)
  }
  if (inv.stakeholders?.project_id !== projectId) {
    return apiError("not_found", "Invite not found in this project.", 404)
  }
  if (inv.status !== "pending") {
    return apiError(
      "conflict",
      `Invite is in status '${inv.status}' — only pending invites can be revoked.`,
      409,
    )
  }

  const { error: updErr } = await supabase
    .from("stakeholder_self_assessment_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
  if (updErr) return apiError("internal_error", updErr.message, 500)

  const { error: evtErr } = await supabase
    .from("stakeholder_profile_audit_events")
    .insert({
      tenant_id: inv.tenant_id,
      stakeholder_id: sid,
      profile_kind: "skill",
      event_type: "self_assessed_via_token",
      actor_kind: "user",
      actor_user_id: userId,
      payload: { kind: "invite_revoked", invite_id: inviteId },
    })
  if (evtErr) {
    console.error(
      "[PROJ-33-δ] invite_revoked audit insert failed:",
      evtErr.message,
    )
  }

  return NextResponse.json({ ok: true })
}
