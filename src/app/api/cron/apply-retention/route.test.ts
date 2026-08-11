/**
 * PROJ-130-α — the retention cron must no longer delete audit entries.
 *
 * The point of this suite is the third test: it asserts the route never even
 * constructs a database client. Until PROJ-130-α this route ran a nightly
 * `delete from audit_log_entries` with the service-role key, which made the
 * platform's "not deletable" promise false. If anyone re-introduces a purge
 * here, `createAdminClient` gets called and this suite goes red — the DB-side
 * `audit_log_no_delete` guard trigger is the second, independent barrier.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createAdminClient = vi.fn(() => {
  throw new Error(
    "PROJ-130-α: the retention cron must not touch the database at all"
  )
})

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }))

import { GET } from "./route"

const ORIGINAL = process.env.CRON_SECRET

function makeGet(auth?: string): Request {
  return new Request("http://localhost/api/cron/apply-retention", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "secret-xyz"
})
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL
})

describe("GET /api/cron/apply-retention", () => {
  it("500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeGet("Bearer secret-xyz"))
    expect(res.status).toBe(500)
  })

  it("401 on missing or wrong cron secret", async () => {
    expect((await GET(makeGet())).status).toBe(401)
    expect((await GET(makeGet("Bearer nope"))).status).toBe(401)
  })

  it("reports the purge as disabled and purges nothing", async () => {
    const res = await GET(makeGet("Bearer secret-xyz"))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.audit_purge).toBe("disabled")
    expect(body.total_purged).toBe(0)
    expect(body.tenants).toEqual([])
    expect(body.reason).toMatch(/append-only/i)
  })

  it("never constructs a database client (no purge path exists)", async () => {
    const res = await GET(makeGet("Bearer secret-xyz"))
    expect(res.status).toBe(200)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
