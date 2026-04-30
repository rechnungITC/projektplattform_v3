/**
 * PROJ-18 — Compliance trigger engine.
 *
 * Locked design (Frage 1 = A): the trigger runs as a TypeScript module
 * inside the same API request as the work-item write. The DB-side
 * idempotency is provided by the UNIQUE(work_item_id, tag_id, phase)
 * constraint on `compliance_trigger_log` — the engine writes a log row
 * for every effect; if a duplicate insert raises 23505 (unique violation)
 * we know the effect already fired and we silently skip it.
 *
 * The engine never calls `supabase` directly — callers pass in a client
 * (so they can switch between user-context and admin-context). This keeps
 * the engine pure and testable without mocking the SSR cookie store.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { WorkItemKind } from "@/types/work-item"

import { lookupTemplates } from "./templates"
import type {
  CompliancePhase,
  ComplianceTag,
  ComplianceTemplate,
  TriggerEffect,
} from "./types"

// ──────────────────────────────────────────────────────────────────────
// Pure helpers — no DB access
// ──────────────────────────────────────────────────────────────────────

/**
 * For a given set of tags + phase, return the templates whose `firePhase`
 * matches. Templates from inactive tags are skipped.
 *
 * Pure function — used by tests directly without any DB.
 */
export function resolveEffects(
  tags: readonly ComplianceTag[],
  phase: CompliancePhase
): TriggerEffect[] {
  const out: TriggerEffect[] = []
  for (const tag of tags) {
    if (!tag.is_active) continue
    const templates = lookupTemplates(tag.template_keys).filter(
      (t) => t.firePhase === phase
    )
    // Emit only when there's actual work to do — `default_child_kinds`
    // is a UI hint, not a fire-condition. Without templates we'd write
    // a log row that prevents future fires without producing anything.
    if (templates.length === 0) continue
    out.push({
      tagId: tag.id,
      tagKey: tag.key,
      phase,
      templates,
    })
  }
  return out
}

/**
 * Merge a tag's `default_child_kinds` with the kinds explicitly listed in
 * its templates. The result drives the "what kinds of children does this
 * tag fire?" UI hint AND the actual creation when a tag has no template.
 */
export function expectedChildKinds(tag: ComplianceTag): WorkItemKind[] {
  const kinds = new Set<WorkItemKind>()
  for (const k of tag.default_child_kinds) {
    kinds.add(k)
  }
  for (const tpl of lookupTemplates(tag.template_keys)) {
    kinds.add(tpl.childKind)
  }
  return Array.from(kinds)
}

// ──────────────────────────────────────────────────────────────────────
// DB-bound helpers — operate via a passed-in Supabase client
// ──────────────────────────────────────────────────────────────────────

interface TriggerContext {
  /** Supabase client (user-context or admin-context). */
  supabase: SupabaseClient
  /** Tenant of the parent work-item. */
  tenantId: string
  /** Project of the parent work-item. */
  projectId: string
  /** The just-created or just-updated parent work-item. */
  workItemId: string
  /** Phase the parent transitioned into. */
  phase: CompliancePhase
  /** Acting user (becomes `created_by` on child rows). */
  userId: string
}

interface ApplyResult {
  childWorkItemIds: string[]
  documentIds: string[]
  /**
   * Number of (tag, phase) pairs that were already logged (i.e. fired
   * earlier and skipped this time). Useful for tests + observability.
   */
  skippedDuplicates: number
}

/**
 * Resolve all `compliance_tags` rows attached to a work-item. The caller's
 * RLS context determines visibility — for service routes, use the admin
 * client; for user-context, only project-member-visible tags come back.
 */
export async function loadTagsForWorkItem(
  supabase: SupabaseClient,
  workItemId: string
): Promise<ComplianceTag[]> {
  const { data, error } = await supabase
    .from("work_item_tags")
    .select("tag_id, compliance_tags!inner(*)")
    .eq("work_item_id", workItemId)
  if (error) throw new Error(`loadTagsForWorkItem: ${error.message}`)
  if (!data) return []
  // Supabase returns the joined column as `compliance_tags` (singular row
  // because of the FK). Coerce defensively — the !inner makes it
  // non-null, but the typing comes back as object | object[] depending
  // on schema cache state.
  type Row = { tag_id: string; compliance_tags: ComplianceTag | ComplianceTag[] }
  return (data as unknown as Row[]).map((r) =>
    Array.isArray(r.compliance_tags) ? r.compliance_tags[0] : r.compliance_tags
  )
}

interface CreateChildArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  parentId: string
  template: ComplianceTemplate
  userId: string
}

async function createChildWorkItem(
  args: CreateChildArgs
): Promise<{ id: string }> {
  const { supabase, tenantId, projectId, parentId, template, userId } = args
  const insertPayload = {
    tenant_id: tenantId,
    project_id: projectId,
    kind: template.childKind,
    parent_id: parentId,
    title: template.childTitle,
    description: template.childDescription,
    status: "todo",
    priority: "medium",
    attributes: {
      compliance_origin: {
        template_key: template.key,
      },
    },
    created_by: userId,
  }
  const { data, error } = await supabase
    .from("work_items")
    .insert(insertPayload)
    .select("id")
    .single()
  if (error) throw new Error(`createChildWorkItem: ${error.message}`)
  return data as { id: string }
}

interface CreateDocArgs {
  supabase: SupabaseClient
  tenantId: string
  workItemId: string
  template: ComplianceTemplate
  userId: string
}

async function createComplianceDocument(
  args: CreateDocArgs
): Promise<{ id: string }> {
  const { supabase, tenantId, workItemId, template, userId } = args
  const { data, error } = await supabase
    .from("work_item_documents")
    .insert({
      tenant_id: tenantId,
      work_item_id: workItemId,
      kind: "compliance-form",
      title: template.title,
      body: template.body,
      checklist: template.checklist,
      version: 1,
      created_by: userId,
    })
    .select("id")
    .single()
  if (error) throw new Error(`createComplianceDocument: ${error.message}`)
  return data as { id: string }
}

interface LogTriggerArgs {
  supabase: SupabaseClient
  tenantId: string
  workItemId: string
  tagId: string
  phase: CompliancePhase
}

/**
 * Insert the idempotency row. Returns true if the row was inserted (we
 * should fire effects), false if the UNIQUE constraint rejected it
 * (we should skip).
 */
async function logTrigger(args: LogTriggerArgs): Promise<boolean> {
  const { supabase, tenantId, workItemId, tagId, phase } = args
  const { error } = await supabase.from("compliance_trigger_log").insert({
    tenant_id: tenantId,
    work_item_id: workItemId,
    tag_id: tagId,
    phase,
  })
  if (error) {
    // PG 23505 = unique_violation → already fired, silently skip.
    if (error.code === "23505") return false
    throw new Error(`logTrigger: ${error.message}`)
  }
  return true
}

/**
 * Apply trigger effects for the given (work-item, phase) pair.
 *
 * For every (tag, phase) effect:
 *   1. INSERT a row into `compliance_trigger_log` (UNIQUE prevents
 *      double-firing across retries). If 23505, skip — already fired.
 *   2. For every template in the effect: create a child work-item
 *      (compliance-form attached) and a `work_item_documents` row.
 *
 * The function does NOT wrap in a transaction — Postgres' implicit
 * autocommit per statement is fine because: (a) the log-row insert
 * is the gate, so a partially-failed effect just leaves an "exists"
 * marker that prevents retries; (b) the child work-items and documents
 * are independent records the user can edit/delete by hand.
 *
 * If you want strict all-or-nothing semantics, wrap the call site in
 * a Postgres transaction via Supabase's `rpc` — out of scope for v1.
 */
export async function applyTriggerForWorkItem(
  ctx: TriggerContext
): Promise<ApplyResult> {
  const tags = await loadTagsForWorkItem(ctx.supabase, ctx.workItemId)
  if (tags.length === 0) {
    return { childWorkItemIds: [], documentIds: [], skippedDuplicates: 0 }
  }

  const effects = resolveEffects(tags, ctx.phase)
  const childWorkItemIds: string[] = []
  const documentIds: string[] = []
  let skippedDuplicates = 0

  for (const effect of effects) {
    const fresh = await logTrigger({
      supabase: ctx.supabase,
      tenantId: ctx.tenantId,
      workItemId: ctx.workItemId,
      tagId: effect.tagId,
      phase: effect.phase,
    })
    if (!fresh) {
      skippedDuplicates += 1
      continue
    }
    for (const template of effect.templates) {
      const child = await createChildWorkItem({
        supabase: ctx.supabase,
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        parentId: ctx.workItemId,
        template,
        userId: ctx.userId,
      })
      childWorkItemIds.push(child.id)
      const doc = await createComplianceDocument({
        supabase: ctx.supabase,
        tenantId: ctx.tenantId,
        workItemId: child.id,
        template,
        userId: ctx.userId,
      })
      documentIds.push(doc.id)
    }
  }

  return { childWorkItemIds, documentIds, skippedDuplicates }
}

/**
 * Fire trigger when a new tag is attached to an existing work-item. The
 * caller passes the tag-id; we fetch the row, then fire ONLY for the
 * `phase = "created"` effect (mirrors the semantics of "first attachment
 * means the form should appear immediately"). If the tag is also relevant
 * for `in_progress` or `done`, those fire later via the lifecycle path.
 */
export async function applyTriggerForNewTag(args: {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  workItemId: string
  tagId: string
  userId: string
}): Promise<ApplyResult> {
  const { supabase, tenantId, projectId, workItemId, tagId, userId } = args
  const { data, error } = await supabase
    .from("compliance_tags")
    .select("*")
    .eq("id", tagId)
    .maybeSingle()
  if (error) throw new Error(`applyTriggerForNewTag: ${error.message}`)
  if (!data) return { childWorkItemIds: [], documentIds: [], skippedDuplicates: 0 }
  const tag = data as ComplianceTag
  if (!tag.is_active) {
    return { childWorkItemIds: [], documentIds: [], skippedDuplicates: 0 }
  }

  // Reuse the same effect resolution by passing a singleton tag list.
  const effects = resolveEffects([tag], "created")
  const childWorkItemIds: string[] = []
  const documentIds: string[] = []
  let skippedDuplicates = 0

  for (const effect of effects) {
    const fresh = await logTrigger({
      supabase,
      tenantId,
      workItemId,
      tagId: effect.tagId,
      phase: effect.phase,
    })
    if (!fresh) {
      skippedDuplicates += 1
      continue
    }
    for (const template of effect.templates) {
      const child = await createChildWorkItem({
        supabase,
        tenantId,
        projectId,
        parentId: workItemId,
        template,
        userId,
      })
      childWorkItemIds.push(child.id)
      const doc = await createComplianceDocument({
        supabase,
        tenantId,
        workItemId: child.id,
        template,
        userId,
      })
      documentIds.push(doc.id)
    }
  }

  return { childWorkItemIds, documentIds, skippedDuplicates }
}
