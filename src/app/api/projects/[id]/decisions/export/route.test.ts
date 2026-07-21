import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function thenable(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit", "not", "is"]) {
    c[m] = vi.fn(() => c)
  }
  ;(c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(result)
  return c
}

interface Fixtures {
  decisions: { data: unknown; error: unknown }
  hidden: { data: unknown; error: unknown }
  gates: { data: unknown; error: unknown }
}

function supa(fx: Fixtures) {
  return {
    from: vi.fn((table: string) =>
      table === "decisions" ? thenable(fx.decisions) : thenable(fx.gates)
    ),
    rpc: vi.fn(async () => fx.hidden),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET .../decisions/export (CSV)", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({
        decisions: { data: [], error: null },
        hidden: { data: [], error: null },
        gates: { data: [], error: null },
      }),
    })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("filters hidden gate decisions + labels visible gate provenance", async () => {
    const manual = {
      id: "d-manual",
      title: "Manuelle Entscheidung",
      decision_text: "x",
      rationale: null,
      decided_at: "2026-07-01T00:00:00Z",
      context_phase_id: null,
      context_risk_id: null,
      context_finding_id: null,
      decision_body: null,
      options: null,
      is_revised: false,
      created_by: ME,
      created_at: "2026-07-01T00:00:00Z",
    }
    const gate = { ...manual, id: "d-gate", title: "Gate-Entscheidung" }
    const hiddenGate = { ...manual, id: "d-hidden", title: "Vertraulich" }

    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        decisions: { data: [manual, gate, hiddenGate], error: null },
        hidden: { data: ["d-hidden"], error: null },
        gates: { data: [{ decision_id: "d-gate", sequence_number: 5 }], error: null },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })

    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    const body = await res.text()
    // hidden gate decision must not appear
    expect(body).not.toContain("Vertraulich")
    // manual + visible gate decision appear, gate one labelled with sequence
    expect(body).toContain("Manuelle Entscheidung")
    expect(body).toContain("Gate-Entscheidung")
    expect(body).toContain("Stage-Gate 5")
    expect(body).toContain("manuell")
  })

  it("500 when hidden-ids RPC errors", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        decisions: { data: [], error: null },
        hidden: { data: null, error: { message: "rpc boom" } },
        gates: { data: [], error: null },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(500)
  })
})
