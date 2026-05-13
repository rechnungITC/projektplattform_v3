import { describe, expect, it } from "vitest"

import { parseOrganizationCsv } from "./csv-parsers"

describe("parseOrganizationCsv", () => {
  it("parses comma CSV with headers and trims values", () => {
    const parsed = parseOrganizationCsv(
      "unit_code,name,type\n ENG , Engineering , department\n",
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          unit_code: "ENG",
          name: "Engineering",
          type: "department",
        },
      },
    ])
  })

  it("auto-detects semicolon CSV from German Excel exports", () => {
    const parsed = parseOrganizationCsv(
      "unit_code;name;type\nENG;Engineering;department\n",
    )

    expect(parsed.meta.delimiter).toBe(";")
    expect(parsed.rows[0].values.unit_code).toBe("ENG")
  })

  it("strips UTF-8 BOM from the first header", () => {
    const parsed = parseOrganizationCsv(
      "\uFEFFunit_code,name,type\nENG,Engineering,department\n",
    )

    expect(Object.keys(parsed.rows[0].values)).toContain("unit_code")
  })
})
