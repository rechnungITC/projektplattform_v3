/**
 * PROJ-54-α — `resolveResourceRates` lookup-layer tests.
 *
 * Five isolated scenarios per AC-20 of the PROJ-54 spec:
 *
 *   T1 — Override gesetzt → ResolvedRate.source='override'
 *   T2 — Kein Override + Rolle aktiv → ResolvedRate.source='role'
 *   T3 — Override und Rolle gleichzeitig → Override gewinnt (server-side)
 *   T4 — Weder Override noch Rolle → key lands in missing[]
 *   T5 — RPC-Fehler → key lands in missing[] (fail-open, no throw)
 *
 * Plus shape-protection tests:
 *   - Empty key list short-circuits without RPC calls
 *   - Duplicate keys are deduplicated
 *   - The lookup layer always populates `resource_id` on the returned
 *     ResolvedRate, even when the SQL helper returned NULL for a role
 *     resolution.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveResourceRates } from "./resource-rate-lookup"
import type { ResourceRateLookupKey } from "./types"

import type { SupabaseClient } from "@supabase/supabase-js"

interface RpcCall {
  fn: string
  args: {
    p_tenant_id: string
    p_resource_id: string
    p_as_of_date: string
  }
}

interface RpcStubResponse {
  data: unknown
  error: { message: string } | null
}

function makeMockClient(
  responder: (call: RpcCall) => RpcStubResponse | Promise<RpcStubResponse>,
) {
  const calls: RpcCall[] = []
  const rpc = vi.fn(async (fn: string, args: RpcCall["args"]) => {
    const call = { fn, args }
    calls.push(call)
    return await responder(call)
  })
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
    calls,
  }
}

const TNT = "tnt-1"
const RES_A = "res-a"
const RES_B = "res-b"
const AS_OF = "2026-05-06"

const KEY_A: ResourceRateLookupKey = {
  tenant_id: TNT,
  resource_id: RES_A,
  as_of_date: AS_OF,
}
const KEY_B: ResourceRateLookupKey = {
  tenant_id: TNT,
  resource_id: RES_B,
  as_of_date: AS_OF,
}

/**
 * Shape returned by _resolve_resource_rate(...) for the override branch.
 * Note: the SQL helper returns the resource_id only on the override branch;
 * the role branch returns NULL there. Lookup layer normalizes this.
 */
function overrideRow(
  resourceId: string,
  daily = 1500,
  currency = "EUR",
): Record<string, unknown> {
  return {
    tenant_id: TNT,
    source: "override",
    role_key: null,
    resource_id: resourceId,
    daily_rate: daily,
    currency,
    valid_from: null,
  }
}

function roleRow(
  roleKey = "senior_dev",
  daily = 1000,
  currency = "EUR",
  validFrom = "2026-01-01",
): Record<string, unknown> {
  return {
    tenant_id: TNT,
    source: "role",
    role_key: roleKey,
    resource_id: null, // SQL helper sets this to null for the role branch
    daily_rate: daily,
    currency,
    valid_from: validFrom,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resolveResourceRates", () => {
  it("short-circuits on empty key list (no RPC calls)", async () => {
    const { client, rpc } = makeMockClient(() => {
      throw new Error("should not be called")
    })
    const result = await resolveResourceRates({ supabase: client, keys: [] })
    expect(result.resolved).toEqual([])
    expect(result.missing).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it("T1 — Override gesetzt: ResolvedRate.source === 'override'", async () => {
    const { client } = makeMockClient(() => ({
      data: [overrideRow(RES_A, 1500, "EUR")],
      error: null,
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toHaveLength(1)
    expect(result.missing).toEqual([])
    const r = result.resolved[0]!
    expect(r.source).toBe("override")
    expect(r.daily_rate).toBe(1500)
    expect(r.currency).toBe("EUR")
    expect(r.role_key).toBeNull()
    expect(r.valid_from).toBeNull()
    expect(r.resource_id).toBe(RES_A)
  })

  it("T2 — Kein Override + Rolle aktiv: ResolvedRate.source === 'role' und resource_id wird vom Lookup-Layer injiziert", async () => {
    const { client } = makeMockClient(() => ({
      data: [roleRow("senior_dev", 1000, "EUR", "2026-01-01")],
      error: null,
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toHaveLength(1)
    const r = result.resolved[0]!
    expect(r.source).toBe("role")
    expect(r.daily_rate).toBe(1000)
    expect(r.currency).toBe("EUR")
    expect(r.role_key).toBe("senior_dev")
    expect(r.valid_from).toBe("2026-01-01")
    // The SQL helper returns null for resource_id on the role branch — the
    // lookup layer MUST inject the input key's resource_id so the engine can
    // index uniformly. This is the critical normalization invariant.
    expect(r.resource_id).toBe(RES_A)
  })

  it("T3 — Override und Rolle gleichzeitig: Override gewinnt (Vertragsprüfung — der SQL-Helper short-circuits server-side, der Lookup-Layer transportiert die override-Antwort 1:1)", async () => {
    // Simulate the helper's actual server-side semantics: when an override
    // exists, the helper returns ONLY the override row and never executes
    // the role branch. The lookup layer must not second-guess that.
    const { client } = makeMockClient(() => ({
      data: [overrideRow(RES_A, 1500, "EUR")],
      error: null,
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0]!.source).toBe("override")
    expect(result.resolved[0]!.daily_rate).toBe(1500)
  })

  it("T4 — Weder Override noch Rolle: Key landet in missing[]", async () => {
    const { client } = makeMockClient(() => ({
      data: [], // empty array → no row
      error: null,
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toEqual([])
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]!.resource_id).toBe(RES_A)
  })

  it("T5 — RPC-Fehler: Key landet in missing[] (fail-open, kein Throw)", async () => {
    // Suppress console.error from the lookup layer's defensive logging.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = makeMockClient(() => ({
      data: null,
      error: { message: "RPC down" },
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toEqual([])
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]!.resource_id).toBe(RES_A)
    expect(errSpy).toHaveBeenCalled()
  })

  it("dedupes identical keys before RPC dispatch (one resource_id × as_of_date → one RPC)", async () => {
    let calls = 0
    const { client } = makeMockClient(() => {
      calls += 1
      return { data: [overrideRow(RES_A, 1500)], error: null }
    })
    await resolveResourceRates({
      supabase: client,
      keys: [KEY_A, KEY_A, KEY_A],
    })
    expect(calls).toBe(1)
  })

  it("resolves multiple distinct keys in parallel", async () => {
    const { client, calls } = makeMockClient((call) => {
      if (call.args.p_resource_id === RES_A)
        return { data: [overrideRow(RES_A, 1500)], error: null }
      if (call.args.p_resource_id === RES_B)
        return { data: [roleRow("senior_dev", 1000)], error: null }
      return { data: [], error: null }
    })
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A, KEY_B],
    })
    expect(result.resolved).toHaveLength(2)
    expect(calls).toHaveLength(2)
    const byRes = new Map(
      result.resolved.map((r) => [r.resource_id, r] as const),
    )
    expect(byRes.get(RES_A)?.source).toBe("override")
    expect(byRes.get(RES_B)?.source).toBe("role")
    // resource_id injection invariant for both branches
    expect(byRes.get(RES_A)?.resource_id).toBe(RES_A)
    expect(byRes.get(RES_B)?.resource_id).toBe(RES_B)
  })

  it("rejects malformed RPC responses (missing source field) as missing", async () => {
    const { client } = makeMockClient(() => ({
      data: [
        {
          tenant_id: TNT,
          // source is missing — invalid payload
          role_key: "senior_dev",
          resource_id: null,
          daily_rate: 1000,
          currency: "EUR",
          valid_from: "2026-01-01",
        },
      ],
      error: null,
    }))
    const result = await resolveResourceRates({
      supabase: client,
      keys: [KEY_A],
    })
    expect(result.resolved).toEqual([])
    expect(result.missing).toHaveLength(1)
  })
})
