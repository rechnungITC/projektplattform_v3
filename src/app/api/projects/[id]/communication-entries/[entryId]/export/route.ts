import { NextResponse } from "next/server"

import { guardEntryRoute, type EntryCtx } from "../_guard"

// PROJ-119 AC2 — content download / print view.
//
// GET /api/projects/[id]/communication-entries/[entryId]/export?as=csv|print
//
// The honest boundary: browser print (Ctrl+P), screenshots and simply
// retyping the text CANNOT be prevented, and this slice deliberately does not
// pretend otherwise — no CSS print-blocking theatre. What IS enforced, server
// side, is the release of the content itself:
//
//   standard                      -> allowed, not logged
//   confidential                  -> allowed, logged (granted)
//   strict OR inner circle        -> 403, logged (denied)
//
// The UI hides the button when it would be refused, but that is convenience,
// not the control: the authority is here.

const ENTRY_SELECT =
  "id, target_group_key, target_group_label, message, channel, planned_date, " +
  "actual_date, approval_status, confidentiality_level, is_inner_circle, embargo_at"

interface ExportRow {
  id: string
  target_group_key: string
  target_group_label: string | null
  message: string | null
  channel: string | null
  planned_date: string | null
  actual_date: string | null
  approval_status: string
  confidentiality_level: "standard" | "confidential" | "strict"
  is_inner_circle: boolean
  embargo_at: string | null
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV + neutralise spreadsheet formula injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function GET(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const as = new URL(request.url).searchParams.get("as") === "print" ? "print" : "csv"
  const action = as === "print" ? "print_view" : "export"

  // RLS + both restrictive gates scope this read: an entry the caller may not
  // see simply is not here.
  const { data, error } = await supabase
    .from("communication_matrix_entries")
    .select(ENTRY_SELECT)
    .eq("id", entryId)
    .maybeSingle<ExportRow>()

  if (error) {
    return NextResponse.json(
      { error: { code: "export_failed", message: error.message } },
      { status: 500 }
    )
  }

  if (!data) {
    // Best-effort: record the attempt when the entry exists but is hidden. The
    // RPC refuses unknown ids, so a probe for a random uuid writes nothing.
    await supabase.rpc("log_communication_access", {
      p_entry_id: entryId,
      p_action: action,
      p_outcome: "denied",
    })
    return NextResponse.json(
      { error: { code: "not_found", message: "Entry not found." } },
      { status: 404 }
    )
  }

  const restricted = data.is_inner_circle || data.confidentiality_level === "strict"
  if (restricted) {
    await supabase.rpc("log_communication_access", {
      p_entry_id: entryId,
      p_action: action,
      p_outcome: "denied",
    })
    return NextResponse.json(
      {
        error: {
          code: "forbidden",
          message: data.is_inner_circle
            ? "Inner-circle content cannot be exported or printed. The attempt has been logged."
            : "Strictly confidential content cannot be exported or printed. The attempt has been logged.",
        },
      },
      { status: 403 }
    )
  }

  if (data.confidentiality_level === "confidential") {
    await supabase.rpc("log_communication_access", {
      p_entry_id: entryId,
      p_action: action,
      p_outcome: "granted",
    })
  }

  if (as === "print") {
    return NextResponse.json({ entry: data })
  }

  const header = [
    "Zielgruppe",
    "Botschaft",
    "Kanal",
    "Geplant",
    "Tatsaechlich",
    "Status",
    "Vertraulichkeit",
    "Embargo",
  ]
  const row = [
    data.target_group_label?.trim() || data.target_group_key,
    data.message ?? "",
    data.channel ?? "",
    data.planned_date ?? "",
    data.actual_date ?? "",
    data.approval_status,
    data.confidentiality_level,
    data.embargo_at ?? "",
  ]
  const csv = [header.map(csvCell).join(","), row.map(csvCell).join(",")].join("\n")

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kommunikation-${entryId.slice(0, 8)}.csv"`,
    },
  })
}
