import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

const inviteSchema = z.object({
  email: z.string().min(1).email(),
  role: z.enum(["admin", "member", "viewer"]),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tenants/[id]/invite
 * Body: { email: string, role: 'admin' | 'member' | 'viewer' }
 *
 * Admin-only. Sends a Supabase Auth invite email; user_metadata carries
 * `invited_to_tenant` and `invited_role` so the post-signup Edge Function
 * routes them into the right tenant with the right role.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id: tenantId } = await context.params

  // 1. Parse + validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  // 2. Authn
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // 3. Authz: must be admin of tenant
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  // 4. Send invite via service-role admin client
  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    return apiError(
      "server_misconfigured",
      err instanceof Error ? err.message : "Service role key unavailable.",
      500
    )
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: {
      invited_to_tenant: tenantId,
      invited_role: parsed.data.role,
    },
  })

  if (error) {
    // Surface Supabase's own status code where available.
    const status = typeof error.status === "number" ? error.status : 500
    return apiError(
      "invite_failed",
      error.message ?? "Failed to send invite.",
      status >= 400 && status < 600 ? status : 500
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
