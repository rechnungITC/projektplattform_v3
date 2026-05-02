import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveRoleRates } from "./role-rate-lookup"
import type { RoleRateLookupKey } from "./types"

import type { SupabaseClient } from "@supabase/supabase-js"

// ──────────────────────────────────────────────────────────────────────
// Mocking pattern: a tiny stand-in that exposes only `.rpc(...)`. The
// resolver does not touch any other client surface, so we don't need to
// mock the full SupabaseClient.
// ──────────────────────────────────────────────────────────────────────

interface RpcCall {
  fn: string
  args: { p_tenant_id: string; p_role_key: string; p_as_of_date: string }
}

interface RpcStubResponse {
  data: unknown
  error: { message: string } | null
}

function makeMockClient(
  responder: (call: RpcCall) => RpcStubResponse | Promise<RpcStubResponse>
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

function makeRow(overrides: {
  tenant_id?: string
  role_key?: string
  daily_rate?: number | string
  currency?: string
  valid_from?: string
} = {}) {
  return {
    id: "rate-id",
    tenant_id: overrides.tenant_id ?? "tnt-1",
    role_key: overrides.role_key ?? "senior_dev",
    daily_rate: overrides.daily_rate ?? 1000,
    currency: overrides.currency ?? "EUR",
    valid_from: overrides.valid_from ?? "2026-01-01",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

const KEY_A: RoleRateLookupKey = {
  tenant_id: "tnt-1",
  role_key: "senior_dev",
  as_of_date: "2026-04-01",
}
const KEY_B: RoleRateLookupKey = {
  tenant_id: "tnt-1",
  role_key: "key_user",
  as_of_date: "2026-04-01",
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ──────────────────────────────────────────────────────────────────────

describe("resolveRoleRates", () => {
  it("resolves an empty key list without making any RPC calls", async () => {
    const { client, rpc } = makeMockClient(() => {
      throw new Error("should not be called")
    })

    const result = await resolveRoleRates({ supabase: client, keys: [] })

    expect(result.resolved).toEqual([])
    expect(result.missing).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it("returns both lookups resolved when RPC returns a row for each", async () => {
    const { client, rpc } = makeMockClient((call) => {
      if (call.args.p_role_key === "senior_dev") {
        return { data: makeRow({ role_key: "senior_dev", daily_rate: 1000 }), error: null }
      }
      if (call.args.p_role_key === "key_user") {
        return { data: makeRow({ role_key: "key_user", daily_rate: 600 }), error: null }
      }
      return { data: null, error: null }
    })

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A, KEY_B],
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.resolved).toHaveLength(2)
    expect(result.missing).toHaveLength(0)
    const byRole = new Map(result.resolved.map((r) => [r.role_key, r]))
    expect(byRole.get("senior_dev")?.daily_rate).toBe(1000)
    expect(byRole.get("key_user")?.daily_rate).toBe(600)
  })

  it("classifies a NULL-data response as missing (no matching rate)", async () => {
    const { client } = makeMockClient((call) => {
      if (call.args.p_role_key === "senior_dev") {
        return { data: makeRow(), error: null }
      }
      return { data: null, error: null } // no rate for key_user
    })

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A, KEY_B],
    })

    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0].role_key).toBe("senior_dev")
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]).toEqual(KEY_B)
  })

  it("is fail-open: an RPC error for one key does not throw and lands in missing", async () => {
    // Suppress the expected console.error from the fail-open branch so
    // test output stays clean.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { client } = makeMockClient((call) => {
      if (call.args.p_role_key === "senior_dev") {
        return { data: null, error: { message: "RPC blew up" } }
      }
      return { data: makeRow({ role_key: "key_user", daily_rate: 600 }), error: null }
    })

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A, KEY_B],
    })

    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0].role_key).toBe("key_user")
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].role_key).toBe("senior_dev")
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("dedupes identical keys before calling RPC", async () => {
    const { client, rpc } = makeMockClient(() => ({
      data: makeRow({ role_key: "senior_dev" }),
      error: null,
    }))

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A, KEY_A, { ...KEY_A }, KEY_A],
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result.resolved).toHaveLength(1)
    expect(result.missing).toHaveLength(0)
  })

  it("does NOT dedupe keys with different as_of_date (rate may differ over time)", async () => {
    const { client, rpc } = makeMockClient((call) => ({
      data: makeRow({
        role_key: call.args.p_role_key,
        valid_from: call.args.p_as_of_date,
      }),
      error: null,
    }))

    const result = await resolveRoleRates({
      supabase: client,
      keys: [
        KEY_A,
        { ...KEY_A, as_of_date: "2025-01-01" },
      ],
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.resolved).toHaveLength(2)
  })

  it("coerces stringified numeric daily_rate (PostgREST may serialize numeric as string)", async () => {
    const { client } = makeMockClient(() => ({
      data: makeRow({ daily_rate: "1234.56" }),
      error: null,
    }))

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A],
    })

    expect(result.resolved[0].daily_rate).toBe(1234.56)
  })

  it("treats malformed RPC payloads as missing rather than crashing", async () => {
    const { client } = makeMockClient(() => ({
      data: { unexpected: "shape" },
      error: null,
    }))

    const result = await resolveRoleRates({
      supabase: client,
      keys: [KEY_A],
    })

    expect(result.resolved).toHaveLength(0)
    expect(result.missing).toHaveLength(1)
  })

  it("passes RPC arguments unchanged (tenant_id, role_key, as_of_date)", async () => {
    const { client, calls } = makeMockClient(() => ({
      data: makeRow(),
      error: null,
    }))

    await resolveRoleRates({ supabase: client, keys: [KEY_A] })

    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe("_resolve_role_rate")
    expect(calls[0].args).toEqual({
      p_tenant_id: "tnt-1",
      p_role_key: "senior_dev",
      p_as_of_date: "2026-04-01",
    })
  })
})
