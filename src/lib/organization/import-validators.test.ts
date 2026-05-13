import { describe, expect, it } from "vitest"

import type { ExistingOrganizationUnitForImport } from "@/types/organization-import"

import {
  validateOrgChartImport,
  validatePersonAssignmentImport,
} from "./import-validators"

const existingUnit: ExistingOrganizationUnitForImport = {
  id: "unit-existing",
  code: "ROOT",
  name: "Root",
  type: "company",
  parent_id: null,
  location_id: null,
  is_active: true,
}

describe("validateOrgChartImport", () => {
  it("allows forward parent references and marks all rows valid", () => {
    const report = validateOrgChartImport({
      unitRows: [
        {
          rowNumber: 2,
          values: {
            unit_code: "TEAM-A",
            parent_code: "DEPT-A",
            name: "Team A",
            type: "team",
          },
        },
        {
          rowNumber: 3,
          values: {
            unit_code: "DEPT-A",
            parent_code: "ROOT",
            name: "Department A",
            type: "department",
          },
        },
      ],
      existingUnits: [existingUnit],
      existingLocations: [],
      dedupStrategy: "skip",
    })

    expect(report.summary.errored).toBe(0)
    expect(report.rows.map((row) => row.status)).toEqual(["valid", "valid"])
  })

  it("blocks cycles and duplicate codes inside the CSV", () => {
    const report = validateOrgChartImport({
      unitRows: [
        {
          rowNumber: 2,
          values: {
            unit_code: "A",
            parent_code: "B",
            name: "A",
            type: "team",
          },
        },
        {
          rowNumber: 3,
          values: {
            unit_code: "B",
            parent_code: "A",
            name: "B",
            type: "team",
          },
        },
        {
          rowNumber: 4,
          values: {
            unit_code: "A",
            name: "Duplicate",
            type: "team",
          },
        },
      ],
      existingUnits: [],
      existingLocations: [],
      dedupStrategy: "skip",
    })

    expect(report.summary.errored).toBe(3)
    expect(report.rows[0].errors.map((issue) => issue.code)).toContain(
      "cycle_detected",
    )
    expect(report.rows[2].errors.map((issue) => issue.code)).toContain(
      "duplicate_in_file",
    )
  })

  it("treats existing codes according to the dedup strategy", () => {
    const report = validateOrgChartImport({
      unitRows: [
        {
          rowNumber: 2,
          values: {
            unit_code: "ROOT",
            name: "Root renamed",
            type: "company",
          },
        },
      ],
      existingUnits: [existingUnit],
      existingLocations: [],
      dedupStrategy: "update",
    })

    expect(report.summary.errored).toBe(0)
    expect(report.rows[0].status).toBe("duplicate")
    expect(report.rows[0].action).toBe("update")
  })
})

describe("validatePersonAssignmentImport", () => {
  it("selects tenant member first and warns on ambiguous person matches", () => {
    const report = validatePersonAssignmentImport({
      rows: [
        {
          rowNumber: 2,
          values: {
            email: "Ada@example.test",
            org_unit_code: "ROOT",
          },
        },
      ],
      existingUnits: [existingUnit],
      candidates: [
        {
          kind: "resource",
          id: "resource-1",
          email: "ada@example.test",
          current_organization_unit_id: null,
          display_name: "Ada Resource",
        },
        {
          kind: "tenant_member",
          id: "member-1",
          email: "ada@example.test",
          current_organization_unit_id: null,
          display_name: "Ada Member",
        },
      ],
      dedupStrategy: "skip",
    })

    expect(report.summary.errored).toBe(0)
    expect(report.rows[0].values.entity_kind).toBe("tenant_member")
    expect(report.rows[0].values.target_id).toBe("member-1")
    expect(report.rows[0].warnings.map((issue) => issue.code)).toContain(
      "ambiguous_person_match",
    )
  })

  it("errors when the email cannot be matched", () => {
    const report = validatePersonAssignmentImport({
      rows: [
        {
          rowNumber: 2,
          values: {
            email: "missing@example.test",
            org_unit_code: "ROOT",
          },
        },
      ],
      existingUnits: [existingUnit],
      candidates: [],
      dedupStrategy: "skip",
    })

    expect(report.summary.errored).toBe(1)
    expect(report.rows[0].errors.map((issue) => issue.code)).toContain(
      "person_not_found",
    )
  })
})
