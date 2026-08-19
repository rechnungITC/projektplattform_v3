/**
 * PROJ-Y-143n — a Supabase mock for route tests that turn a tenant module on
 * and off.
 *
 * Written because this slice adds the same gate to twelve handlers in eight
 * files, and seven of them had no test at all. Copying the scaffolding eight
 * times would have produced eight subtly different notions of "module off",
 * which is how the gap being fixed here survived three months in the first
 * place.
 *
 * What it deliberately does **not** do: mock `requireModuleActive`. Only the
 * `tenant_settings` row it reads is faked, so the real gate — including the
 * read-404 / write-403 split and the fail-open-on-missing-settings branch —
 * executes in every test. Mocking the gate would have tested the mock.
 *
 * `tenant_memberships` is dispatched on the requested column rather than on
 * call order: `select("tenant_id")` is `resolveActiveTenantId`, `select("role")`
 * is `requireTenantMember` / `requireTenantAdmin`. The existing PROJ-62 test
 * chains the two through `mockResolvedValueOnce`, which silently breaks the
 * moment a handler gains or loses a lookup — exactly what happened here.
 */

import { vi } from "vitest"

/** A thenable query chain: every builder method returns itself, and awaiting
 *  it resolves to whatever result the test parked on it. */
export interface QueryStub {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  /** Result for an awaited chain without `.single()` / `.maybeSingle()`. */
  result: { data: unknown; error: unknown; count?: number }
  then: (resolve: (value: unknown) => void) => void
}

export function queryStub(): QueryStub {
  const stub = {
    result: { data: [], error: null } as QueryStub["result"],
    then(resolve: (value: unknown) => void) {
      resolve(stub.result)
    },
  } as QueryStub

  for (const method of [
    "select",
    "eq",
    "neq",
    "not",
    "in",
    "order",
    "limit",
    "insert",
    "update",
    "delete",
  ] as const) {
    stub[method] = vi.fn(() => stub)
  }
  stub.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  stub.single = vi.fn(async () => ({ data: null, error: null }))
  return stub
}

export interface ModuleGateHarness {
  /** Signed-in user id; `null` makes every handler answer 401. */
  userId: string | null
  /** What `resolveActiveTenantId` returns. */
  activeTenantId: string | null
  /** Role reported by `requireTenantMember` / `requireTenantAdmin`. */
  role: "admin" | "member" | "viewer" | null
  /**
   * `active_modules` of the tenant, or `null` for "no settings row" — which
   * the real gate treats as fail-open, so it is a distinct case worth testing.
   */
  activeModules: string[] | null
  /** Tenant ids the gate actually looked up, in order. Lets a test prove
   *  *which* tenant a row-anchored handler gated on (PROJ-Y-143n AC .8). */
  settingsLookups: string[]
  /** Per-table stubs, created on first access. */
  table: (name: string) => QueryStub
  client: { auth: { getUser: () => Promise<unknown> }; from: (t: string) => unknown; rpc: ReturnType<typeof vi.fn> }
  reset: () => void
}

const ALL_MODULES = [
  "risks",
  "decisions",
  "ai_proposals",
  "audit_reports",
  "assistant",
  "communication",
  "resources",
  "vendor",
  "budget",
  "output_rendering",
  "organization",
  "construction",
]

export function createModuleGateHarness(options?: {
  userId?: string
  tenantId?: string
}): ModuleGateHarness {
  const defaults = {
    userId: options?.userId ?? "33333333-3333-4333-8333-333333333333",
    tenantId: options?.tenantId ?? "11111111-1111-4111-8111-111111111111",
  }
  const tables = new Map<string, QueryStub>()

  const harness: ModuleGateHarness = {
    userId: defaults.userId,
    activeTenantId: defaults.tenantId,
    role: "admin",
    activeModules: [...ALL_MODULES],
    settingsLookups: [],
    table(name: string) {
      let stub = tables.get(name)
      if (!stub) {
        stub = queryStub()
        tables.set(name, stub)
      }
      return stub
    },
    client: {
      auth: {
        getUser: async () => ({
          data: { user: harness.userId ? { id: harness.userId } : null },
        }),
      },
      from(table: string) {
        if (table === "tenant_memberships") return membershipStub()
        if (table === "tenant_settings") return settingsStub()
        return harness.table(table)
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
    reset() {
      harness.userId = defaults.userId
      harness.activeTenantId = defaults.tenantId
      harness.role = "admin"
      harness.activeModules = [...ALL_MODULES]
      harness.settingsLookups = []
      tables.clear()
      harness.client.rpc.mockClear()
      harness.client.rpc.mockResolvedValue({ data: null, error: null })
    },
  }

  /** Dispatches on the selected column, not on call order — see file header. */
  function membershipStub() {
    let wants: "tenant" | "role" = "tenant"
    const chain = {
      select(columns: string) {
        wants = columns.includes("role") ? "role" : "tenant"
        return chain
      },
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      // PROJ-62's DELETE handlers count `tenant_memberships` rows that still
      // reference a unit; that awaits the chain instead of calling
      // `maybeSingle`, so the stub has to be thenable too.
      then(resolve: (value: unknown) => void) {
        resolve({ data: [], error: null, count: 0 })
      },
      async maybeSingle() {
        if (wants === "role") {
          return {
            data: harness.role ? { role: harness.role } : null,
            error: null,
          }
        }
        return {
          data: harness.activeTenantId
            ? { tenant_id: harness.activeTenantId }
            : null,
          error: null,
        }
      },
    }
    return chain
  }

  function settingsStub() {
    const chain = {
      select: () => chain,
      eq(column: string, value: string) {
        if (column === "tenant_id") harness.settingsLookups.push(value)
        return chain
      },
      async maybeSingle() {
        return {
          data:
            harness.activeModules === null
              ? null
              : { active_modules: harness.activeModules },
          error: null,
        }
      },
    }
    return chain
  }

  return harness
}

/** `active_modules` with the organization module removed. */
export function withoutOrganization(): string[] {
  return ALL_MODULES.filter((m) => m !== "organization")
}
