import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { MA_STANDARD_ROLES } from "@/lib/project-types/catalog"

// PROJ-97a (AC-97-1/2/4/5) — responsibility view: "who is responsible for what".
//
// GET /api/projects/[id]/roles
//
// Returns the M&A professional-role catalog plus the stakeholders assigned to
// each role (via stakeholders.role_key), with the external marker (origin).
// Read-only aggregation over the existing stakeholders table — no new schema.
// RBAC (project_memberships.role) is deliberately NOT mixed in here: the role
// is the professional role (Stakeholder ≠ User, Invariante #4).
interface StakeholderRow {
  id: string
  name: string
  origin: "internal" | "external"
  role_key: string | null
}

interface RoleAssignment {
  role_key: string
  label_de: string
  stakeholders: { id: string; name: string; origin: "internal" | "external" }[]
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("stakeholders")
    .select("id, name, origin, role_key")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .limit(1000)

  if (error) return apiError("lookup_failed", error.message, 500)

  const rows = (data ?? []) as StakeholderRow[]

  // One bucket per catalog role, in catalog order.
  const byRole = new Map<string, RoleAssignment>()
  for (const role of MA_STANDARD_ROLES) {
    byRole.set(role.key, {
      role_key: role.key,
      label_de: role.label_de,
      stakeholders: [],
    })
  }

  // Stakeholders whose role_key is not in the M&A catalog (legacy / free-text).
  const unmatched: RoleAssignment = {
    role_key: "__other",
    label_de: "Sonstige / nicht zugeordnet",
    stakeholders: [],
  }

  for (const s of rows) {
    const bucket = (s.role_key && byRole.get(s.role_key)) || unmatched
    bucket.stakeholders.push({ id: s.id, name: s.name, origin: s.origin })
  }

  const assignments = [...byRole.values()]
  if (unmatched.stakeholders.length > 0) assignments.push(unmatched)

  return NextResponse.json({
    roles: MA_STANDARD_ROLES,
    assignments,
  })
}
