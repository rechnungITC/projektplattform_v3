import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import {
  buildJiraIssuePayload,
  createJiraIssue,
  jiraIssueUrl,
  sanitizeJiraError,
  updateJiraIssue,
  type JiraCredentials,
} from "@/lib/jira/client"
import {
  defaultJiraFieldMapping,
  JiraFieldMappingSchema,
  type JiraFieldMapping,
} from "@/lib/jira/mapping"

export const JiraExportScopeSchema = z.object({
  work_item_ids: z.array(z.string().uuid()).min(1).max(100),
})

export type JiraExportScope = z.infer<typeof JiraExportScopeSchema>

export interface JiraWorkItemRow {
  id: string
  tenant_id: string
  project_id: string
  kind: string
  title: string
  description: string | null
  status: string
  priority: string
  is_deleted?: boolean
}

export interface JiraExternalRefRow {
  id: string
  entity_id: string
  external_key: string
  external_url: string | null
}

export interface JiraExportPreviewItem {
  work_item_id: string
  title: string
  kind: string
  action: "create" | "update" | "skip"
  jira_issue_key: string | null
  jira_issue_url: string | null
  warnings: string[]
}

export interface JiraExportPreview {
  mapping: JiraFieldMapping
  items: JiraExportPreviewItem[]
}

interface SupabaseError {
  message: string
}

function assertNoError(error: SupabaseError | null | undefined, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function loadJiraFieldMapping(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    defaultProjectKey: string
  }
): Promise<JiraFieldMapping> {
  const { data, error } = await supabase
    .from("jira_field_mappings")
    .select(
      "jira_project_key, issue_type_map, status_map, priority_map, labels, assignee_mode"
    )
    .eq("tenant_id", args.tenantId)
    .eq("project_id", args.projectId)
    .maybeSingle()

  assertNoError(error, "load jira_field_mappings failed")
  if (!data) return defaultJiraFieldMapping(args.defaultProjectKey)
  return JiraFieldMappingSchema.parse(data)
}

export async function saveJiraFieldMapping(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    actorUserId: string
    mapping: JiraFieldMapping
  }
): Promise<JiraFieldMapping> {
  const { data: existing, error: readError } = await supabase
    .from("jira_field_mappings")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("project_id", args.projectId)
    .maybeSingle()
  assertNoError(readError, "read jira_field_mappings failed")

  const row = {
    tenant_id: args.tenantId,
    project_id: args.projectId,
    jira_project_key: args.mapping.jira_project_key,
    issue_type_map: args.mapping.issue_type_map,
    status_map: args.mapping.status_map,
    priority_map: args.mapping.priority_map,
    labels: args.mapping.labels,
    assignee_mode: args.mapping.assignee_mode,
    created_by: args.actorUserId,
    updated_by: args.actorUserId,
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("jira_field_mappings")
      .update(row)
      .eq("id", existing.id as string)
    assertNoError(error, "update jira_field_mappings failed")
  } else {
    const { error } = await supabase.from("jira_field_mappings").insert(row)
    assertNoError(error, "insert jira_field_mappings failed")
  }

  return args.mapping
}

async function loadWorkItems(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    workItemIds: string[]
  }
): Promise<JiraWorkItemRow[]> {
  const { data, error } = await supabase
    .from("work_items")
    .select(
      "id, tenant_id, project_id, kind, title, description, status, priority, is_deleted"
    )
    .eq("tenant_id", args.tenantId)
    .eq("project_id", args.projectId)
    .eq("is_deleted", false)
    .in("id", args.workItemIds)
  assertNoError(error, "load work_items failed")
  return (data ?? []) as JiraWorkItemRow[]
}

async function loadExternalRefs(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    workItemIds: string[]
  }
): Promise<Map<string, JiraExternalRefRow>> {
  const { data, error } = await supabase
    .from("external_refs")
    .select("id, entity_id, external_key, external_url")
    .eq("tenant_id", args.tenantId)
    .eq("project_id", args.projectId)
    .eq("provider", "jira")
    .eq("entity_type", "work_item")
    .in("entity_id", args.workItemIds)
  assertNoError(error, "load external_refs failed")
  return new Map(
    ((data ?? []) as JiraExternalRefRow[]).map((row) => [row.entity_id, row])
  )
}

function previewItem(
  item: JiraWorkItemRow,
  mapping: JiraFieldMapping,
  externalRef: JiraExternalRefRow | undefined
): JiraExportPreviewItem {
  const warnings: string[] = []
  if (!mapping.issue_type_map[item.kind]) {
    warnings.push(`Kein Jira Issue-Type-Mapping fuer Work-Item-Art ${item.kind}`)
  }
  if (!mapping.priority_map[item.priority]) {
    warnings.push(`Kein Jira Priority-Mapping fuer Prioritaet ${item.priority}`)
  }

  return {
    work_item_id: item.id,
    title: item.title,
    kind: item.kind,
    action: warnings.length > 0 ? "skip" : externalRef ? "update" : "create",
    jira_issue_key: externalRef?.external_key ?? null,
    jira_issue_url: externalRef?.external_url ?? null,
    warnings,
  }
}

export async function createJiraExportPreview(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    credentials: JiraCredentials
    scope: JiraExportScope
  }
): Promise<JiraExportPreview> {
  const mapping = await loadJiraFieldMapping(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    defaultProjectKey: args.credentials.default_project_key,
  })
  const items = await loadWorkItems(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workItemIds: args.scope.work_item_ids,
  })
  const refs = await loadExternalRefs(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workItemIds: args.scope.work_item_ids,
  })

  const foundIds = new Set(items.map((item) => item.id))
  const missing = args.scope.work_item_ids.filter((id) => !foundIds.has(id))
  const previewItems = items.map((item) =>
    previewItem(item, mapping, refs.get(item.id))
  )
  for (const id of missing) {
    previewItems.push({
      work_item_id: id,
      title: "(not found)",
      kind: "unknown",
      action: "skip",
      jira_issue_key: null,
      jira_issue_url: null,
      warnings: ["Work Item nicht gefunden oder nicht im Projekt sichtbar"],
    })
  }

  return { mapping, items: previewItems }
}

function issuePayload(item: JiraWorkItemRow, mapping: JiraFieldMapping) {
  const issueType = mapping.issue_type_map[item.kind]
  if (!issueType) return null
  return buildJiraIssuePayload({
    projectKey: mapping.jira_project_key,
    issueType,
    summary: item.title,
    description: item.description,
    priority: mapping.priority_map[item.priority] ?? null,
    labels: mapping.labels,
  })
}

export async function runJiraExportJob(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    actorUserId: string
    credentials: JiraCredentials
    scope: JiraExportScope
    fetchImpl?: typeof fetch
  }
): Promise<{ job_id: string; status: "succeeded" | "partial_failed" | "failed" }> {
  const mapping = await loadJiraFieldMapping(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    defaultProjectKey: args.credentials.default_project_key,
  })

  const { data: jobRows, error: jobError } = await supabase
    .from("jira_export_jobs")
    .insert({
      tenant_id: args.tenantId,
      project_id: args.projectId,
      actor_user_id: args.actorUserId,
      status: "running",
      scope: args.scope,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  assertNoError(jobError, "insert jira_export_jobs failed")
  const jobId = String((jobRows as { id: string }).id)

  const items = await loadWorkItems(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workItemIds: args.scope.work_item_ids,
  })
  const refs = await loadExternalRefs(supabase, {
    tenantId: args.tenantId,
    projectId: args.projectId,
    workItemIds: args.scope.work_item_ids,
  })

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const item of items) {
    const payload = issuePayload(item, mapping)
    if (!payload) {
      skipped++
      await insertLog(supabase, {
        tenantId: args.tenantId,
        projectId: args.projectId,
        jobId,
        workItemId: item.id,
        result: "skipped",
        attempt: 0,
        sanitizedError: `Kein Jira Issue-Type-Mapping fuer ${item.kind}`,
      })
      continue
    }

    const existingRef = refs.get(item.id)
    try {
      if (existingRef) {
        await updateJiraIssue(
          args.credentials,
          existingRef.external_key,
          payload,
          args.fetchImpl
        )
        updated++
        await insertLog(supabase, {
          tenantId: args.tenantId,
          projectId: args.projectId,
          jobId,
          workItemId: item.id,
          result: "updated",
          issueKey: existingRef.external_key,
          issueUrl: existingRef.external_url,
          attempt: 1,
        })
      } else {
        const issue = await createJiraIssue(
          args.credentials,
          payload,
          args.fetchImpl
        )
        const url = jiraIssueUrl(args.credentials, issue.key)
        await upsertExternalRef(supabase, {
          tenantId: args.tenantId,
          projectId: args.projectId,
          actorUserId: args.actorUserId,
          workItemId: item.id,
          issueKey: issue.key,
          issueUrl: url,
        })
        created++
        await insertLog(supabase, {
          tenantId: args.tenantId,
          projectId: args.projectId,
          jobId,
          workItemId: item.id,
          result: "created",
          issueKey: issue.key,
          issueUrl: url,
          attempt: 1,
        })
      }
    } catch (err) {
      failed++
      await insertLog(supabase, {
        tenantId: args.tenantId,
        projectId: args.projectId,
        jobId,
        workItemId: item.id,
        result: "failed",
        attempt: 1,
        sanitizedError: sanitizeJiraError(err),
      })
    }
  }

  const status = failed === 0 ? "succeeded" : created + updated > 0 ? "partial_failed" : "failed"
  const { error: updateError } = await supabase
    .from("jira_export_jobs")
    .update({
      status,
      total_count: items.length,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      completed_at: new Date().toISOString(),
      sanitized_error:
        failed > 0 ? `${failed} Work Items konnten nicht exportiert werden.` : null,
    })
    .eq("id", jobId)
  assertNoError(updateError, "update jira_export_jobs failed")

  return { job_id: jobId, status }
}

async function insertLog(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    jobId: string
    workItemId: string
    result: "created" | "updated" | "skipped" | "failed"
    issueKey?: string | null
    issueUrl?: string | null
    attempt: number
    sanitizedError?: string | null
  }
) {
  const { error } = await supabase.from("jira_export_log").insert({
    tenant_id: args.tenantId,
    project_id: args.projectId,
    job_id: args.jobId,
    work_item_id: args.workItemId,
    result: args.result,
    jira_issue_key: args.issueKey ?? null,
    jira_issue_url: args.issueUrl ?? null,
    attempt: args.attempt,
    sanitized_error: args.sanitizedError ?? null,
  })
  assertNoError(error, "insert jira_export_log failed")
}

async function upsertExternalRef(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    actorUserId: string
    workItemId: string
    issueKey: string
    issueUrl: string
  }
) {
  const { error } = await supabase.from("external_refs").upsert(
    {
      tenant_id: args.tenantId,
      project_id: args.projectId,
      entity_type: "work_item",
      entity_id: args.workItemId,
      provider: "jira",
      external_key: args.issueKey,
      external_url: args.issueUrl,
      last_exported_at: new Date().toISOString(),
      created_by: args.actorUserId,
      updated_by: args.actorUserId,
    },
    { onConflict: "tenant_id,provider,entity_type,entity_id" }
  )
  assertNoError(error, "upsert external_refs failed")
}
