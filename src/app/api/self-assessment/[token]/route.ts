/**
 * PROJ-33 Phase 33-δ — Public Magic-Link Self-Assessment endpoint.
 *
 * GET  /api/self-assessment/[token]  → fetch token-payload (public, token-auth)
 * POST /api/self-assessment/[token]  → submit Self-Assessment (public, token-auth)
 *
 * No Supabase session — the token is the only auth gate. Validation order:
 *   1. HMAC signature (self-assessment-token.ts)
 *   2. expiry (token + DB column)
 *   3. tenant_id match (DB row vs token claim)
 *   4. invite row exists, magic_link_token matches
 *   5. invite.status = 'pending' (rejected for completed | revoked | expired)
 *
 * Idempotency: Submit on a `completed` invite returns 409. Submit on a
 * `pending` invite that has just expired (DB column `magic_link_expires_at`
 * < now) lazy-promotes the row to status='expired' and rejects with 410.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError } from "@/app/api/_lib/route-helpers"
import { verifySelfAssessmentToken } from "@/lib/stakeholders/self-assessment-token"
import { createAdminClient } from "@/lib/supabase/admin"

const intDim = z.number().int().min(0).max(100).nullable().optional()

const submitSchema = z.object({
  skill: z.object({
    domain_knowledge: intDim,
    method_competence: intDim,
    it_affinity: intDim,
    negotiation_skill: intDim,
    decision_power: intDim,
  }),
  personality: z.object({
    openness: intDim,
    conscientiousness: intDim,
    extraversion: intDim,
    agreeableness: intDim,
    emotional_stability: intDim,
  }),
})

interface Ctx {
  params: Promise<{ token: string }>
}

interface ResolvedToken {
  stakeholderId: string
  tenantId: string
  expSec: number
}

function resolveToken(
  token: string,
):
  | { ok: true; data: ResolvedToken }
  | { ok: false; status: number; error: string } {
  const verify = verifySelfAssessmentToken(token)
  if (!verify.ok) {
    if (verify.reason === "expired") {
      return { ok: false, status: 410, error: "expired" }
    }
    return { ok: false, status: 404, error: "not_found" }
  }
  return {
    ok: true,
    data: {
      stakeholderId: verify.payload.stakeholder_id,
      tenantId: verify.payload.tenant_id,
      expSec: verify.payload.exp,
    },
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const resolved = resolveToken(token)
  if (!resolved.ok) {
    return apiError(resolved.error, "Token invalid or expired.", resolved.status)
  }
  const { stakeholderId, tenantId } = resolved.data

  const admin = createAdminClient()

  // Fetch the invite row (which carries the persisted token), the
  // stakeholder display fields, and the tenant branding name.
  type InviteRow = {
    id: string
    tenant_id: string
    stakeholder_id: string
    magic_link_token: string
    magic_link_expires_at: string | null
    status: "pending" | "completed" | "revoked" | "expired"
    submitted_at: string | null
  }
  type StakeholderRow = {
    id: string
    tenant_id: string
    name: string | null
    is_active: boolean
  }

  const [inviteRes, stakeholderRes] = await Promise.all([
    admin
      .from("stakeholder_self_assessment_invites")
      .select("id, tenant_id, stakeholder_id, magic_link_token, magic_link_expires_at, status, submitted_at")
      .eq("magic_link_token", token)
      .maybeSingle(),
    admin
      .from("stakeholders")
      .select("id, tenant_id, name, is_active")
      .eq("id", stakeholderId)
      .maybeSingle(),
  ])
  if (inviteRes.error) return apiError("internal_error", inviteRes.error.message, 500)
  if (stakeholderRes.error)
    return apiError("internal_error", stakeholderRes.error.message, 500)

  const invite = inviteRes.data as unknown as InviteRow | null
  const stakeholder = stakeholderRes.data as unknown as StakeholderRow | null

  if (!invite || !stakeholder) {
    return apiError("not_found", "Invite or stakeholder not found.", 404)
  }
  if (
    invite.tenant_id !== tenantId ||
    stakeholder.tenant_id !== tenantId ||
    invite.stakeholder_id !== stakeholderId
  ) {
    return apiError("not_found", "Token tenant mismatch.", 404)
  }

  // Lazy-expire: if DB column says expired but status is still pending,
  // promote it. Pure read-side correction.
  let status = invite.status as
    | "pending"
    | "completed"
    | "revoked"
    | "expired"
  const dbExpired =
    !!invite.magic_link_expires_at &&
    new Date(invite.magic_link_expires_at).getTime() < Date.now()
  if (status === "pending" && dbExpired) {
    await admin
      .from("stakeholder_self_assessment_invites")
      .update({ status: "expired" })
      .eq("id", invite.id)
    status = "expired"
  }

  // Fetch tenant branding for display.
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle()

  return NextResponse.json({
    payload: {
      invite: {
        id: invite.id,
        status,
        expires_at: invite.magic_link_expires_at,
        submitted_at: invite.submitted_at,
      },
      stakeholder: {
        first_name: deriveFirstName(stakeholder.name),
        is_active: stakeholder.is_active,
      },
      tenant: {
        name: tenant?.name ?? "Projektplattform",
      },
    },
  })
}

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const resolved = resolveToken(token)
  if (!resolved.ok) {
    return apiError(resolved.error, "Token invalid or expired.", resolved.status)
  }
  const { stakeholderId, tenantId } = resolved.data

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid request body.",
      400,
    )
  }

  const admin = createAdminClient()

  // Cross-validate: token must match the persisted token, tenant must agree.
  const { data: invite, error: invErr } = await admin
    .from("stakeholder_self_assessment_invites")
    .select(
      "id, tenant_id, stakeholder_id, magic_link_token, magic_link_expires_at, status",
    )
    .eq("magic_link_token", token)
    .maybeSingle()
  if (invErr) return apiError("internal_error", invErr.message, 500)
  if (!invite) return apiError("not_found", "Invite not found.", 404)
  if (
    invite.tenant_id !== tenantId ||
    invite.stakeholder_id !== stakeholderId
  ) {
    return apiError("not_found", "Token tenant mismatch.", 404)
  }
  if (invite.status === "revoked") {
    return apiError("gone", "Invite has been revoked.", 410)
  }
  if (invite.status === "completed") {
    return apiError("conflict", "Self-Assessment already submitted.", 409)
  }
  if (
    invite.status === "expired" ||
    (invite.magic_link_expires_at &&
      new Date(invite.magic_link_expires_at).getTime() < Date.now())
  ) {
    if (invite.status === "pending") {
      await admin
        .from("stakeholder_self_assessment_invites")
        .update({ status: "expired" })
        .eq("id", invite.id)
    }
    return apiError("gone", "Token expired.", 410)
  }

  const now = new Date().toISOString()
  const skill = parsed.data.skill
  const personality = parsed.data.personality

  // UPSERT skill_self values. We only touch the *_self columns so the PM
  // Fremd-assessment is preserved.
  const { error: skErr } = await admin
    .from("stakeholder_skill_profiles")
    .upsert(
      {
        stakeholder_id: stakeholderId,
        tenant_id: tenantId,
        domain_knowledge_self: skill.domain_knowledge ?? null,
        method_competence_self: skill.method_competence ?? null,
        it_affinity_self: skill.it_affinity ?? null,
        negotiation_skill_self: skill.negotiation_skill ?? null,
        decision_power_self: skill.decision_power ?? null,
        self_assessed_at: now,
      },
      { onConflict: "stakeholder_id" },
    )
  if (skErr) return apiError("internal_error", skErr.message, 500)

  const { error: peErr } = await admin
    .from("stakeholder_personality_profiles")
    .upsert(
      {
        stakeholder_id: stakeholderId,
        tenant_id: tenantId,
        openness_self: personality.openness ?? null,
        conscientiousness_self: personality.conscientiousness ?? null,
        extraversion_self: personality.extraversion ?? null,
        agreeableness_self: personality.agreeableness ?? null,
        emotional_stability_self: personality.emotional_stability ?? null,
        self_assessed_at: now,
      },
      { onConflict: "stakeholder_id" },
    )
  if (peErr) return apiError("internal_error", peErr.message, 500)

  // Persist invite payload + flip to completed.
  const { error: cmpErr } = await admin
    .from("stakeholder_self_assessment_invites")
    .update({
      status: "completed",
      submitted_at: now,
      submitted_payload: { skill, personality },
    })
    .eq("id", invite.id)
  if (cmpErr) return apiError("internal_error", cmpErr.message, 500)

  // Audit events: one per profile_kind. actor_kind='stakeholder'.
  const auditRows = [
    {
      tenant_id: tenantId,
      stakeholder_id: stakeholderId,
      profile_kind: "skill",
      event_type: "self_assessed_via_token",
      actor_kind: "stakeholder",
      actor_stakeholder_id: stakeholderId,
      payload: { invite_id: invite.id, skill },
    },
    {
      tenant_id: tenantId,
      stakeholder_id: stakeholderId,
      profile_kind: "personality",
      event_type: "self_assessed_via_token",
      actor_kind: "stakeholder",
      actor_stakeholder_id: stakeholderId,
      payload: { invite_id: invite.id, personality },
    },
  ]
  const { error: evtErr } = await admin
    .from("stakeholder_profile_audit_events")
    .insert(auditRows)
  if (evtErr) {
    // Non-fatal: profile + invite are persisted; audit gap is logged.
    console.error("[PROJ-33-δ] self_assessment audit failed:", evtErr.message)
  }

  return NextResponse.json({ ok: true })
}

function deriveFirstName(rawName: string | null): string {
  if (!rawName) return "Hallo"
  const trimmed = rawName.trim()
  if (!trimmed) return "Hallo"
  const firstToken = trimmed.split(/\s+/)[0] ?? ""
  const cleaned = firstToken.replace(/[^\p{L}\p{N}\-']/gu, "")
  return cleaned.length > 0 ? cleaned : "Hallo"
}
