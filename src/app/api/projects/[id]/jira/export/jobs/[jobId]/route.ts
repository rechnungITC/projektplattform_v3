import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"

import { authProjectForJira } from "../../../_lib"

interface Ctx {
  params: Promise<{ id: string; jobId: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id, jobId } = await ctx.params
  const auth = await authProjectForJira(id, "view")
  if ("error" in auth) return auth.error

  const { data: job, error: jobError } = await auth.supabase
    .from("jira_export_jobs")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("project_id", id)
    .eq("id", jobId)
    .maybeSingle()
  if (jobError) return apiError("job_read_failed", jobError.message, 500)
  if (!job) return apiError("not_found", "Jira export job not found.", 404)

  const { data: log, error: logError } = await auth.supabase
    .from("jira_export_log")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("project_id", id)
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
  if (logError) return apiError("log_read_failed", logError.message, 500)

  return NextResponse.json({ job, log: log ?? [] })
}
