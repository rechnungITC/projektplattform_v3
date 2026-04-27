import { describe, expect, it } from "vitest"

import { GET } from "./route"

describe("GET /api/project-types", () => {
  it("returns project_types and methods catalogs", async () => {
    const res = GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      project_types: { key: string }[]
      methods: { key: string }[]
    }
    expect(body.project_types.map((p) => p.key).sort()).toEqual([
      "construction",
      "erp",
      "general",
      "software",
    ])
    expect(body.methods.map((m) => m.key).sort()).toEqual([
      "kanban",
      "pmi",
      "prince2",
      "safe",
      "scrum",
      "vxt2",
      "waterfall",
    ])
  })

  it("emits a public Cache-Control header", async () => {
    const res = GET()
    expect(res.headers.get("Cache-Control")).toContain("public")
  })
})
