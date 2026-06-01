import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import {
  createJiraExportPreview,
  JiraExportScopeSchema,
} from "@/lib/jira/export-service"

import { authProjectForJira, readJiraCredentials } from "../../_lib"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await authProjectForJira(id, "edit", {
    requireTenantAdmin: true,
  })
  if ("error" in auth) return auth.error

  const credentials = await readJiraCredentials(auth)
  if ("error" in credentials) return credentials.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = JiraExportScopeSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid Jira export scope.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  try {
    const preview = await createJiraExportPreview(auth.supabase, {
      tenantId: auth.tenantId,
      projectId: id,
      credentials,
      scope: parsed.data,
    })
    return NextResponse.json(preview)
  } catch (err) {
    return apiError(
      "preview_failed",
      err instanceof Error ? err.message : "Jira Preview fehlgeschlagen.",
      500
    )
  }
}
