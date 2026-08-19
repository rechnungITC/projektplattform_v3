import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import { defectRpcErrorStatus, idSchema, updateDefectSchema } from "../_schema"

// PROJ-45-β — one construction defect: change its fields.
//
// The route gates at "view" and lets `update_construction_defect` decide the
// role. That is not laziness: the rule here is STRICTER than the house `edit`
// level (tenant admin OR project lead — the project `editor` is excluded,
// because warranty-relevant deadlines stay in one hand), and a route-level
// "edit" gate would put a second, weaker copy of that rule in front of it. One
// authority, written down where it applies.
//
// Emptying a field needs its explicit `clear_*` switch. An omitted value means
// "leave unchanged" in the RPC — PROJ-122 shipped a live defect where a
// withdrawn value silently survived, so the switches are the contract, not
// convenience.

export async function PATCH(
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

  if (ownedError) return apiError("update_failed", ownedError.message, 500)
  if (!owned) return apiError("not_found", "Construction defect not found.", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = updateDefectSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("update_construction_defect", {
    p_defect_id: did,
    p_title: d.title ?? null,
    p_description: d.description ?? null,
    p_clear_description: d.clear_description ?? false,
    p_severity: d.severity ?? null,
    p_trade_id: d.trade_id ?? null,
    p_section_id: d.section_id ?? null,
    p_clear_section: d.clear_section ?? false,
    p_due_date: d.due_date ?? null,
    p_clear_due_date: d.clear_due_date ?? false,
    p_responsible_user_id: d.responsible_user_id ?? null,
    p_clear_responsible: d.clear_responsible ?? false,
    p_vendor_id: d.vendor_id ?? null,
    p_clear_vendor: d.clear_vendor ?? false,
  })

  if (error) {
    const mapped = defectRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("update_failed", error.message, 500)
  }
  // Defensive: the ownership probe above already 404s an unknown defect, so a
  // null payload here would mean the RPC returned nothing for a row that exists.
  if (!data) return apiError("not_found", "Construction defect not found.", 404)

  return NextResponse.json({ defect: data })
}
