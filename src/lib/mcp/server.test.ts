/**
 * PROJ-48 — MCP server tools: tenant scoping, confidentiality gating, redaction.
 *
 * Drives the real McpServer through the OneShotTransport with a mocked
 * service-role Supabase client so we assert the exact query filters and the
 * Class-3 redaction the tools apply.
 */
import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { buildMcpServer } from "./server"
import { OneShotTransport } from "./transport"

interface ChainResult {
  data: unknown
  error: unknown
}

/** A chainable, awaitable Supabase query-builder mock. */
function makeChain(result: ChainResult, eqCalls: Array<[string, unknown]>) {
  const chain: Record<string, unknown> = {}
  const passthrough = ["select", "order", "limit", "or"]
  for (const m of passthrough) chain[m] = vi.fn(() => chain)
  chain.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val])
    return chain
  })
  chain.maybeSingle = vi.fn(async () => result)
  // make the builder awaitable (resolves to {data,error})
  chain.then = (resolve: (v: ChainResult) => unknown) => resolve(result)
  return chain
}

async function callTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { server, stats } = buildMcpServer({ tenantId: "t-1", supabase })
  const transport = new OneShotTransport()
  await server.connect(transport)
  const res = (await transport.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  } as never)) as { result?: { content: { text: string }[] } }
  await server.close()
  const payload = JSON.parse(res.result!.content[0].text)
  return { payload, stats }
}

describe("buildMcpServer — tools/list", () => {
  it("registers exactly the 4 read-only tools", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient
    const { server } = buildMcpServer({ tenantId: "t-1", supabase })
    const transport = new OneShotTransport()
    await server.connect(transport)
    const res = (await transport.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    } as never)) as unknown as { result: { tools: { name: string }[] } }
    await server.close()
    const names = res.result.tools.map((t) => t.name).sort()
    expect(names).toEqual([
      "project.lookup",
      "project.status",
      "report.snapshot",
      "work_item.lookup",
    ])
  })
})

describe("project.lookup", () => {
  it("filters by tenant + standard confidentiality and redacts Class-3", async () => {
    const eqCalls: Array<[string, unknown]> = []
    const supabase = {
      from: vi.fn(() =>
        makeChain(
          {
            data: [
              {
                id: "p1",
                name: "Alpha",
                lifecycle_status: "active",
                responsible_user_id: "u-secret",
              },
            ],
            error: null,
          },
          eqCalls,
        ),
      ),
    } as unknown as SupabaseClient

    const { payload, stats } = await callTool(supabase, "project.lookup", {
      query: "Al",
    })

    // tenant + confidentiality + soft-delete filters were applied
    expect(eqCalls).toContainEqual(["tenant_id", "t-1"])
    expect(eqCalls).toContainEqual(["confidentiality_level", "standard"])
    expect(eqCalls).toContainEqual(["is_deleted", false])
    // Class-3 responsible_user_id is gone; structural/safe fields remain
    expect(payload.projects[0]).toEqual({
      id: "p1",
      name: "Alpha",
      lifecycle_status: "active",
    })
    expect(payload.projects[0].responsible_user_id).toBeUndefined()
    expect(stats.rowCount).toBe(1)
  })
})

describe("project.status", () => {
  it("returns not_found when the project is missing or not standard", async () => {
    const eqCalls: Array<[string, unknown]> = []
    const supabase = {
      from: vi.fn(() => makeChain({ data: null, error: null }, eqCalls)),
    } as unknown as SupabaseClient
    const { payload } = await callTool(supabase, "project.status", {
      project_id: "00000000-0000-4000-8000-000000000000",
    })
    expect(payload.error).toBe("not_found")
  })
})

describe("need-to-know gate (confidential/missing project)", () => {
  // loadStandardProject returns null when the project is missing OR not
  // confidentiality_level='standard'; status/work_item/report all gate on it.
  it.each(["work_item.lookup", "report.snapshot"])(
    "%s returns not_found when the project is not standard/visible",
    async (tool) => {
      const eqCalls: Array<[string, unknown]> = []
      const supabase = {
        from: vi.fn(() => makeChain({ data: null, error: null }, eqCalls)),
      } as unknown as SupabaseClient
      const { payload, stats } = await callTool(supabase, tool, {
        project_id: "00000000-0000-4000-8000-000000000000",
      })
      expect(payload.error).toBe("not_found")
      // gated before any rows are counted
      expect(stats.rowCount).toBe(0)
    },
  )
})
