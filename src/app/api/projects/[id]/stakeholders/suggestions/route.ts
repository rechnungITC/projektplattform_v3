import { NextResponse } from "next/server"

import { getProjectTypeProfile } from "@/lib/project-types/catalog"
import type { ProjectType } from "@/types/project"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-8 — derive stakeholder suggestions from PROJ-6's catalog.
// GET /api/projects/[id]/stakeholders/suggestions
//
// Computed = standard_roles for the project's type
//          MINUS roles already used by an active stakeholder on this project
//          MINUS dismissed roles for this project.
// No persistence here — the list is recomputed every call.

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // 1) Read project type for the catalog lookup.
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("project_type")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return apiError("read_failed", projectErr.message, 500)
  }
  if (!project?.project_type) {
    return apiError("not_found", "Project not found.", 404)
  }

  const profile = getProjectTypeProfile(project.project_type as ProjectType)
  const catalogRoles = profile.standard_roles

  // 2) Subtract: roles already filled by an active stakeholder.
  const { data: activeStakeholders } = await supabase
    .from("stakeholders")
    .select("role_key")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .not("role_key", "is", null)
  const usedRoleKeys = new Set(
    (activeStakeholders ?? []).map((row) => row.role_key as string)
  )

  // 3) Subtract: dismissed suggestions for this project.
  const { data: dismissals } = await supabase
    .from("stakeholder_suggestion_dismissals")
    .select("role_key")
    .eq("project_id", projectId)
  const dismissedRoleKeys = new Set(
    (dismissals ?? []).map((row) => row.role_key as string)
  )

  const suggestions = catalogRoles
    .filter((role) => !usedRoleKeys.has(role.key))
    .filter((role) => !dismissedRoleKeys.has(role.key))
    .map((role) => ({
      role_key: role.key,
      label_de: role.label_de,
    }))

  return NextResponse.json({
    suggestions,
    // Drives the "Verworfene zurückholen" link in the UI; needed so the
    // affordance survives a page reload (PROJ-8 QA bug M1).
    dismissed_count: dismissedRoleKeys.size,
  })
}
