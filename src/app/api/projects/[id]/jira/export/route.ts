import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import {
  JiraExportScopeSchema,
  runJiraExportJob,
} from "@/lib/jira/export-service"

import { authProjectForJira, readJiraCredentials } from "../_lib"

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
    const result = await runJiraExportJob(auth.supabase, {
      tenantId: auth.tenantId,
      projectId: id,
      actorUserId: auth.userId,
      credentials,
      scope: parsed.data,
    })
    return NextResponse.json(result, { status: 202 })
  } catch (err) {
    return apiError(
      "export_failed",
      err instanceof Error ? err.message : "Jira Export fehlgeschlagen.",
      500
    )
  }
}
