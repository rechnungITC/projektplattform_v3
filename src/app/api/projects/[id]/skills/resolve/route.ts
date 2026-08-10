import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveNewCandidates } from "@/lib/project-skills/resolve"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"
import { SKILL_SELECT, type Skill } from "@/types/skill"

// PROJ-78 — Katalog-Abgleich („Skills abgleichen").
//
// GET /api/projects/[id]/skills/resolve
//
// Liefert AUSSCHLIESSLICH additive Kandidaten: aktive Katalog-Skills, die
// zum Projekt passen und ihm noch nicht zugeordnet sind. Diese Route
// entfernt und verändert nichts — der PM entscheidet je Vorschlag.
//
// Ersetzt die ursprünglich gespecte „Re-Resolution bei Methoden-/Typ-
// Wechsel": beide Wechsel sind live nicht erreichbar (Methode ist nach
// dem Setzen trigger-gesperrt, der Projekttyp hat keinen Schreibpfad).
// Real erreichbar sind: gewachsener Katalog + nachgetragene Methode.
//
// Lesen reicht als Recht ("view") — es wird nichts geschrieben.

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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_method, project_type")
    .eq("id", projectId)
    .maybeSingle()

  if (projectError) return apiError("read_failed", projectError.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // RLS zeigt einem Mitglied nur aktive Skills seiner Mandanten — die
  // fachlich richtige Filterung entsteht also von selbst. Zwei Ergänzungen:
  //  * explizit auf den Mandanten DIESES Projekts einschränken, sonst könnte
  //    ein Nutzer mit mehreren Mandanten einen Kandidaten angeboten bekommen,
  //    den die Zuordnungs-RPC anschließend als mandantenfremd ablehnt (42501);
  //  * `is_active` filtert der Resolver zusätzlich defensiv — ein Tenant-Admin
  //    sieht über die Policy auch INAKTIVE Skills, die nie Kandidat sein dürfen.
  const [skillsRes, assignedRes] = await Promise.all([
    supabase
      .from("skills")
      .select(SKILL_SELECT)
      .eq("tenant_id", access.project.tenant_id)
      .limit(500),
    supabase.from("project_skills").select("skill_id").eq("project_id", projectId),
  ])

  if (skillsRes.error) return apiError("read_failed", skillsRes.error.message, 500)
  if (assignedRes.error)
    return apiError("read_failed", assignedRes.error.message, 500)

  const candidates = resolveNewCandidates(
    {
      skills: (skillsRes.data ?? []) as unknown as Skill[],
      method: (project.project_method as ProjectMethod | null) ?? null,
      projectType: (project.project_type as ProjectType | null) ?? null,
    },
    (assignedRes.data ?? []).map((r) => r.skill_id as string)
  )

  return NextResponse.json({ candidates })
}
