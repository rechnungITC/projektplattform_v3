/**
 * PROJ-18 — phase-gate warnings resolver.
 *
 * Shared between:
 *   - GET /api/projects/[id]/phases/[pid]/compliance-warnings
 *   - POST /api/projects/[id]/phases/[pid]/transition (embeds warnings on
 *     `to_status=completed` and writes an audit row when closing despite
 *     non-empty warnings).
 *
 * Pure data resolver: takes a Supabase client and project + phase ids,
 * returns the warning list. RLS naturally limits visibility to project
 * members.
 *
 * Filter applied (per spec edge-case § "phase gate filters bugs"): bugs
 * are excluded — only `kind != 'bug'` work items are surfaced as gates.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  ComplianceTag,
  ComplianceWarning,
  WorkItemTagRow,
} from "./types"

interface ResolveArgs {
  supabase: SupabaseClient
  projectId: string
  phaseId: string
}

export async function resolvePhaseWarnings(
  args: ResolveArgs
): Promise<ComplianceWarning[]> {
  const { supabase, projectId, phaseId } = args

  const { data: workItems, error: wiErr } = await supabase
    .from("work_items")
    .select("id, title, kind, status")
    .eq("project_id", projectId)
    .eq("phase_id", phaseId)
    .eq("is_deleted", false)
    .neq("status", "done")
    .neq("status", "cancelled")
    .neq("kind", "bug")
    .limit(500)
  if (wiErr) throw new Error(`resolvePhaseWarnings: ${wiErr.message}`)
  if (!workItems || workItems.length === 0) return []

  const workItemIds = workItems.map((w) => w.id)
  const titleById = new Map(workItems.map((w) => [w.id, w.title as string]))

  const { data: tagLinks, error: linkErr } = await supabase
    .from("work_item_tags")
    .select("*, compliance_tags!inner(*)")
    .in("work_item_id", workItemIds)
  if (linkErr) throw new Error(`resolvePhaseWarnings: ${linkErr.message}`)

  type Joined = WorkItemTagRow & {
    compliance_tags: ComplianceTag | ComplianceTag[]
  }
  const warnings: ComplianceWarning[] = []
  for (const row of (tagLinks ?? []) as unknown as Joined[]) {
    const tag = Array.isArray(row.compliance_tags)
      ? row.compliance_tags[0]
      : row.compliance_tags
    if (!tag.is_active) continue
    const title = titleById.get(row.work_item_id) ?? "(unbenannt)"
    warnings.push({
      phase: "done",
      tagKey: tag.key,
      message: `Work-Item „${title}" hat Tag „${tag.display_name}" aber ist nicht abgeschlossen.`,
      suggestedTemplateKey: tag.template_keys[0],
    })
  }
  return warnings
}
