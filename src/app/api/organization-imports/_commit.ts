import { NextResponse } from "next/server"

import {
  normalizeCode,
} from "@/lib/organization/import-validators"
import type {
  OrganizationImport,
  OrganizationImportDedupStrategy,
  OrganizationImportReport,
  OrganizationImportReportRow,
} from "@/types/organization-import"

import { apiError, type ApiErrorBody } from "../_lib/route-helpers"
import {
  fetchExistingLocations,
  fetchExistingOrganizationUnits,
  type OrganizationImportContext,
} from "./_helpers"

type CommitResult = NextResponse | NextResponse<ApiErrorBody>

interface CommitOptions {
  importRow: OrganizationImport
  ctx: OrganizationImportContext
  dedupStrategy: OrganizationImportDedupStrategy
}

interface CommitCounts {
  imported: number
  skipped: number
}

export async function commitOrganizationImport({
  importRow,
  ctx,
  dedupStrategy,
}: CommitOptions): Promise<CommitResult> {
  if (importRow.status !== "preview") {
    return apiError("invalid_status", "Only preview imports can be committed.", 409)
  }

  const report = importRow.report
  const errored = report.rows.filter((row) => row.errors.length > 0)
  if (errored.length > 0) {
    return apiError(
      "validation_errors",
      "Import preview still contains errored rows.",
      409,
    )
  }

  if (report.layout === "orgchart_hierarchy") {
    return commitOrgChart({ importRow, ctx, dedupStrategy })
  }
  return commitPersonAssignments({ importRow, ctx })
}

export async function rollbackOrganizationImport(
  importRow: OrganizationImport,
  ctx: OrganizationImportContext,
): Promise<CommitResult> {
  if (importRow.status !== "committed" || !importRow.committed_at) {
    return apiError("invalid_status", "Only committed imports can be rolled back.", 409)
  }

  const { data: units, error: unitsError } = await ctx.supabase
    .from("organization_units")
    .select("id, parent_id, name, created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("import_id", importRow.id)
    .gte("created_at", importRow.committed_at)

  if (unitsError) return apiError("rollback_lookup_failed", unitsError.message, 500)

  const unitIds = new Set((units ?? []).map((row) => String(row.id)))
  const sortedUnitIds = sortUnitsForDelete(
    ((units ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
    })),
  )

  let deletedUnits = 0
  for (const unitId of sortedUnitIds) {
    const { error } = await ctx.supabase
      .from("organization_units")
      .delete()
      .eq("id", unitId)
      .eq("tenant_id", ctx.tenantId)
    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "rollback_blocked",
            message:
              "Rollback is blocked by organization units created or edited after this import.",
          },
          blockers: [{ kind: "organization_units", count: unitIds.size }],
        },
        { status: 409 },
      )
    }
    deletedUnits += 1
  }

  const { data: locations } = await ctx.supabase
    .from("locations")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("import_id", importRow.id)
    .gte("created_at", importRow.committed_at)

  const locationIds = (locations ?? []).map((row) => String(row.id))
  if (locationIds.length > 0) {
    const { error } = await ctx.supabase
      .from("locations")
      .delete()
      .in("id", locationIds)
      .eq("tenant_id", ctx.tenantId)
    if (error) return apiError("rollback_failed", error.message, 500)
  }

  const { error: updateError } = await ctx.supabase
    .from("organization_imports")
    .update({ status: "rolled_back" })
    .eq("id", importRow.id)
    .eq("tenant_id", ctx.tenantId)

  if (updateError) return apiError("rollback_failed", updateError.message, 500)

  return NextResponse.json({
    import_id: importRow.id,
    row_count_rolled_back: deletedUnits + locationIds.length,
  })
}

async function commitOrgChart({
  importRow,
  ctx,
  dedupStrategy,
}: CommitOptions): Promise<CommitResult> {
  const existingUnits = await fetchExistingOrganizationUnits(
    ctx.supabase,
    ctx.tenantId,
  )
  if ("error" in existingUnits) return existingUnits.error
  const existingLocations = await fetchExistingLocations(
    ctx.supabase,
    ctx.tenantId,
  )
  if ("error" in existingLocations) return existingLocations.error

  const unitIdByCode = new Map(
    existingUnits.units.map((unit) => [normalizeCode(unit.code), unit.id]),
  )
  const locationIdByCode = new Map(
    existingLocations.locations.map((location) => [
      normalizeCode(location.code),
      location.id,
    ]),
  )

  const nextReport = cloneReport(importRow.report)
  const counts: CommitCounts = { imported: 0, skipped: 0 }

  for (const row of nextReport.rows.filter((item) => item.entity === "location")) {
    const code = normalizeCode(row.values.location_code)
    if (!code) continue
    const existingId = locationIdByCode.get(code)
    const action = resolveAction(existingId, dedupStrategy)
    if (action === "fail") {
      return apiError("duplicate_code", `Location code ${code} already exists.`, 409)
    }
    if (action === "skip") {
      row.status = "skipped"
      counts.skipped += 1
      continue
    }

    const payload = {
      tenant_id: ctx.tenantId,
      code,
      name: stringValue(row.values.name),
      country: nullableValue(row.values.country),
      city: nullableValue(row.values.city),
      address: nullableValue(row.values.address),
      is_active: boolValue(row.values.is_active, true),
      import_id: importRow.id,
    }

    if (existingId) {
      const { data, error } = await ctx.supabase
        .from("locations")
        .update(payload)
        .eq("id", existingId)
        .eq("tenant_id", ctx.tenantId)
        .select("id")
        .single()
      if (error) return apiError("location_update_failed", error.message, 500)
      locationIdByCode.set(code, String(data.id))
      row.status = "updated"
    } else {
      const { data, error } = await ctx.supabase
        .from("locations")
        .insert(payload)
        .select("id")
        .single()
      if (error) return apiError("location_insert_failed", error.message, 500)
      locationIdByCode.set(code, String(data.id))
      row.status = "imported"
    }
    counts.imported += 1
  }

  const unitRows = sortUnitRowsForCommit(
    nextReport.rows.filter((item) => item.entity === "organization_unit"),
  )
  for (const row of unitRows) {
    const code = normalizeCode(row.values.unit_code)
    if (!code) continue
    const existingId = unitIdByCode.get(code)
    const action = resolveAction(existingId, dedupStrategy)
    if (action === "fail") {
      return apiError("duplicate_code", `Organization unit code ${code} exists.`, 409)
    }
    if (action === "skip") {
      row.status = "skipped"
      counts.skipped += 1
      continue
    }

    const parentCode = normalizeCode(row.values.parent_code)
    const locationCode = normalizeCode(row.values.location_code)
    const payload = {
      tenant_id: ctx.tenantId,
      code,
      name: stringValue(row.values.name),
      type: stringValue(row.values.type),
      parent_id: parentCode ? unitIdByCode.get(parentCode) ?? null : null,
      location_id: locationCode
        ? locationIdByCode.get(locationCode) ?? null
        : null,
      description: nullableValue(row.values.description),
      is_active: boolValue(row.values.is_active, true),
      sort_order: numberValue(row.values.sort_order),
      import_id: importRow.id,
    }

    if (existingId) {
      const { data, error } = await ctx.supabase
        .from("organization_units")
        .update(payload)
        .eq("id", existingId)
        .eq("tenant_id", ctx.tenantId)
        .select("id")
        .single()
      if (error) return apiError("unit_update_failed", error.message, 500)
      unitIdByCode.set(code, String(data.id))
      row.status = "updated"
    } else {
      const { data, error } = await ctx.supabase
        .from("organization_units")
        .insert(payload)
        .select("id")
        .single()
      if (error) return apiError("unit_insert_failed", error.message, 500)
      unitIdByCode.set(code, String(data.id))
      row.status = "imported"
    }
    counts.imported += 1
  }

  return finalizeCommit(importRow, ctx, nextReport, counts)
}

async function commitPersonAssignments({
  importRow,
  ctx,
}: {
  importRow: OrganizationImport
  ctx: OrganizationImportContext
}): Promise<CommitResult> {
  const nextReport = cloneReport(importRow.report)
  const counts: CommitCounts = { imported: 0, skipped: 0 }

  for (const row of nextReport.rows) {
    const targetId = stringValue(row.values.target_id)
    const unitId = stringValue(row.values.organization_unit_id)
    const kind = stringValue(row.values.entity_kind)
    if (!targetId || !unitId || !kind) {
      row.status = "skipped"
      counts.skipped += 1
      continue
    }

    const table =
      kind === "tenant_member"
        ? "tenant_memberships"
        : kind === "resource"
          ? "resources"
          : "stakeholders"

    const { error } = await ctx.supabase
      .from(table)
      .update({ organization_unit_id: unitId })
      .eq("id", targetId)
      .eq("tenant_id", ctx.tenantId)

    if (error) return apiError("assignment_failed", error.message, 500)
    row.status = "updated"
    counts.imported += 1
  }

  return finalizeCommit(importRow, ctx, nextReport, counts)
}

async function finalizeCommit(
  importRow: OrganizationImport,
  ctx: OrganizationImportContext,
  report: OrganizationImportReport,
  counts: CommitCounts,
): Promise<CommitResult> {
  const { error } = await ctx.supabase
    .from("organization_imports")
    .update({
      status: "committed",
      committed_at: new Date().toISOString(),
      committed_by: ctx.userId,
      row_count_imported: counts.imported,
      row_count_skipped: counts.skipped,
      row_count_errored: 0,
      dedup_strategy: report.dedup_strategy,
      report,
    })
    .eq("id", importRow.id)
    .eq("tenant_id", ctx.tenantId)

  if (error) return apiError("commit_finalize_failed", error.message, 500)

  console.info("[PROJ-63] import committed", {
    import_id: importRow.id,
    tenant_id: ctx.tenantId,
    layout: importRow.layout,
    row_counts: {
      imported: counts.imported,
      skipped: counts.skipped,
      errored: 0,
    },
  })

  return NextResponse.json({
    import_id: importRow.id,
    row_count_imported: counts.imported,
    row_count_skipped: counts.skipped,
    errors: [],
  })
}

function sortUnitRowsForCommit(
  rows: OrganizationImportReportRow[],
): OrganizationImportReportRow[] {
  const byCode = new Map(rows.map((row) => [normalizeCode(row.values.unit_code), row]))
  const result: OrganizationImportReportRow[] = []
  const seen = new Set<string>()

  const visit = (row: OrganizationImportReportRow) => {
    const code = normalizeCode(row.values.unit_code)
    if (!code || seen.has(code)) return
    const parent = normalizeCode(row.values.parent_code)
    const parentRow = parent ? byCode.get(parent) : null
    if (parentRow) visit(parentRow)
    seen.add(code)
    result.push(row)
  }

  for (const row of rows) visit(row)
  return result
}

function sortUnitsForDelete(rows: Array<{ id: string; parent_id: string | null }>) {
  const childCount = new Map<string, number>()
  for (const row of rows) {
    if (!row.parent_id) continue
    childCount.set(row.parent_id, (childCount.get(row.parent_id) ?? 0) + 1)
  }
  return rows
    .slice()
    .sort((a, b) => (childCount.get(b.id) ?? 0) - (childCount.get(a.id) ?? 0))
    .map((row) => row.id)
}

function resolveAction(
  existingId: string | undefined,
  strategy: OrganizationImportDedupStrategy,
): "create" | "update" | "skip" | "fail" {
  if (!existingId) return "create"
  if (strategy === "fail") return "fail"
  if (strategy === "update") return "update"
  return "skip"
}

function cloneReport(report: OrganizationImportReport): OrganizationImportReport {
  return {
    ...report,
    rows: report.rows.map((row) => ({
      ...row,
      errors: [...row.errors],
      warnings: [...row.warnings],
      original: { ...row.original },
      values: { ...row.values },
    })),
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

function nullableValue(value: unknown): string | null {
  const stringified = stringValue(value).trim()
  return stringified || null
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
