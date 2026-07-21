import { NextResponse } from "next/server"

import {
  parseFile,
  FileParseError,
} from "@/lib/context-ingestion/file-parser"
import {
  parseStoragePointer,
  downloadContextSourceFile,
} from "@/lib/context-ingestion/storage"
import { classifyContextSourcePrivacy } from "@/lib/context-sources/classify-privacy"
import { createAdminClient } from "@/lib/supabase/admin"

import { apiError } from "../../_lib/route-helpers"

/**
 * PROJ-75 — one-shot, re-runnable backfill sweep that re-classifies existing
 * `context_sources` rows over their FULL document text (not the 8000-char
 * excerpt they were originally classified on).
 *
 * Deliberately NOT a recurring Vercel cron (not registered in vercel.json):
 * this is a finite corrective operation over the existing backlog, invoked
 * manually with the CRON_SECRET Bearer token. It processes a bounded batch and
 * is safe to run repeatedly until `remaining` reaches 0.
 *
 * Runs with the service-role client because it works across tenants without an
 * authenticated user; each row is updated in isolation by its own id, so no
 * tenant data is mixed. Re-classification is regex-only (AC-75.11) — no LLM,
 * no document content ever leaves the stack.
 *
 * Per-row outcome:
 *   - full text re-derived + screened  → privacy_class monotonically upgraded
 *     (never lowered), full_text_classified_at set. Class-3 keeps its file
 *     (Ollama-only), no hard-delete (AC-75.7).
 *   - full text NOT re-derivable (missing/foreign file, parse error) for a
 *     row that was a truncated upload → classification_unverified = true,
 *     class unchanged, surfaced for manual DSGVO review (AC-75.8). Retried on
 *     later runs.
 *   - non-truncated / JSON-origin row (excerpt WAS the full text) → marked
 *     screened without a re-parse.
 */

const DEFAULT_BATCH = 100
const MAX_BATCH = 500

interface PendingRow {
  id: string
  privacy_class: number
  content_full_url: string | null
  mime_type: string | null
  source_metadata: Record<string, unknown> | null
  title: string
}

/** Was this row originally source-truncated by the parser (has a larger full
 *  document than its stored excerpt)? Reads the PROJ-70-γ parse metadata. */
function wasTruncated(meta: Record<string, unknown> | null): boolean {
  const parse = (meta ?? {})["proj70_gamma_parse"] as
    | { truncated?: boolean }
    | undefined
  return parse?.truncated === true
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError(
      "configuration_error",
      "CRON_SECRET is not set on the server.",
      500,
    )
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  let limit = DEFAULT_BATCH
  try {
    const body = (await request.json()) as { limit?: unknown } | null
    if (body && typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(MAX_BATCH, Math.max(1, Math.floor(body.limit)))
    }
  } catch {
    // No/invalid body → default batch size.
  }

  const supabase = createAdminClient()

  const { data: rows, error: selErr } = await supabase
    .from("context_sources")
    .select(
      "id, privacy_class, content_full_url, mime_type, source_metadata, title",
    )
    .is("full_text_classified_at", null)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (selErr) {
    return apiError("select_failed", selErr.message, 500)
  }

  const pending = (rows ?? []) as unknown as PendingRow[]
  const now = new Date().toISOString()
  let upgraded = 0
  let unverified = 0
  let screenedUnchanged = 0
  const upgradedIds: string[] = []
  const unverifiedIds: string[] = []

  for (const row of pending) {
    const path = parseStoragePointer(row.content_full_url)

    // No re-parsable file for this row.
    if (!path) {
      if (wasTruncated(row.source_metadata)) {
        // A truncated upload whose file is gone/foreign → cannot verify the
        // full text. Fail-safe: keep class, flag for manual review (AC-75.8).
        await supabase
          .from("context_sources")
          .update({ classification_unverified: true })
          .eq("id", row.id)
        unverified++
        unverifiedIds.push(row.id)
      } else {
        // Non-truncated / JSON-origin: the stored excerpt WAS the complete
        // screened text → mark screened, no re-parse needed.
        await supabase
          .from("context_sources")
          .update({ full_text_classified_at: now })
          .eq("id", row.id)
        screenedUnchanged++
      }
      continue
    }

    // Re-derive the full text from the stored file and re-classify.
    try {
      const buffer = await downloadContextSourceFile(supabase, path)
      const parsed = await parseFile(buffer, row.mime_type ?? "")
      const classification = classifyContextSourcePrivacy({
        title: row.title,
        content_excerpt: parsed.result.full_text,
      })
      // Monotone upgrade — never lower an existing/manual class (AC-75.4).
      const newClass = Math.max(row.privacy_class, classification.privacy_class)
      await supabase
        .from("context_sources")
        .update({
          privacy_class: newClass,
          full_text_classified_at: now,
          classification_unverified: false,
        })
        .eq("id", row.id)
      if (newClass > row.privacy_class) {
        upgraded++
        upgradedIds.push(row.id)
      } else {
        screenedUnchanged++
      }
    } catch (err) {
      // Download/parse failure → fail-safe flag, class unchanged (AC-75.8).
      // Do NOT log document content — only the id and a coarse reason.
      const reason =
        err instanceof FileParseError ? err.code : "download_or_parse_error"
      await supabase
        .from("context_sources")
        .update({ classification_unverified: true })
        .eq("id", row.id)
      unverified++
      unverifiedIds.push(row.id)
      void reason
    }
  }

  // How many rows still await full-text screening after this batch?
  const { count: remaining } = await supabase
    .from("context_sources")
    .select("id", { count: "exact", head: true })
    .is("full_text_classified_at", null)

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    upgraded,
    unverified,
    screened_unchanged: screenedUnchanged,
    remaining: remaining ?? 0,
    upgraded_ids: upgradedIds,
    unverified_ids: unverifiedIds,
  })
}
