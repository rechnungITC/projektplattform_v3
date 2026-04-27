import { describe, expect, it } from "vitest"

import { GET } from "./route"

function makeReq(type: string, method?: string) {
  const qs = method ? `?method=${method}` : ""
  return new Request(`http://localhost/api/project-types/${type}/rules${qs}`)
}

function makeContext(type: string) {
  return { params: Promise.resolve({ type }) }
}

describe("GET /api/project-types/[type]/rules", () => {
  it("happy path: returns rules for (erp, scrum)", async () => {
    const res = await GET(makeReq("erp", "scrum"), makeContext("erp"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      type: string
      method: string | null
      rules: {
        active_modules: string[]
        starter_kinds: string[]
        suggested_roles: { key: string }[]
      }
    }
    expect(body.type).toBe("erp")
    expect(body.method).toBe("scrum")
    expect(body.rules.starter_kinds).toContain("epic")
    expect(body.rules.suggested_roles.map((r) => r.key)).toContain("dpo")
  })

  it("starter_kinds is empty when method param is omitted", async () => {
    const res = await GET(makeReq("erp"), makeContext("erp"))
    const body = (await res.json()) as {
      method: string | null
      rules: { starter_kinds: string[] }
    }
    expect(body.method).toBeNull()
    expect(body.rules.starter_kinds).toEqual([])
  })

  it("400 on unknown type", async () => {
    const res = await GET(makeReq("doesnotexist"), makeContext("doesnotexist"))
    expect(res.status).toBe(400)
  })

  it("400 on unknown method", async () => {
    const res = await GET(makeReq("erp", "agile_chaos"), makeContext("erp"))
    expect(res.status).toBe(400)
  })
})
