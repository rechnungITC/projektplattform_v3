import { NextResponse } from "next/server"

import { validateExternalUrl } from "@/lib/ma-project/external-link-validation"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import {
  acceptanceDocumentSchema,
  acceptanceRpcErrorStatus,
  idSchema,
} from "../../_schema"

// PROJ-45-γ — den Beleg anhängen oder entfernen.
//
// Der EINZIGE Schreibvorgang, den der Einfrier-Wächter nach dem Ergebnis noch
// durchlässt (D-γ4): das unterschriebene Protokoll kommt naturgemäss NACH der
// Abnahme zurück. Ohne diese Ausnahme wäre AC-45γ.24 unerfüllbar.
//
// Die Adressprüfung ist WIEDERVERWENDET (PROJ-115), nicht nachgebaut — die
// Wiederverwendung liegt dort, wo die Sicherheitslogik sitzt. Es findet
// nirgends ein serverseitiger Abruf statt.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; aid: string }> }
) {
  const { id: projectId, aid } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(aid).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: owned } = await supabase
    .from("construction_acceptances")
    .select("id")
    .eq("id", aid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (!owned) return apiError("not_found", "Abnahme nicht gefunden.", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = acceptanceDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const d = parsed.data

  if (d.url) {
    const check = validateExternalUrl(d.url)
    if (!check.ok) {
      return apiError("invalid_url", check.error ?? "URL ist ungültig.", 422)
    }
  }

  const { data, error } = await supabase.rpc(
    "set_construction_acceptance_document",
    {
      p_acceptance_id: aid,
      p_label: d.label ?? null,
      p_url: d.url ?? null,
      p_document_node_id: d.document_node_id ?? null,
      p_clear: d.clear ?? false,
    }
  )

  if (error) {
    const mapped = acceptanceRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("document_failed", error.message, 500)
  }

  return NextResponse.json({ acceptance: data })
}
