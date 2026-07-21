import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-111 — CSV export of the decision log (AC6). Runs under the caller's
// RLS, so only decisions the caller may see are included. Additionally, gate
// decisions whose linked gate the caller may NOT access are filtered out via
// `hidden_stage_gate_decision_ids` (HIGH-2: don't reveal that a confidential
// gate was decided). Visible gate decisions are labelled in the `quelle`
// column; everything else is `manuell`.
//
// GET /api/projects/[id]/decisions/export?include_revised=false&phaseId=&deciderId=

const COLUMNS = [
  "title",
  "decision_text",
  "rationale",
  "quelle",
  "decided_at",
  "context_phase_id",
  "context_risk_id",
  "context_finding_id",
  "decision_body",
  "options",
  "is_revised",
  "created_at",
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV + neutralise spreadsheet formula-injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

interface DecisionRow {
  id: string
  title: string
  decision_text: string
  rationale: string | null
  decided_at: string
  context_phase_id: string | null
  context_risk_id: string | null
  context_finding_id: string | null
  decision_body: string | null
  options: string | null
  is_revised: boolean
  created_at: string
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const includeRevised = url.searchParams.get("include_revised") === "true"
  const phaseId = url.searchParams.get("phaseId")
  const deciderId = url.searchParams.get("deciderId")

  let query = supabase
    .from("decisions")
    .select(
      "id, title, decision_text, rationale, decided_at, context_phase_id, context_risk_id, context_finding_id, decision_body, options, is_revised, created_by, created_at"
    )
    .eq("project_id", projectId)
    .order("decided_at", { ascending: false })
    .limit(5000)
  if (!includeRevised) query = query.eq("is_revised", false)
  if (phaseId && z.string().uuid().safeParse(phaseId).success) {
    query = query.eq("context_phase_id", phaseId)
  }
  if (deciderId && z.string().uuid().safeParse(deciderId).success) {
    query = query.eq("created_by", deciderId)
  }

  const [decisionsRes, hiddenRes, gatesRes] = await Promise.all([
    query,
    // Small set of gate-decision ids the caller may NOT see (definer RPC).
    supabase.rpc("hidden_stage_gate_decision_ids", { p_project_id: projectId }),
    // Visible gates → provenance labelling of the caller's gate decisions.
    supabase
      .from("ma_stage_gates")
      .select("decision_id, sequence_number")
      .eq("project_id", projectId)
      .not("decision_id", "is", null),
  ])

  if (decisionsRes.error)
    return apiError("export_failed", decisionsRes.error.message, 500)
  if (hiddenRes.error)
    return apiError("export_failed", hiddenRes.error.message, 500)

  const rows = (decisionsRes.data ?? []) as unknown as DecisionRow[]
  const hidden = new Set(
    ((hiddenRes.data ?? []) as unknown as string[]).filter(Boolean)
  )
  const gateSeqByDecision = new Map<string, number>()
  for (const g of (gatesRes.data ?? []) as {
    decision_id: string | null
    sequence_number: number
  }[]) {
    if (g.decision_id) gateSeqByDecision.set(g.decision_id, g.sequence_number)
  }

  const visible = rows.filter((r) => !hidden.has(r.id))

  const header = COLUMNS.join(",")
  const body = visible
    .map((r) => {
      const seq = gateSeqByDecision.get(r.id)
      const quelle = seq != null ? `Stage-Gate ${seq}` : "manuell"
      const record: Record<string, unknown> = { ...r, quelle }
      return COLUMNS.map((c) => csvCell(record[c])).join(",")
    })
    .join("\n")
  const csv = `${header}\n${body}`

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `entscheidungen-${projectId.slice(0, 8)}-eigene-sicht-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // RLS-limited scope is explicit so an incomplete export is not mistaken
      // for the full decision log.
      "X-Export-Scope": "decisions-visible-to-caller",
    },
  })
}
