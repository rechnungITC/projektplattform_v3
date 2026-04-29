/**
 * PROJ-12 — server-side auto-context collector for risk suggestions.
 *
 * Pulls a curated, Class-1/2-only slice of project state. The shape is
 * locked to `RiskAutoContext` and the SELECT statements explicitly list
 * fields — adding a Class-3 field to this collector accidentally would
 * still get caught by `classifyRiskAutoContext` at the router boundary,
 * but the first defense is right here: don't ask the DB for fields you
 * don't want to leak.
 *
 * Allowlist (per the locked design choice):
 *   projects:    name, project_type, project_method, lifecycle_status,
 *                planned_start_date, planned_end_date
 *   phases:      name, status, planned_start, planned_end
 *   milestones:  name, status, target_date
 *   work_items:  title, kind, status   (NO description — Class-3 risk)
 *   risks:       title, probability, impact   (used as negative examples)
 *
 * Stakeholders, profiles, descriptions, notes, audit data are NOT
 * included.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { RiskAutoContext } from "./types"

const WORK_ITEMS_LIMIT = 30
const RISKS_LIMIT = 50

export async function collectRiskAutoContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<RiskAutoContext> {
  const [project, phases, milestones, workItems, risks] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "name, project_type, project_method, lifecycle_status, planned_start_date, planned_end_date"
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("phases")
      .select("name, status, planned_start, planned_end")
      .eq("project_id", projectId)
      .order("sequence_number", { ascending: true })
      .limit(20),
    supabase
      .from("milestones")
      .select("name, status, target_date")
      .eq("project_id", projectId)
      .order("target_date", { ascending: true })
      .limit(20),
    supabase
      .from("work_items")
      .select("title, kind, status")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(WORK_ITEMS_LIMIT),
    supabase
      .from("risks")
      .select("title, probability, impact")
      .eq("project_id", projectId)
      .order("score", { ascending: false })
      .limit(RISKS_LIMIT),
  ])

  if (project.error) throw new Error(`auto-context (projects): ${project.error.message}`)
  if (phases.error) throw new Error(`auto-context (phases): ${phases.error.message}`)
  if (milestones.error)
    throw new Error(`auto-context (milestones): ${milestones.error.message}`)
  if (workItems.error)
    throw new Error(`auto-context (work_items): ${workItems.error.message}`)
  if (risks.error) throw new Error(`auto-context (risks): ${risks.error.message}`)

  if (!project.data) {
    throw new Error(`auto-context: project ${projectId} not found`)
  }

  return {
    project: {
      name: project.data.name as string,
      project_type: (project.data.project_type as string | null) ?? null,
      project_method: (project.data.project_method as string | null) ?? null,
      lifecycle_status: project.data.lifecycle_status as string,
      planned_start_date:
        (project.data.planned_start_date as string | null) ?? null,
      planned_end_date:
        (project.data.planned_end_date as string | null) ?? null,
    },
    phases: (phases.data ?? []).map((p) => ({
      name: p.name as string,
      status: p.status as string,
      planned_start: (p.planned_start as string | null) ?? null,
      planned_end: (p.planned_end as string | null) ?? null,
    })),
    milestones: (milestones.data ?? []).map((m) => ({
      name: m.name as string,
      status: m.status as string,
      target_date: (m.target_date as string | null) ?? null,
    })),
    work_items: (workItems.data ?? []).map((w) => ({
      title: w.title as string,
      kind: w.kind as string,
      status: w.status as string,
    })),
    existing_risks: (risks.data ?? []).map((r) => ({
      title: r.title as string,
      probability: r.probability as number,
      impact: r.impact as number,
    })),
  }
}
