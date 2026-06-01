import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import { JiraFieldMappingSchema } from "@/lib/jira/mapping"
import {
  loadJiraFieldMapping,
  saveJiraFieldMapping,
} from "@/lib/jira/export-service"

import { authProjectForJira, readJiraCredentials } from "../_lib"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await authProjectForJira(id, "view", {
    requireTenantAdmin: true,
  })
  if ("error" in auth) return auth.error

  const credentials = await readJiraCredentials(auth)
  if ("error" in credentials) return credentials.error

  try {
    const mapping = await loadJiraFieldMapping(auth.supabase, {
      tenantId: auth.tenantId,
      projectId: id,
      defaultProjectKey: credentials.default_project_key,
    })
    return NextResponse.json({ mapping })
  } catch (err) {
    return apiError(
      "mapping_read_failed",
      err instanceof Error ? err.message : "Mapping konnte nicht gelesen werden.",
      500
    )
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await authProjectForJira(id, "edit", {
    requireTenantAdmin: true,
  })
  if ("error" in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = JiraFieldMappingSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid Jira mapping.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  try {
    const mapping = await saveJiraFieldMapping(auth.supabase, {
      tenantId: auth.tenantId,
      projectId: id,
      actorUserId: auth.userId,
      mapping: parsed.data,
    })
    return NextResponse.json({ mapping })
  } catch (err) {
    return apiError(
      "mapping_save_failed",
      err instanceof Error
        ? err.message
        : "Mapping konnte nicht gespeichert werden.",
      500
    )
  }
}
