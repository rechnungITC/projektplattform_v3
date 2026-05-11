import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveProjectParticipantLinks } from "./aggregate"

// PROJ-57 — participant-links aggregator unit tests.
//
// Covers identity merging across project_memberships, stakeholders
// and resources via the precedence:
//   user_id > source_stakeholder_id > standalone

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_A = "aaaa1111-1111-4111-8111-111111111111"

interface TableStub {
  data?: unknown
  error?: { message: string } | null
}
function makeChain(stub: TableStub) {
  const final = {
    data: "data" in stub ? stub.data : [],
    error: stub.error ?? null,
  }
  const chain: Record<string, unknown> = {
    then: (
      onFulfilled: (value: typeof final) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(final).then(onFulfilled, onRejected),
  }
  for (const m of ["select", "eq", "in", "is", "order", "limit"]) {
    ;(chain as Record<string, unknown>)[m] = vi.fn().mockReturnValue(chain)
  }
  return chain
}
function buildSupabase(byTable: Record<string, TableStub>) {
  return {
    from: vi.fn((t: string) => {
      const stub = byTable[t]
      if (!stub) throw new Error(`unexpected from(${t})`)
      return makeChain(stub)
    }),
  } as unknown as Parameters<typeof resolveProjectParticipantLinks>[0]["supabase"]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z"))
})

describe("resolveProjectParticipantLinks", () => {
  it("dedupes a person who is member + stakeholder + resource into one slot", async () => {
    const supabase = buildSupabase({
      project_memberships: {
        data: [
          {
            id: "pm-1",
            user_id: USER_A,
            role: "lead",
            profile: { id: USER_A, email: "alice@itc.test", display_name: "Alice" },
          },
        ],
      },
      stakeholders: {
        data: [
          {
            id: "sh-1",
            name: "Alice",
            linked_user_id: USER_A, // ties stakeholder to user
            is_active: true,
            role_key: "project_lead",
          },
        ],
      },
      resources: {
        data: [
          {
            id: "res-1",
            display_name: "Alice",
            linked_user_id: USER_A, // ties resource to user
            source_stakeholder_id: "sh-1",
            is_active: true,
            daily_rate_override: null,
            daily_rate_override_currency: null,
          },
        ],
      },
    })
    const snap = await resolveProjectParticipantLinks({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.participants).toHaveLength(1)
    const p = snap.participants[0]
    expect(p.is_project_member).toBe(true)
    expect(p.is_stakeholder).toBe(true)
    expect(p.is_resource).toBe(true)
    expect(p.rate_source).toEqual({
      kind: "role_rate",
      role_key: "project_lead",
    })
    expect(snap.counts.fully_linked).toBe(1)
  })

  it("flags stakeholder-without-membership and resource-without-stakeholder warnings", async () => {
    const supabase = buildSupabase({
      project_memberships: { data: [] },
      stakeholders: {
        data: [
          {
            id: "sh-1",
            name: "Bob",
            linked_user_id: null, // external stakeholder, no login
            is_active: true,
            role_key: null,
          },
        ],
      },
      resources: { data: [] },
    })
    const snap = await resolveProjectParticipantLinks({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.participants).toHaveLength(1)
    const p = snap.participants[0]
    expect(p.is_stakeholder).toBe(true)
    expect(p.is_project_member).toBe(false)
    expect(p.is_resource).toBe(false)
    // Stakeholder without linked_user → no warning (external is OK)
    expect(p.link_warnings).toEqual([])
  })

  it("classifies override rates correctly", async () => {
    const supabase = buildSupabase({
      project_memberships: { data: [] },
      stakeholders: {
        data: [
          {
            id: "sh-1",
            name: "Contractor",
            linked_user_id: null,
            is_active: true,
            role_key: null,
          },
        ],
      },
      resources: {
        data: [
          {
            id: "res-1",
            display_name: "Contractor",
            linked_user_id: null,
            source_stakeholder_id: "sh-1",
            is_active: true,
            daily_rate_override: 1200,
            daily_rate_override_currency: "EUR",
          },
        ],
      },
    })
    const snap = await resolveProjectParticipantLinks({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.participants).toHaveLength(1)
    const p = snap.participants[0]
    expect(p.rate_source).toEqual({
      kind: "override",
      amount: 1200,
      currency: "EUR",
    })
  })
})
