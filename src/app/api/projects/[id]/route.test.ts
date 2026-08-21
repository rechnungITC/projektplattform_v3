import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------
//
// Shared queue of "next chain" objects driven per test. Each .from() call
// pulls the next chain from the queue.

const getUserMock = vi.fn()

// Chain factory: returns an object that supports the methods we need.
// The terminal call (.maybeSingle / .single / awaited list) resolves with
// `result`.
type ChainResult = {
  data: unknown
  error: { code?: string; message: string } | null
  /** PROJ-Y-148a: head-only count queries resolve with `count`, not `data`. */
  count?: number | null
}

interface ChainShape {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: ChainResult) => void) => void
}

function makeChain(result: ChainResult): ChainShape {
  const chain = {} as ChainShape
  const passthrough = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "limit",
  ] as const
  for (const m of passthrough) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  // For awaited list queries (after .limit / .order)
  chain.then = (resolve) => resolve(result)
  return chain
}

let chainQueue: ChainShape[] = []

const fromMock = vi.fn(() => {
  const next = chainQueue.shift()
  if (!next) throw new Error("No more chains queued for from()")
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

const adminDeleteChain = makeChain({ data: null, error: null })
const adminFromMock = vi.fn(() => adminDeleteChain)

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: adminFromMock })),
}))

import { GOVERNANCE_HISTORY_ISLANDS } from "@/lib/projects/governance-history"

import { DELETE, GET, PATCH } from "./route"

// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeContext() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

/**
 * PROJ-Y-148a: queues one count chain per governance-history island, in the
 * order `detectGovernanceHistory` walks the registry. Pass a partial map to
 * give an island rows; anything unlisted counts zero.
 *
 * Reading the length off the registry rather than hard-coding 5 keeps this
 * harness honest when a sixth island is added — the frozen list test in
 * `governance-history.test.ts` is where that has to be decided.
 */
function pushGovernanceCounts(
  rows: Partial<Record<string, number | { code?: string; message: string }>> = {}
) {
  // Only the blocking islands are queried, so only they consume a chain —
  // queueing five would leave a stray one for the next `from()` call.
  for (const island of GOVERNANCE_HISTORY_ISLANDS.filter(
    (i) => i.blocksHardDelete
  )) {
    const entry = rows[island.table]
    if (entry !== undefined && typeof entry !== "number") {
      chainQueue.push(makeChain({ data: null, error: entry, count: null }))
    } else {
      chainQueue.push(makeChain({ data: null, error: null, count: entry ?? 0 }))
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  chainQueue = []
})

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

describe("GET /api/projects/[id]", () => {
  it("happy path: returns project + last 20 events", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const project = {
      id: PROJECT_ID,
      tenant_id: TENANT_ID,
      name: "P",
      lifecycle_status: "draft",
    }
    const events = [
      { id: "e1", from_status: "draft", to_status: "active" },
    ]
    chainQueue.push(makeChain({ data: project, error: null })) // projects.select
    chainQueue.push(makeChain({ data: events, error: null })) // events.select

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ project, events })
  })

  it("returns 404 when project missing (RLS hides it)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 400 when id is not a UUID", async () => {
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("falls back to empty events on event query error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({ data: { id: PROJECT_ID, name: "P" }, error: null })
    )
    chainQueue.push(makeChain({ data: null, error: { message: "boom" } }))

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // PROJ-Y-148a — ?hard_delete_check=true pre-flight (AC-Y148a.V1-4)
  // ---------------------------------------------------------------------------

  const CHECK_URL =
    "http://localhost/api/projects/x?hard_delete_check=true"

  function queueProjectLookup() {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, name: "P" },
        error: null,
      })
    )
  }

  it("without the flag the response shape is untouched", async () => {
    queueProjectLookup()
    chainQueue.push(makeChain({ data: [], error: null }))

    const res = await GET(new Request("http://localhost/x"), makeContext())
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(["events", "project"])
    expect("hard_delete_block" in body).toBe(false)
  })

  it("reports the block, naming the history in business terms", async () => {
    queueProjectLookup()
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
    pushGovernanceCounts({ stakeholder_profile_audit_events: 10 })
    chainQueue.push(makeChain({ data: [], error: null })) // lifecycle events

    const res = await GET(new Request(CHECK_URL), makeContext())
    expect(res.status).toBe(200)
    expect((await res.json()).hard_delete_block).toEqual({
      kinds: ["Stakeholder-Profil-Historie"],
      total: 10,
    })
  })

  it("reports null when nothing blocks the delete", async () => {
    queueProjectLookup()
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
    pushGovernanceCounts()
    chainQueue.push(makeChain({ data: [], error: null }))

    const res = await GET(new Request(CHECK_URL), makeContext())
    const body = await res.json()
    expect(body.hard_delete_block).toBeNull()
    expect("hard_delete_block" in body).toBe(true)
  })

  it("is admin-only: it answers a question only admins can act on", async () => {
    queueProjectLookup()
    chainQueue.push(makeChain({ data: { role: "member" }, error: null }))

    const res = await GET(new Request(CHECK_URL), makeContext())
    expect(res.status).toBe(403)
  })

  it("surfaces a failed count as 500 rather than claiming either answer", async () => {
    queueProjectLookup()
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
    pushGovernanceCounts({
      decision_approval_events: { code: "XX000", message: "read broke" },
    })

    const res = await GET(new Request(CHECK_URL), makeContext())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("read_failed")
  })
})

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

describe("PATCH /api/projects/[id]", () => {
  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/projects/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  }

  it("happy path: returns updated project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: PROJECT_ID, name: "Renamed" }
    chainQueue.push(makeChain({ data: updated, error: null }))

    const res = await PATCH(makeRequest({ name: "Renamed" }), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ project: updated })
  })

  it("returns 400 on empty body", async () => {
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
  })

  it("returns 400 when end-date precedes start-date (both provided)", async () => {
    const res = await PATCH(
      makeRequest({
        planned_start_date: "2026-05-01",
        planned_end_date: "2026-04-01",
      }),
      makeContext()
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.field).toBe("planned_end_date")
  })

  it("accepts is_deleted=false to support restore flow", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: PROJECT_ID, is_deleted: false }
    chainQueue.push(makeChain({ data: updated, error: null }))

    const res = await PATCH(makeRequest({ is_deleted: false }), makeContext())
    expect(res.status).toBe(200)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ name: "X" }), makeContext())
    expect(res.status).toBe(401)
  })

  it("maps cross-tenant guard (22023) to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: null,
        error: { code: "22023", message: "responsible_user_id must be a member" },
      })
    )

    const res = await PATCH(
      makeRequest({ responsible_user_id: PROJECT_ID }),
      makeContext()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.field).toBe("responsible_user_id")
  })

  it("returns 404 when project missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await PATCH(makeRequest({ name: "X" }), makeContext())
    expect(res.status).toBe(404)
  })

  it("rejects forbidden fields (lifecycle_status) silently — only listed fields pass through", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: { id: PROJECT_ID }, error: null }))

    // The schema strips unknown fields by default in zod object schemas, but
    // since we use refine(...len > 0), at least one *known* field is required.
    // Sending only `lifecycle_status` (not in schema) should fail validation.
    const res = await PATCH(
      makeRequest({ lifecycle_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })
})

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

describe("DELETE /api/projects/[id]", () => {
  function makeRequest(qs = ""): Request {
    return new Request(`http://localhost/api/projects/x${qs}`, {
      method: "DELETE",
    })
  }

  it("soft delete (default): admin/member flips is_deleted, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup chain
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    // Soft-delete update chain
    chainQueue.push(makeChain({ data: { id: PROJECT_ID }, error: null }))

    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("hard delete: admin path runs, calls service-role client, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: true },
        error: null,
      })
    )
    // requireTenantAdmin pre-check (membership query)
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
    // PROJ-Y-148a governance-history pre-flight: nothing blocking
    pushGovernanceCounts()
    // adminDeleteChain is consumed via createAdminClient mock

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(200)
    expect(adminFromMock).toHaveBeenCalledWith("projects")
    expect(adminDeleteChain.delete).toHaveBeenCalled()
  })

  it("hard delete by member: 403 (admin pre-check rejects)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    // Pre-check: caller is a member (not admin)
    chainQueue.push(makeChain({ data: { role: "member" }, error: null }))

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(403)
    expect(adminDeleteChain.delete).not.toHaveBeenCalled()
  })

  it("hard delete by non-member: 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(403)
  })

  it("returns 404 when project missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid id", async () => {
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // PROJ-Y-148a — append-only governance history refuses the hard delete
  // ---------------------------------------------------------------------------

  function queueAdminHardDelete() {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: true },
        error: null,
      })
    )
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
  }

  it("AC-Y148a.V1-1/V1-2: refuses with 422 + stable code, no table name", async () => {
    queueAdminHardDelete()
    // Live shape of the worst trashed project: 17 profile + 4 decision events.
    pushGovernanceCounts({
      stakeholder_profile_audit_events: 17,
      decision_approval_events: 4,
    })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(422)

    const { error } = await res.json()
    expect(error.code).toBe("governance_history_immutable")
    expect(error.message).toContain("Stakeholder-Profil-Historie")
    expect(error.message).toContain("Genehmigungs-Historie zu Entscheidungen")
    expect(error.message).toContain("21 Einträge")
    // AC-Y148a.V1-2: never the internal name, and never the raw DB sentence.
    for (const island of GOVERNANCE_HISTORY_ISLANDS) {
      expect(error.message).not.toContain(island.table)
    }
    expect(error.message).not.toContain("append-only")

    // AC-Y148a.V1-4: refused *before* touching the row — no probe delete.
    expect(adminDeleteChain.delete).not.toHaveBeenCalled()
  })

  it("AC-Y148a.V1-5: refuses on an island whose guard raises 42501, not 23514", async () => {
    // Three of the five guards raise `42501`. A SQLSTATE-only fix would have
    // left those three answering 500 — the row count does not care.
    queueAdminHardDelete()
    pushGovernanceCounts({ ma_clearance_request_events: 2 })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(422)
    expect((await res.json()).error.message).toContain(
      "Historie der Vertraulichkeits-Freischaltungen"
    )
    expect(adminDeleteChain.delete).not.toHaveBeenCalled()
  })

  it("AC-Y148a.V1-8: no regress — a project without such history is still deleted", async () => {
    queueAdminHardDelete()
    pushGovernanceCounts()

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(200)
    expect(adminDeleteChain.delete).toHaveBeenCalled()
  })

  it("a table missing in this environment does not block the delete", async () => {
    // An island whose table this environment does not have: registered as soon
    // as its guard exists in prod, while a database built from the migration
    // files may lag by one merge (`construction_defect_events` did, until
    // PROJ-45-β landed).
    //
    // Two notes for the record, both measured rather than assumed. Until
    // PROJ-Y-148d the queued `42P01` was dropped entirely: `pushGovernanceCounts`
    // queues a chain only for BLOCKING islands, and `construction_defect_events`
    // was not one. Now it arrives. But that does NOT make this case a guard for
    // the missing-table branch: removing the `MISSING_TABLE_CODES` skip leaves
    // this test green, because a failed pre-flight also lets the delete proceed
    // (see the next case) — both paths end in 200 and the route cannot tell them
    // apart. The real guard is in `governance-history.test.ts`, deliberately
    // driven through a *blocking* island so the tolerance is exercised instead of
    // hidden. What this case still asserts is worth keeping and no more: on the
    // route, an absent table must not block the delete.
    queueAdminHardDelete()
    pushGovernanceCounts({
      construction_defect_events: { code: "42P01", message: "does not exist" },
    })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(200)
    expect(adminDeleteChain.delete).toHaveBeenCalled()
  })

  it("PROJ-Y-148d: refuses for construction defect history too", async () => {
    // The inverse of what this asserted before PROJ-Y-148d. Until then the guard
    // stepped aside whenever the parent defect was gone — which a cascade
    // arranges — so the history went with the project and refusing would have
    // blocked a delete that in fact worked. The guard no longer steps aside, so
    // the pre-flight must refuse, with the kind named.
    queueAdminHardDelete()
    pushGovernanceCounts({ construction_defect_events: 12 })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(422)
    const { error } = await res.json()
    expect(error.code).toBe("governance_history_immutable")
    expect(error.message).toContain("Mängel-Historie")
    expect(adminDeleteChain.delete).not.toHaveBeenCalled()
  })

  it("a failed pre-flight lets the database decide instead of refusing", async () => {
    // Refusing here would block a delete we have no reason to block; the
    // guards are still the enforcement, so nothing can be lost.
    queueAdminHardDelete()
    pushGovernanceCounts({
      decision_approval_events: { code: "XX000", message: "read broke" },
    })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(200)
    expect(adminDeleteChain.delete).toHaveBeenCalled()
  })

  it("AC-Y148a.V1-10: maps a 23514 from the delete itself to 422, not 500", async () => {
    // The race between counting and deleting, and the branch that used to send
    // every failure to 500 while PATCH already treated 23514 as a 422 (F-4).
    queueAdminHardDelete()
    pushGovernanceCounts()
    adminDeleteChain.delete.mockReturnValueOnce({
      eq: () => ({
        error: {
          code: "23514",
          message:
            "stakeholder_profile_audit_events are append-only. UPDATE and DELETE forbidden.",
        },
      }),
    })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(422)
    const { error } = await res.json()
    expect(error.code).toBe("governance_history_immutable")
    expect(error.message).not.toContain("stakeholder_profile_audit_events")
    expect(error.message).not.toContain("append-only")
  })

  it("keeps 500 for a delete failure that is not a guard", async () => {
    queueAdminHardDelete()
    pushGovernanceCounts()
    adminDeleteChain.delete.mockReturnValueOnce({
      eq: () => ({ error: { code: "08006", message: "connection failure" } }),
    })

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("delete_failed")
  })

  it("soft delete does not pay for the governance pre-flight", async () => {
    // The check belongs to the hard path only; the trash flip must not run
    // five extra queries.
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    chainQueue.push(makeChain({ data: { id: PROJECT_ID }, error: null }))

    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    // Two `from()` calls: the lookup and the flip. No island counts.
    expect(fromMock).toHaveBeenCalledTimes(2)
  })
})
