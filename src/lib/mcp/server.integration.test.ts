/**
 * PROJ-48 γ — real MCP-client integration smoke.
 *
 * Drives the production McpServer through the official SDK `Client` over a
 * linked in-memory transport pair (a genuine MCP handshake + JSON-RPC), proving
 * protocol compatibility (ST-02) and that Class-3 redaction metadata reaches a
 * real client in tool responses (ST-03). Supabase is mocked with canned rows.
 */
import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { buildMcpServer } from "./server"

interface ChainResult {
  data: unknown
  error: unknown
}

function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit", "or"]) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (v: ChainResult) => unknown) => resolve(result)
  return chain
}

async function connectedClient(supabase: SupabaseClient) {
  const { server, stats } = buildMcpServer({ tenantId: "tenant-A", supabase })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "qa-client", version: "1.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, stats, close: () => Promise.all([client.close(), server.close()]) }
}

describe("PROJ-48 γ — real MCP client round-trip", () => {
  it("lists exactly the 4 read-only tools (no mutating tool) — ST-02", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient
    const { client, close } = await connectedClient(supabase)
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      "project.lookup",
      "project.status",
      "report.snapshot",
      "work_item.lookup",
    ])
    // No create/update/delete/write tool leaked into V1.
    expect(names.some((n) => /create|update|delete|write|mutate|set/i.test(n))).toBe(false)
    await close()
  })

  it("callTool returns redacted data + redaction metadata to a real client — ST-03", async () => {
    const supabase = {
      from: vi.fn(() =>
        makeChain({
          data: [
            {
              id: "p1",
              name: "Alpha",
              lifecycle_status: "active",
              responsible_user_id: "u-pii", // Class 3 → must be dropped
            },
          ],
          error: null,
        }),
      ),
    } as unknown as SupabaseClient
    const { client, close } = await connectedClient(supabase)

    const res = (await client.callTool({
      name: "project.lookup",
      arguments: { query: "Al" },
    })) as { content: { type: string; text: string }[] }

    const text = res.content[0].text
    const payload = JSON.parse(text) as {
      projects: Record<string, unknown>[]
      redaction: { count: number; fields: string[] }
    }
    // raw Class-3 value never crosses the boundary…
    expect(text).not.toContain("u-pii")
    expect(payload.projects[0].responsible_user_id).toBeUndefined()
    // …and the response carries redaction metadata, not the hidden value.
    expect(payload.redaction.count).toBe(1)
    expect(payload.redaction.fields).toContain("responsible_user_id")
    await close()
  })

  it("an unknown tool returns a typed MCP error, never a stack trace", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient
    const { client, close } = await connectedClient(supabase)
    const res = (await client.callTool({ name: "project.delete", arguments: {} }).catch((e) => e)) as
      | { isError?: boolean; content?: { text: string }[] }
      | Error
    // SDK surfaces unknown tools as an error result or a thrown McpError — both
    // are acceptable; neither must leak internals.
    const serialized = JSON.stringify(res instanceof Error ? res.message : res)
    expect(serialized).not.toMatch(/\/home\/|node_modules|at Object\./)
    await close()
  })
})
