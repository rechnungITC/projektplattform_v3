import type { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import type {
  ExistingLocationForImport,
  ExistingOrganizationUnitForImport,
  OrganizationImport,
  OrganizationImportReport,
  PersonAssignmentCandidate,
} from "@/types/organization-import"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
  type ApiErrorBody,
} from "../_lib/route-helpers"

export const IMPORT_SELECT_COLUMNS =
  "id, tenant_id, layout, dedup_strategy, uploaded_by, uploaded_at, committed_at, committed_by, status, row_count_total, row_count_imported, row_count_skipped, row_count_errored, report, original_filename, created_at, updated_at"

type Supabase = Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]

export interface OrganizationImportContext {
  userId: string
  tenantId: string
  supabase: Supabase
}

export type OrganizationImportContextResult =
  | OrganizationImportContext
  | { error: NextResponse<ApiErrorBody> }

export async function requireOrganizationImportAdmin(
  intent: "read" | "write",
): Promise<OrganizationImportContextResult> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return { error: apiError("unauthorized", "Not signed in.", 401) }
  }

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return { error: apiError("forbidden", "No tenant membership.", 403) }
  }

  const moduleDenial = await requireModuleActive(
    supabase,
    tenantId,
    "organization",
    { intent },
  )
  if (moduleDenial) return { error: moduleDenial as NextResponse<ApiErrorBody> }

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return { error: adminDenial }

  return { userId, tenantId, supabase }
}

export async function readImport(
  supabase: Supabase,
  tenantId: string,
  id: string,
): Promise<
  | { importRow: OrganizationImport }
  | { error: NextResponse<ApiErrorBody> }
> {
  const { data, error } = await supabase
    .from("organization_imports")
    .select(IMPORT_SELECT_COLUMNS)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) return { error: apiError("lookup_failed", error.message, 500) }
  if (!data) return { error: apiError("not_found", "Import not found.", 404) }
  return { importRow: normalizeImport(data) }
}

export async function fetchExistingOrganizationUnits(
  supabase: Supabase,
  tenantId: string,
): Promise<
  | { units: ExistingOrganizationUnitForImport[] }
  | { error: NextResponse<ApiErrorBody> }
> {
  const { data, error } = await supabase
    .from("organization_units")
    .select("id, code, name, type, parent_id, location_id, is_active")
    .eq("tenant_id", tenantId)
    .not("code", "is", null)

  if (error) return { error: apiError("org_units_lookup_failed", error.message, 500) }

  return {
    units: ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => typeof row.code === "string" && row.code.length > 0)
      .map((row) => ({
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        type: row.type as ExistingOrganizationUnitForImport["type"],
        parent_id: nullableString(row.parent_id),
        location_id: nullableString(row.location_id),
        is_active: Boolean(row.is_active),
      })),
  }
}

export async function fetchExistingLocations(
  supabase: Supabase,
  tenantId: string,
): Promise<
  | { locations: ExistingLocationForImport[] }
  | { error: NextResponse<ApiErrorBody> }
> {
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name, is_active")
    .eq("tenant_id", tenantId)
    .not("code", "is", null)

  if (error) return { error: apiError("locations_lookup_failed", error.message, 500) }

  return {
    locations: ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => typeof row.code === "string" && row.code.length > 0)
      .map((row) => ({
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        is_active: Boolean(row.is_active),
      })),
  }
}

export async function fetchPersonAssignmentCandidates(
  supabase: Supabase,
  tenantId: string,
): Promise<
  | { candidates: PersonAssignmentCandidate[] }
  | { error: NextResponse<ApiErrorBody> }
> {
  const [membersRes, resourcesRes, stakeholdersRes] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("id, user_id, organization_unit_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("resources")
      .select("id, linked_user_id, display_name, organization_unit_id")
      .eq("tenant_id", tenantId)
      .not("linked_user_id", "is", null),
    supabase
      .from("stakeholders")
      .select("id, name, contact_email, linked_user_id, organization_unit_id")
      .eq("tenant_id", tenantId),
  ])

  if (membersRes.error) {
    return { error: apiError("members_lookup_failed", membersRes.error.message, 500) }
  }
  if (resourcesRes.error) {
    return { error: apiError("resources_lookup_failed", resourcesRes.error.message, 500) }
  }
  if (stakeholdersRes.error) {
    return {
      error: apiError("stakeholders_lookup_failed", stakeholdersRes.error.message, 500),
    }
  }

  const userIds = new Set<string>()
  for (const row of membersRes.data ?? []) userIds.add(String(row.user_id))
  for (const row of resourcesRes.data ?? []) {
    if (row.linked_user_id) userIds.add(String(row.linked_user_id))
  }
  for (const row of stakeholdersRes.data ?? []) {
    if (row.linked_user_id) userIds.add(String(row.linked_user_id))
  }

  const profileById = new Map<
    string,
    { email: string | null; display_name: string | null }
  >()
  if (userIds.size > 0) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .in("id", Array.from(userIds))
    if (error) {
      return { error: apiError("profiles_lookup_failed", error.message, 500) }
    }
    for (const profile of profiles ?? []) {
      profileById.set(String(profile.id), {
        email: nullableString(profile.email),
        display_name: nullableString(profile.display_name),
      })
    }
  }

  const candidates: PersonAssignmentCandidate[] = []
  for (const row of membersRes.data ?? []) {
    const profile = profileById.get(String(row.user_id))
    if (!profile?.email) continue
    candidates.push({
      kind: "tenant_member",
      id: String(row.id),
      email: profile.email,
      current_organization_unit_id: nullableString(row.organization_unit_id),
      display_name: profile.display_name,
    })
  }
  for (const row of resourcesRes.data ?? []) {
    const profile = row.linked_user_id
      ? profileById.get(String(row.linked_user_id))
      : null
    if (!profile?.email) continue
    candidates.push({
      kind: "resource",
      id: String(row.id),
      email: profile.email,
      current_organization_unit_id: nullableString(row.organization_unit_id),
      display_name: nullableString(row.display_name) ?? profile.display_name,
    })
  }
  for (const row of stakeholdersRes.data ?? []) {
    const profile = row.linked_user_id
      ? profileById.get(String(row.linked_user_id))
      : null
    const email = profile?.email ?? nullableString(row.contact_email)
    if (!email) continue
    candidates.push({
      kind: "stakeholder",
      id: String(row.id),
      email,
      current_organization_unit_id: nullableString(row.organization_unit_id),
      display_name: nullableString(row.name) ?? profile?.display_name ?? null,
    })
  }

  return { candidates }
}

export function normalizeImport(row: unknown): OrganizationImport {
  const raw = row as Record<string, unknown>
  return {
    id: String(raw.id),
    tenant_id: String(raw.tenant_id),
    layout: raw.layout as OrganizationImport["layout"],
    dedup_strategy: raw.dedup_strategy as OrganizationImport["dedup_strategy"],
    uploaded_by: String(raw.uploaded_by),
    uploaded_at: String(raw.uploaded_at),
    committed_at: nullableString(raw.committed_at),
    committed_by: nullableString(raw.committed_by),
    status: raw.status as OrganizationImport["status"],
    row_count_total: Number(raw.row_count_total ?? 0),
    row_count_imported: Number(raw.row_count_imported ?? 0),
    row_count_skipped: Number(raw.row_count_skipped ?? 0),
    row_count_errored: Number(raw.row_count_errored ?? 0),
    report: raw.report as OrganizationImportReport,
    original_filename: String(raw.original_filename),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
