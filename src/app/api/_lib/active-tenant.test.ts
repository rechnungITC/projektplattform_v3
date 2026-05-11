import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveActiveTenantId } from "./active-tenant"

// PROJ-55-α regression tests for the cookie-aware tenant resolver.
//
// Verifies AC-1..AC-3 from features/PROJ-55-…md:
//   - Cookie wins when valid.
//   - Cookie ignored when it points at a tenant the user is NOT a
//     member of (no silent privilege grant); fallback to first
//     membership kicks in instead.
//   - Single-membership users still get an unambiguous fallback.
//   - No-membership users get null.

const USER_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

const cookieValue = vi.hoisted(() => ({ current: null as string | null }))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "active_tenant_id" && cookieValue.current
        ? { value: cookieValue.current }
        : undefined,
  })),
}))

/**
 * Two-step Supabase stub:
 *   - cookie path  → `.maybeSingle()` returns the row matching
 *                    BOTH user_id and tenant_id (the cookie value).
 *   - fallback path → `.order().limit().maybeSingle()` returns the
 *                    earliest membership row.
 *
 * We track separate `.eq` chains so the cookie-validation call can
 * be distinguished from the order-by-fallback call.
 */
function makeSupabaseStub(args: {
  /** All tenant_ids the user is a member of. Order matches DB. */
  memberships: string[]
}) {
  const memberships = args.memberships
  return {
    from: vi.fn(() => {
      let pendingCookieTenantId: string | null = null
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(function (col: string, value: string) {
          if (col === "tenant_id") {
            pendingCookieTenantId = value
          }
          return chain
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => {
          if (pendingCookieTenantId) {
            const exists = memberships.includes(pendingCookieTenantId)
            return {
              data: exists ? { tenant_id: pendingCookieTenantId } : null,
              error: null,
            }
          }
          if (memberships.length === 0) return { data: null, error: null }
          return { data: { tenant_id: memberships[0] }, error: null }
        }),
      }
      return chain
    }),
  } as unknown as Parameters<typeof resolveActiveTenantId>[1]
}

beforeEach(() => {
  cookieValue.current = null
})
afterEach(() => {
  cookieValue.current = null
})

describe("resolveActiveTenantId (PROJ-55-α)", () => {
  it("returns null when the user has no memberships at all", async () => {
    const supabase = makeSupabaseStub({ memberships: [] })
    const tenantId = await resolveActiveTenantId(USER_ID, supabase)
    expect(tenantId).toBeNull()
  })

  it("returns the single membership when there is no cookie", async () => {
    const supabase = makeSupabaseStub({ memberships: [TENANT_A] })
    const tenantId = await resolveActiveTenantId(USER_ID, supabase)
    expect(tenantId).toBe(TENANT_A)
  })

  it("falls back to the earliest membership when there is no cookie (multi-tenant)", async () => {
    // TENANT_A is "earliest" per the stub's array order.
    const supabase = makeSupabaseStub({ memberships: [TENANT_A, TENANT_B] })
    const tenantId = await resolveActiveTenantId(USER_ID, supabase)
    expect(tenantId).toBe(TENANT_A)
  })

  it("honours a valid active_tenant_id cookie even when it is not the earliest", async () => {
    cookieValue.current = TENANT_B
    const supabase = makeSupabaseStub({ memberships: [TENANT_A, TENANT_B] })
    const tenantId = await resolveActiveTenantId(USER_ID, supabase)
    expect(tenantId).toBe(TENANT_B)
  })

  it("falls back to the earliest membership when the cookie points at a tenant the user is NOT a member of", async () => {
    cookieValue.current = "00000000-0000-4000-8000-000000000000"
    const supabase = makeSupabaseStub({ memberships: [TENANT_A, TENANT_B] })
    const tenantId = await resolveActiveTenantId(USER_ID, supabase)
    // Tampered cookie must NOT grant access to a non-member
    // tenant. The resolver falls back to the legitimate
    // earliest-membership tenant.
    expect(tenantId).toBe(TENANT_A)
  })
})
