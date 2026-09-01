import { NextResponse } from "next/server"
import { z } from "zod"

import type {
  ProjectContextData,
  ProjectContextSkillCoverage,
  ProjectContextTurn,
} from "@/types/project-context"
import {
  logConfidentialListRead,
  mustBlockOnLogFailure,
  STRICT_LOG_FAILED_MESSAGE,
} from "@/lib/audit/confidential-read"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Read the immutable current projection. Summary access follows normal
 * project access plus RLS/classification. Transcript access is intentionally
 * narrower and is evaluated independently.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, id, userId, "view")
  if (access.error) return access.error

  const { data: document, error: documentError } = await supabase
    .from("project_context_documents")
    .select(
      "id, project_id, created_by, confidentiality_level, current_revision_id, created_at",
    )
    .eq("project_id", id)
    .maybeSingle()
  if (documentError) return apiError("read_failed", documentError.message, 500)
  if (!document) return apiError("not_found", "Project context not found.", 404)

  const { data: revision, error: revisionError } = await supabase
    .from("project_context_revisions")
    .select("id, revision_number, context, created_at")
    .eq("id", document.current_revision_id)
    .maybeSingle()
  if (revisionError) return apiError("read_failed", revisionError.message, 500)
  if (!revision) return apiError("not_found", "Project context revision not found.", 404)

  const [{ data: coverage, error: coverageError }, creatorResult] =
    await Promise.all([
      supabase
        .from("project_context_skill_coverage")
        .select(
          "skill_id, skill_version_id, skill_name, coverage_state, evidence_statement_ids, stale",
        )
        .eq("revision_id", revision.id)
        .order("skill_name", { ascending: true })
        .limit(100),
      document.created_by
        ? supabase
            .from("profiles")
            .select("display_name")
            .eq("id", document.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
  if (coverageError) return apiError("read_failed", coverageError.message, 500)
  if (creatorResult.error) return apiError("read_failed", creatorResult.error.message, 500)

  let transcript: ProjectContextTurn[] | null = null
  let mayReadTranscript = document.created_by === userId
  if (!mayReadTranscript) {
    const { data: membership, error: membershipError } = await supabase
      .from("project_memberships")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", userId)
      .maybeSingle()
    if (membershipError) return apiError("read_failed", membershipError.message, 500)
    mayReadTranscript = membership?.role === "lead" || membership?.role === "editor"
  }
  if (mayReadTranscript) {
    const { data: turns, error: turnsError } = await supabase
      .from("project_context_turns")
      .select("client_turn_id, role, content, status")
      .eq("revision_id", revision.id)
      .order("turn_index", { ascending: true })
      .limit(500)
    if (turnsError) return apiError("read_failed", turnsError.message, 500)
    transcript = (turns ?? []).map((turn) => ({
      id: turn.client_turn_id as string,
      role: turn.role as ProjectContextTurn["role"],
      content: turn.content as string,
      status: turn.status as ProjectContextTurn["status"],
    }))
  }

  const stored = revision.context as unknown as ProjectContextData
  const authoritativeCoverage: ProjectContextSkillCoverage[] = (coverage ?? []).map(
    (row) => ({
      skill_id: row.skill_id as string,
      skill_version_id: row.skill_version_id as string,
      skill_name: row.skill_name as string,
      state: row.coverage_state as ProjectContextSkillCoverage["state"],
      evidence_statement_ids: row.evidence_statement_ids as string[],
      stale: row.stale as boolean,
    }),
  )

  const readLog = await logConfidentialListRead(
    async (fn, args) => await supabase.rpc(fn, args),
    {
      projectId: id,
      entityType: "project_context_documents",
      rows: [
        {
          confidentiality_level: document.confidentiality_level as string,
        },
      ],
      detail: { document_id: document.id, revision_id: revision.id },
    },
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError("audit_log_failed", STRICT_LOG_FAILED_MESSAGE, 500)
  }

  return NextResponse.json({
    document: {
      id: document.id,
      project_id: document.project_id,
      revision_number: revision.revision_number,
      created_at: revision.created_at,
      created_by_name: creatorResult.data?.display_name ?? null,
      confidentiality_level: document.confidentiality_level,
      context: { ...stored, skill_coverage: authoritativeCoverage },
      transcript,
    },
  })
}
