import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// PROJ-9 Round 2 — polymorphic dependencies.
//
// This project-scoped endpoint accepts BOTH the legacy Round-1 body shape
// (predecessor_id / successor_id / type) AND the new polymorphic body shape
// (from_type / from_id / to_type / to_id / constraint_type). Detection by
// shape keys; legacy form is mapped onto the polymorphic form server-side
// using `work_items.kind` for type derivation.
//
// Rationale: old callers (existing UI hooks) keep working without code change
// during the deprecation window; new callers (Gantt-DnD in PROJ-25, cross-
// project deps) can use the explicit polymorphic shape.
//
// Database guarantees (defense in depth via triggers):
//   - polymorphic FK existence (`tg_dep_validate_polymorphic_fk`)
//   - cross-tenant block (`tg_dep_validate_tenant_boundary`)
//   - cycle prevention (`tg_dep_prevent_polymorphic_cycle`)
//   - UNIQUE (from_type, from_id, to_type, to_id, constraint_type)
//   - no self-edge

const polymorphicSchema = z.object({
  from_type: z.enum(["project", "phase", "work_package", "todo"]),
  from_id: z.string().uuid(),
  to_type: z.enum(["project", "phase", "work_package", "todo"]),
  to_id: z.string().uuid(),
  constraint_type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lag_days: z.number().int().optional(),
})

const legacySchema = z.object({
  predecessor_id: z.string().uuid(),
  successor_id: z.string().uuid(),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lag_days: z.number().int().optional(),
})

type DependencyEntityType = "project" | "phase" | "work_package" | "todo"

interface NormalizedInsert {
  from_type: DependencyEntityType
  from_id: string
  to_type: DependencyEntityType
  to_id: string
  constraint_type: "FS" | "SS" | "FF" | "SF"
  lag_days: number
}

/**
 * POST /api/projects/[id]/dependencies  --  create
 *
 * Accepts legacy `predecessor_id/successor_id/type` body OR new
 * `from_type/from_id/to_type/to_id/constraint_type` body. Legacy form is
 * resolved against `work_items.kind` and rewritten to the polymorphic shape
 * before INSERT.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // Body shape detection: prefer the polymorphic form; fall back to legacy.
  const polymorphic = polymorphicSchema.safeParse(body)
  const legacy = polymorphic.success ? null : legacySchema.safeParse(body)

  let normalized: NormalizedInsert | null = null

  if (polymorphic.success) {
    if (
      polymorphic.data.from_type === polymorphic.data.to_type &&
      polymorphic.data.from_id === polymorphic.data.to_id
    ) {
      return apiError(
        "self_dependency",
        "from-entity and to-entity must differ.",
        422,
        "to_id"
      )
    }
    normalized = {
      from_type: polymorphic.data.from_type,
      from_id: polymorphic.data.from_id,
      to_type: polymorphic.data.to_type,
      to_id: polymorphic.data.to_id,
      constraint_type: polymorphic.data.constraint_type,
      lag_days: polymorphic.data.lag_days ?? 0,
    }
  } else if (legacy && legacy.success) {
    if (legacy.data.predecessor_id === legacy.data.successor_id) {
      return apiError(
        "self_dependency",
        "predecessor_id and successor_id must differ.",
        422,
        "successor_id"
      )
    }
    // Resolve kinds for both endpoints to derive from_type / to_type.
    const { data: items, error: itemsErr } = await supabase
      .from("work_items")
      .select("id, project_id, kind")
      .in("id", [legacy.data.predecessor_id, legacy.data.successor_id])
    if (itemsErr) return apiError("internal_error", itemsErr.message, 500)
    if (!items || items.length !== 2) {
      return apiError(
        "invalid_reference",
        "predecessor and/or successor not found.",
        422
      )
    }
    // Same-project pre-check kept for the legacy shape: Round-1 callers
    // expected this. Polymorphic callers can opt into cross-project edges.
    for (const it of items) {
      if (it.project_id !== projectId) {
        return apiError(
          "cross_project",
          "predecessor and successor must belong to this project.",
          422
        )
      }
    }
    const predItem = items.find((i) => i.id === legacy.data.predecessor_id)
    const succItem = items.find((i) => i.id === legacy.data.successor_id)
    if (!predItem || !succItem) {
      return apiError(
        "invalid_reference",
        "predecessor and/or successor not found.",
        422
      )
    }
    normalized = {
      from_type: predItem.kind === "work_package" ? "work_package" : "todo",
      from_id: legacy.data.predecessor_id,
      to_type: succItem.kind === "work_package" ? "work_package" : "todo",
      to_id: legacy.data.successor_id,
      constraint_type: legacy.data.type,
      lag_days: legacy.data.lag_days ?? 0,
    }
  } else {
    const issue =
      polymorphic.error?.issues?.[0] ?? legacy?.error?.issues?.[0] ?? null
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid body.",
      400,
      issue?.path?.[0]?.toString()
    )
  }

  const { data: row, error } = await supabase
    .from("dependencies")
    .insert({
      tenant_id: project.tenant_id,
      from_type: normalized.from_type,
      from_id: normalized.from_id,
      to_type: normalized.to_type,
      to_id: normalized.to_id,
      constraint_type: normalized.constraint_type,
      lag_days: normalized.lag_days,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "duplicate_dependency",
        "This dependency already exists.",
        422
      )
    }
    if (error.code === "23514") {
      // CHECK constraint or `check_violation` from cycle prevention.
      const message = error.message ?? ""
      if (message.toLowerCase().includes("cycle")) {
        return apiError(
          "cycle_detected",
          "This dependency would create a cycle.",
          422
        )
      }
      return apiError("check_violation", message, 422)
    }
    if (error.code === "22023") {
      // Tenant-boundary trigger raises this for cross-tenant edges.
      const message = error.message ?? ""
      if (message.toLowerCase().includes("cross-tenant")) {
        return apiError(
          "cross_tenant",
          "Cross-tenant dependencies are not allowed.",
          422
        )
      }
      return apiError("invalid_reference", message, 422)
    }
    if (error.code === "23503") {
      return apiError(
        "invalid_reference",
        "Referenced entity does not exist.",
        422
      )
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ dependency: row }, { status: 201 })
}

/**
 * GET /api/projects/[id]/dependencies
 *
 * Returns every edge that touches this project — i.e. either endpoint is
 *   - the project itself (`from_type='project' OR to_type='project'`), or
 *   - a phase / work_package / todo that belongs to this project.
 *
 * RLS-scoped to tenant members; the response shape uses the new polymorphic
 * columns (frontend must update its readers).
 */
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

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // Collect entity-id sets for membership filter:
  //   project itself, all phases of project, all work_items of project.
  const [phasesRes, itemsRes] = await Promise.all([
    supabase.from("phases").select("id").eq("project_id", projectId),
    supabase.from("work_items").select("id, kind").eq("project_id", projectId),
  ])
  if (phasesRes.error) return apiError("list_failed", phasesRes.error.message, 500)
  if (itemsRes.error) return apiError("list_failed", itemsRes.error.message, 500)

  const phaseIds = (phasesRes.data ?? []).map((p) => p.id)
  const wpIds = (itemsRes.data ?? [])
    .filter((i) => i.kind === "work_package")
    .map((i) => i.id)
  const todoIds = (itemsRes.data ?? [])
    .filter((i) => i.kind !== "work_package")
    .map((i) => i.id)

  // Build OR filter: any edge whose from_*/to_* pair sits inside this project.
  const filters: string[] = []
  filters.push(`and(from_type.eq.project,from_id.eq.${projectId})`)
  filters.push(`and(to_type.eq.project,to_id.eq.${projectId})`)
  if (phaseIds.length > 0) {
    filters.push(`and(from_type.eq.phase,from_id.in.(${phaseIds.join(",")}))`)
    filters.push(`and(to_type.eq.phase,to_id.in.(${phaseIds.join(",")}))`)
  }
  if (wpIds.length > 0) {
    filters.push(
      `and(from_type.eq.work_package,from_id.in.(${wpIds.join(",")}))`
    )
    filters.push(
      `and(to_type.eq.work_package,to_id.in.(${wpIds.join(",")}))`
    )
  }
  if (todoIds.length > 0) {
    filters.push(`and(from_type.eq.todo,from_id.in.(${todoIds.join(",")}))`)
    filters.push(`and(to_type.eq.todo,to_id.in.(${todoIds.join(",")}))`)
  }

  let query = supabase
    .from("dependencies")
    .select("*")
    .eq("tenant_id", project.tenant_id)
    .order("created_at", { ascending: false })
    .limit(2000)
  if (filters.length > 0) {
    query = query.or(filters.join(","))
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ dependencies: data ?? [] })
}
