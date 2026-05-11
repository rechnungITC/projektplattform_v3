/**
 * PROJ-44 — Context source types.
 *
 * Mirrors the `context_sources` table from
 * supabase/migrations/20260511150000_proj44b_context_sources.sql.
 */

import type { DataClass } from "@/types/tenant-settings"

export type ContextSourceKind =
  | "document"
  | "email"
  | "meeting_notes"
  | "transcript"
  | "other"

export const CONTEXT_SOURCE_KINDS: readonly ContextSourceKind[] = [
  "document",
  "email",
  "meeting_notes",
  "transcript",
  "other",
] as const

export const CONTEXT_SOURCE_KIND_LABELS: Record<ContextSourceKind, string> = {
  document: "Dokument",
  email: "E-Mail",
  meeting_notes: "Meeting-Notiz",
  transcript: "Transkript",
  other: "Andere",
}

export type ContextSourceProcessingStatus =
  | "pending"
  | "processing"
  | "classified"
  | "failed"
  | "archived"

export interface ContextSource {
  id: string
  tenant_id: string
  project_id: string | null
  kind: ContextSourceKind
  title: string
  content_excerpt: string | null
  content_full_url: string | null
  source_metadata: Record<string, unknown>
  language: "de" | "en" | null
  privacy_class: DataClass
  processing_status: ContextSourceProcessingStatus
  last_processed_at: string | null
  last_failure_reason: string | null
  created_by: string
  created_at: string
  updated_at: string
}
