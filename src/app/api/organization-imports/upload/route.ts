import { NextResponse } from "next/server"

import {
  assertCsvRowLimit,
  assertCsvSize,
  parseOrganizationCsv,
  type ParsedCsvRow,
} from "@/lib/organization/csv-parsers"
import {
  validateOrgChartImport,
  validatePersonAssignmentImport,
} from "@/lib/organization/import-validators"
import type {
  OrganizationImportDedupStrategy,
  OrganizationImportLayout,
} from "@/types/organization-import"

import { apiError } from "../../_lib/route-helpers"
import {
  fetchExistingLocations,
  fetchExistingOrganizationUnits,
  fetchPersonAssignmentCandidates,
  requireOrganizationImportAdmin,
} from "../_helpers"

const LAYOUTS = new Set<OrganizationImportLayout>([
  "orgchart_hierarchy",
  "person_assignment",
])
const DEDUP_STRATEGIES = new Set<OrganizationImportDedupStrategy>([
  "skip",
  "update",
  "fail",
])

export async function POST(request: Request) {
  const ctx = await requireOrganizationImportAdmin("write")
  if ("error" in ctx) return ctx.error

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiError("validation_error", "Invalid multipart form body.", 400)
  }

  const layout = String(form.get("layout") ?? "") as OrganizationImportLayout
  if (!LAYOUTS.has(layout)) {
    return apiError("validation_error", "Invalid import layout.", 400, "layout")
  }

  const dedupStrategy = String(
    form.get("dedup_strategy") ?? "skip",
  ) as OrganizationImportDedupStrategy
  if (!DEDUP_STRATEGIES.has(dedupStrategy)) {
    return apiError(
      "validation_error",
      "Invalid deduplication strategy.",
      400,
      "dedup_strategy",
    )
  }

  const csvFile = form.get("file")
  if (!(csvFile instanceof File)) {
    return apiError("validation_error", "CSV file is required.", 400, "file")
  }
  const sizeError = assertCsvSize(csvFile)
  if (sizeError) return apiError("payload_too_large", sizeError, 413, "file")

  const parsed = parseOrganizationCsv(await csvFile.text())
  if (parsed.errors.length > 0) {
    return apiError("csv_parse_failed", parsed.errors[0] ?? "CSV parse failed.", 400)
  }
  const rowLimitError = assertCsvRowLimit(parsed.rows)
  if (rowLimitError) return apiError("payload_too_large", rowLimitError, 413, "file")

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

  let report
  if (layout === "orgchart_hierarchy") {
    const includeLocations = String(form.get("include_locations") ?? "false") === "true"
    const locationFile = form.get("locations_csv")
    let locationRows: ParsedCsvRow[] = []
    if (includeLocations) {
      if (!(locationFile instanceof File)) {
        return apiError(
          "validation_error",
          "locations_csv file is required when include_locations is true.",
          400,
          "locations_csv",
        )
      }
      const locationSizeError = assertCsvSize(locationFile)
      if (locationSizeError) {
        return apiError("payload_too_large", locationSizeError, 413, "locations_csv")
      }
      const parsedLocations = parseOrganizationCsv(await locationFile.text())
      if (parsedLocations.errors.length > 0) {
        return apiError(
          "csv_parse_failed",
          parsedLocations.errors[0] ?? "Locations CSV parse failed.",
          400,
        )
      }
      const locationLimitError = assertCsvRowLimit(parsedLocations.rows)
      if (locationLimitError) {
        return apiError("payload_too_large", locationLimitError, 413, "locations_csv")
      }
      locationRows = parsedLocations.rows
    }

    report = validateOrgChartImport({
      unitRows: parsed.rows,
      locationRows,
      existingUnits: existingUnits.units,
      existingLocations: existingLocations.locations,
      dedupStrategy,
    })
  } else {
    const candidates = await fetchPersonAssignmentCandidates(
      ctx.supabase,
      ctx.tenantId,
    )
    if ("error" in candidates) return candidates.error
    report = validatePersonAssignmentImport({
      rows: parsed.rows,
      existingUnits: existingUnits.units,
      candidates: candidates.candidates,
      dedupStrategy,
    })
  }

  const { data, error } = await ctx.supabase
    .from("organization_imports")
    .insert({
      tenant_id: ctx.tenantId,
      layout,
      dedup_strategy: dedupStrategy,
      uploaded_by: ctx.userId,
      status: "preview",
      row_count_total: report.summary.total,
      row_count_errored: report.summary.errored,
      report,
      original_filename: csvFile.name || "organization-import.csv",
    })
    .select("id")
    .single()

  if (error) return apiError("create_failed", error.message, 500)

  return NextResponse.json(
    {
      import_id: data.id,
      row_count_total: report.summary.total,
      row_count_errored: report.summary.errored,
      preview_url: `/stammdaten/organisation/import?import_id=${data.id}`,
    },
    { status: 201 },
  )
}
