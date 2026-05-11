import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, type ApiErrorBody } from "@/app/api/_lib/route-helpers"
import type { createClient } from "@/lib/supabase/server"
import {
  LINK_TYPES,
  canonicalLinkType,
  resolveLinkHierarchy,
  type WorkItemLinkApprovalState,
  type WorkItemLinkType,
} from "@/lib/work-items/link-types"
import type {
  LinkInboxItem,
  WorkItemLink,
  WorkItemLinkProjectTargetRef,
  WorkItemLinkTargetRef,
  WorkItemLinkWithTargets,
} from "@/types/work-item-link"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

export const uuidSchema = z.string().uuid()

export const createLinkSchema = z
  .object({
    from_work_item_id: uuidSchema,
    to_work_item_id: uuidSchema.optional().nullable(),
    to_project_id: uuidSchema.optional().nullable(),
    link_type: z.enum(LINK_TYPES as unknown as [WorkItemLinkType, ...WorkItemLinkType[]]),
    lag_days: z.number().int().min(-2000).max(2000).optional().nullable(),
  })
  .refine((value) => Boolean(value.to_work_item_id) !== Boolean(value.to_project_id), {
    message: "Either to_work_item_id or to_project_id must be set.",
    path: ["to_work_item_id"],
  })

export interface WorkItemLinkWorkItemRow {
  id: string
  tenant_id: string
  project_id: string
  kind: WorkItemKind
  title: string
  status: WorkItemStatus
  is_deleted?: boolean
}

export interface ProjectRefRow {
  id: string
  tenant_id: string
  name: string | null
  parent_project_id: string | null
  is_deleted?: boolean
}

interface ProfileRow {
  id: string
  display_name: string | null
  email: string | null
}

export function parseUuidParam(
  value: string,
  field: string,
): NextResponse<ApiErrorBody> | null {
  if (!uuidSchema.safeParse(value).success) {
    return apiError("validation_error", `Invalid ${field}.`, 400, field)
  }
  return null
}

export async function readWorkItemInProject(
  supabase: ServerSupabaseClient,
  projectId: string,
  workItemId: string,
): Promise<{ row: WorkItemLinkWorkItemRow | null; error: NextResponse<ApiErrorBody> | null }> {
  const { data, error } = await supabase
    .from("work_items")
    .select("id, tenant_id, project_id, kind, title, status, is_deleted")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .maybeSingle<WorkItemLinkWorkItemRow>()

  if (error) return { row: null, error: apiError("internal_error", error.message, 500) }
  if (!data || data.is_deleted) {
    return { row: null, error: apiError("not_found", "Work item not found.", 404) }
  }
  return { row: data, error: null }
}

export async function readProject(
  supabase: ServerSupabaseClient,
  projectId: string,
): Promise<{ row: ProjectRefRow | null; error: NextResponse<ApiErrorBody> | null }> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, tenant_id, name, parent_project_id, is_deleted")
    .eq("id", projectId)
    .maybeSingle<ProjectRefRow>()

  if (error) return { row: null, error: apiError("internal_error", error.message, 500) }
  if (!data || data.is_deleted) {
    return { row: null, error: apiError("not_found", "Project not found.", 404) }
  }
  return { row: data, error: null }
}

export async function classifyProjectRelation(
  supabase: ServerSupabaseClient,
  fromProjectId: string,
  toProjectId: string,
): Promise<"same" | "hierarchy" | "cross"> {
  if (fromProjectId === toProjectId) return "same"
  const { data } = await supabase
    .from("projects")
    .select("id, parent_project_id")
    .in("id", [fromProjectId, toProjectId])

  const map = new Map<string, { id: string; parent_project_id: string | null }>()
  for (const row of (data ?? []) as { id: string; parent_project_id: string | null }[]) {
    map.set(row.id, row)
  }
  return resolveLinkHierarchy(fromProjectId, toProjectId, map)
}

export function normalizeCreateLinkInput(input: {
  source: WorkItemLinkWorkItemRow
  targetItem?: WorkItemLinkWorkItemRow | null
  targetProject?: ProjectRefRow | null
  linkType: WorkItemLinkType
  lagDays: number | null
  approvalState: WorkItemLinkApprovalState
  approvalProjectId: string | null
  userId: string
}): Omit<WorkItemLink, "id" | "created_at" | "updated_at"> {
  const { type, swap } = canonicalLinkType(input.linkType)
  if (!input.targetItem && swap) {
    throw new Error("whole_project_reverse_link")
  }

  let fromItem = input.source
  let toItem = input.targetItem ?? null
  if (swap && toItem) {
    fromItem = toItem
    toItem = input.source
  }

  const toProjectId = toItem?.project_id ?? input.targetProject?.id ?? null
  if (!toProjectId) throw new Error("target_project_required")

  return {
    tenant_id: input.source.tenant_id,
    from_work_item_id: fromItem.id,
    to_work_item_id: toItem?.id ?? null,
    from_project_id: fromItem.project_id,
    to_project_id: toProjectId,
    link_type: type,
    lag_days: input.lagDays,
    approval_state: input.approvalState,
    approval_project_id: input.approvalProjectId,
    approved_by: input.approvalState === "approved" ? input.userId : null,
    approved_at: input.approvalState === "approved" ? new Date().toISOString() : null,
    created_by: input.userId,
  }
}

export async function enrichWorkItemLinks(
  supabase: ServerSupabaseClient,
  links: WorkItemLink[],
  userId: string,
  tenantId: string,
): Promise<WorkItemLinkWithTargets[]> {
  if (links.length === 0) return []

  const itemIds = new Set<string>()
  const projectIds = new Set<string>()
  const creatorIds = new Set<string>()
  for (const link of links) {
    itemIds.add(link.from_work_item_id)
    if (link.to_work_item_id) itemIds.add(link.to_work_item_id)
    projectIds.add(link.from_project_id)
    if (link.to_project_id) projectIds.add(link.to_project_id)
    creatorIds.add(link.created_by)
  }

  const [itemsRes, projectsRes, tenantRoleRes, membershipsRes, profilesRes] =
    await Promise.all([
      supabase
        .from("work_items")
        .select("id, title, kind, status, project_id")
        .in("id", Array.from(itemIds)),
      supabase
        .from("projects")
        .select("id, name")
        .in("id", Array.from(projectIds)),
      supabase
        .from("tenant_memberships")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle<{ role: string }>(),
      supabase
        .from("project_memberships")
        .select("project_id")
        .eq("user_id", userId)
        .in("project_id", Array.from(projectIds)),
      supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(creatorIds)),
    ])

  const itemMap = new Map<string, WorkItemLinkTargetRef>()
  for (const row of (itemsRes.data ?? []) as Array<{
    id: string
    title: string | null
    kind: WorkItemKind | null
    status: WorkItemStatus | null
    project_id: string
  }>) {
    itemMap.set(row.id, {
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      project_id: row.project_id,
      project_name: null,
      accessible: true,
    })
    projectIds.add(row.project_id)
  }

  const projectNameMap = new Map<string, string | null>()
  for (const row of (projectsRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    projectNameMap.set(row.id, row.name)
  }

  const accessibleProjectIds = new Set<string>()
  if (tenantRoleRes.data?.role === "admin") {
    for (const projectId of projectIds) accessibleProjectIds.add(projectId)
  } else {
    for (const row of (membershipsRes.data ?? []) as Array<{ project_id: string }>) {
      accessibleProjectIds.add(row.project_id)
    }
  }

  const profileMap = new Map<string, string | null>()
  for (const row of (profilesRes.data ?? []) as ProfileRow[]) {
    profileMap.set(row.id, row.display_name ?? row.email ?? null)
  }

  function fallbackItem(
    id: string,
    projectId: string,
  ): WorkItemLinkTargetRef {
    return {
      id,
      title: null,
      kind: null,
      status: null,
      project_id: projectId,
      project_name: projectNameMap.get(projectId) ?? null,
      accessible: false,
    }
  }

  function attachProjectName(ref: WorkItemLinkTargetRef): WorkItemLinkTargetRef {
    return {
      ...ref,
      project_name: projectNameMap.get(ref.project_id) ?? ref.project_name ?? null,
    }
  }

  return links.map((link) => {
    const source = itemMap.get(link.from_work_item_id)
    const target = link.to_work_item_id ? itemMap.get(link.to_work_item_id) : null
    const targetProject: WorkItemLinkProjectTargetRef | null =
      link.to_work_item_id === null && link.to_project_id
        ? {
            project_id: link.to_project_id,
            project_name: projectNameMap.get(link.to_project_id) ?? null,
            accessible: accessibleProjectIds.has(link.to_project_id),
          }
        : null

    return {
      ...link,
      source_item: source
        ? attachProjectName(source)
        : fallbackItem(link.from_work_item_id, link.from_project_id),
      target_item: link.to_work_item_id
        ? target
          ? attachProjectName(target)
          : fallbackItem(link.to_work_item_id, link.to_project_id ?? "")
        : null,
      target_project: targetProject,
      created_by_name: profileMap.get(link.created_by) ?? null,
    }
  })
}

export function toInboxItem(link: WorkItemLinkWithTargets): LinkInboxItem {
  if (!link.source_item) {
    throw new Error("work item link inbox item requires source_item")
  }
  return {
    link_id: link.id,
    link_type: link.link_type,
    approval_state: link.approval_state,
    created_at: link.created_at,
    created_by_name: link.created_by_name,
    lag_days: link.lag_days,
    source: link.source_item,
    target: link.target_item,
    target_project: link.target_project,
  }
}
