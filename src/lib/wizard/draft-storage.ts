/**
 * PROJ-5 — temporary localStorage adapter for wizard drafts. The /backend
 * phase replaces every call here with a fetch() to /api/wizard-drafts;
 * the public surface (listDrafts, getDraft, saveDraft, discardDraft)
 * stays identical so consumers don't need to change.
 *
 * Tenant + user are part of the storage key so two users on the same
 * machine can't see each other's drafts. The future RLS policy enforces
 * the same boundary on the server.
 */

import type { WizardDraft, WizardData } from "@/types/wizard"

const KEY_PREFIX = "projektplattform.wizard.drafts"

function storageKey(tenantId: string, userId: string): string {
  return `${KEY_PREFIX}.${tenantId}.${userId}`
}

function readAll(tenantId: string, userId: string): WizardDraft[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as WizardDraft[]) : []
  } catch {
    return []
  }
}

function writeAll(
  tenantId: string,
  userId: string,
  drafts: WizardDraft[]
): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    storageKey(tenantId, userId),
    JSON.stringify(drafts)
  )
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function listDrafts(tenantId: string, userId: string): WizardDraft[] {
  const all = readAll(tenantId, userId)
  return [...all].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function getDraft(
  tenantId: string,
  userId: string,
  id: string
): WizardDraft | null {
  return readAll(tenantId, userId).find((d) => d.id === id) ?? null
}

interface SaveDraftInput {
  id?: string
  tenantId: string
  userId: string
  data: WizardData
}

export function saveDraft(input: SaveDraftInput): WizardDraft {
  const all = readAll(input.tenantId, input.userId)
  const now = new Date().toISOString()
  const denormName = input.data.name.trim() || null

  if (input.id) {
    const existing = all.find((d) => d.id === input.id)
    if (existing) {
      const updated: WizardDraft = {
        ...existing,
        name: denormName,
        project_type: input.data.project_type,
        project_method: input.data.project_method,
        data: input.data,
        updated_at: now,
      }
      writeAll(
        input.tenantId,
        input.userId,
        all.map((d) => (d.id === input.id ? updated : d))
      )
      return updated
    }
  }

  const created: WizardDraft = {
    id: input.id ?? newId(),
    tenant_id: input.tenantId,
    created_by: input.userId,
    name: denormName,
    project_type: input.data.project_type,
    project_method: input.data.project_method,
    data: input.data,
    created_at: now,
    updated_at: now,
  }
  writeAll(input.tenantId, input.userId, [...all, created])
  return created
}

export function discardDraft(
  tenantId: string,
  userId: string,
  id: string
): void {
  const all = readAll(tenantId, userId)
  writeAll(
    tenantId,
    userId,
    all.filter((d) => d.id !== id)
  )
}
