import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import { defectRpcErrorStatus, idSchema, transitionDefectSchema } from "../../_schema"

// PROJ-45-β — the single audited status path of a defect.
//
// Every transition, its allowed predecessors, the mandatory reason for
// `zurueckweisen`/`verwerfen` and the FOUR-EYES gate on `pruefen` live in
// `transition_construction_defect_status`. The route validates the vocabulary
// and forwards; it never decides.
//
// The four-eyes refusal arrives as 42501 and its message says why (whoever
// reported completion cannot approve it). Passing that message through is
// deliberate — a bare "Not allowed." would read as a permission bug to a lead
// who does hold the role. There is no override path: if the lead is also the
// only tenant admin, the defect cannot reach `geprueft`, and the legitimate
// remedy is a second authorised person.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(did).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // The defect must actually belong to the project in the URL. The RPC below
  // authorises against the defect's OWN project, so skipping this is not an
  // escalation — but it would leave the URL segment decorative, let a mutation
  // land in project B through project A's address, and evaluate the module gate
  // against the wrong tenant. The sibling events route already probes; keeping
  // all three consistent means a later slice that trusts this segment cannot be
  // wrong about it.
  const { data: owned, error: ownedError } = await supabase
    .from("construction_defects")
    .select("id")
    .eq("id", did)
    .eq("project_id", projectId)
    .maybeSingle()

  if (ownedError) return apiError("transition_failed", ownedError.message, 500)
  if (!owned) return apiError("not_found", "Construction defect not found.", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = transitionDefectSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase.rpc(
    "transition_construction_defect_status",
    {
      p_defect_id: did,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason ?? null,
    }
  )

  if (error) {
    const mapped = defectRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json({ defect: data })
}
