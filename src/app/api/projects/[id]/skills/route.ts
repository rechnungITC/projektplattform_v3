import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { SKILL_ASSIGNMENT_SOURCES } from "@/types/project-skill"
import { PROJECT_SKILL_SELECT } from "@/types/project-skill"
import { SKILL_SELECT } from "@/types/skill"

// PROJ-78 — Skill-Zuordnungen eines Projekts.
//
// GET    → Liste der zugeordneten Skills (inkl. Katalog-Daten)
// POST   → Zuordnen über die SECURITY-DEFINER-RPC assign_project_skills
//
// Lesen = jedes Projektmitglied ("view"); Schreiben = Projektleitung oder
// Tenant-Admin ("manage_members") — ab PROJ-82 steuert das Skill-Set das
// KI-Handlungsmandat, ein Viewer darf es nicht verschieben.
//
// Immer der session-gebundene User-Client, nie service-role: RLS ist die
// eigentliche Sicherheitsgrenze.

const assignSchema = z.object({
  assignments: z
    .array(
      z.object({
        skill_id: z.string().uuid(),
        assignment_source: z.enum(
          SKILL_ASSIGNMENT_SOURCES as unknown as [string, ...string[]],
          { message: "Unbekannte Herkunft." }
        ),
      })
    )
    .min(1, "Mindestens eine Zuordnung erforderlich.")
    .max(100, "Maximal 100 Zuordnungen pro Aufruf."),
})

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
    .from("project_skills")
    .select(`${PROJECT_SKILL_SELECT}, skill:skills(${SKILL_SELECT})`)
    .eq("project_id", projectId)
    .order("assigned_at", { ascending: true })

  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ project_skills: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }

  const parsed = assignSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid payload.",
      400,
      issue?.path.join(".")
    )
  }

  const { data, error } = await supabase.rpc("assign_project_skills", {
    p_project_id: projectId,
    p_assignments: parsed.data.assignments,
  })

  if (error) {
    // Autoritäts- und Mandantenverletzungen kommen als 42501 aus der RPC.
    if (error.code === "42501") {
      return apiError("forbidden", error.message, 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", error.message, 404)
    }
    if (error.code === "22023") {
      return apiError("validation_error", error.message, 422)
    }
    return apiError("assign_failed", error.message, 500)
  }

  return NextResponse.json(data ?? { assigned: 0, skipped: 0 }, { status: 201 })
}
