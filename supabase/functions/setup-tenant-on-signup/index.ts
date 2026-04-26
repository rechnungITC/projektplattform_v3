// =============================================================================
// Edge Function: setup-tenant-on-signup
// =============================================================================
// Called by the frontend `/onboarding` page when a freshly-signed-up user has
// no tenant_membership row yet. Authenticates the caller via the JWT, then
// invokes the public.handle_new_user() Postgres function with the service
// role to atomically:
//   1. upsert the profile
//   2. route to a tenant (by invite metadata or by email domain)
//   3. create the membership
//
// Returns: { tenant_id: string, role: 'admin' | 'member' | 'viewer' }
// =============================================================================

// @ts-expect-error - Deno-specific import, resolved at runtime in Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

// Deno is provided by the Supabase Edge runtime.
declare const Deno: { env: { get(key: string): string | undefined } }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  })
}

function errorResponse(
  code: string,
  message: string,
  status: number
): Response {
  return jsonResponse({ error: { code, message } }, status)
}

// @ts-expect-error - Deno.serve is global in the Edge runtime.
Deno.serve(async (req: Request) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Use POST.", 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceKey) {
    return errorResponse(
      "server_misconfigured",
      "Edge Function is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      500
    )
  }

  // Extract the caller's JWT and identify them via the admin client.
  const authHeader = req.headers.get("Authorization") ?? ""
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : ""

  if (!jwt) {
    return errorResponse(
      "unauthorized",
      "Missing Authorization bearer token.",
      401
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // getUser(jwt) verifies the JWT signature against the project secret.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return errorResponse(
      "unauthorized",
      userErr?.message ?? "Invalid or expired token.",
      401
    )
  }

  const user = userData.user
  const email = user.email
  if (!email) {
    return errorResponse(
      "invalid_user",
      "Authenticated user has no email address.",
      422
    )
  }

  // user_metadata is set on signup or via inviteUserByEmail's `data` option.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const displayNameRaw = meta.display_name ?? meta.full_name ?? meta.name
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0
      ? displayNameRaw.trim()
      : email.split("@")[0]

  const invitedToTenantRaw = meta.invited_to_tenant
  const invitedRoleRaw = meta.invited_role

  const invitedToTenant =
    typeof invitedToTenantRaw === "string" && invitedToTenantRaw.length > 0
      ? invitedToTenantRaw
      : null
  const invitedRole =
    typeof invitedRoleRaw === "string" && invitedRoleRaw.length > 0
      ? invitedRoleRaw
      : null

  if (invitedToTenant && !invitedRole) {
    return errorResponse(
      "invalid_invite",
      "Invite metadata has tenant but no role.",
      422
    )
  }

  // RPC into Postgres for atomic profile + tenant + membership setup.
  const { data, error } = await admin.rpc("handle_new_user", {
    p_user_id: user.id,
    p_email: email,
    p_display_name: displayName,
    p_invited_to_tenant: invitedToTenant,
    p_invited_role: invitedRole,
  })

  if (error) {
    return errorResponse(
      "setup_failed",
      error.message ?? "Tenant setup failed.",
      500
    )
  }

  // The RPC returns SETOF (tenant_id, role); supabase-js gives an array.
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") {
    return errorResponse(
      "setup_failed",
      "Unexpected response from handle_new_user.",
      500
    )
  }

  const result = row as { tenant_id: string; role: string }
  return jsonResponse({ tenant_id: result.tenant_id, role: result.role }, 200)
})
