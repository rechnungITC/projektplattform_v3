/**
 * PROJ-48 — MCP bridge, γ QA auth-gate spec.
 *
 * Route-level security probes (no session), mirroring the PROJ-50 pattern:
 *   - admin token-management + audit routes are session-gated (307/401/403),
 *   - the PUBLIC MCP endpoint accepts unauth requests but rejects a missing or
 *     unknown bearer token with 401 (generic, no tenant existence leak),
 *   - a malformed JSON-RPC body is rejected with 400.
 *
 * DB-level invariants (tenant isolation, need-to-know gate, rate-limit RPC,
 * Class-3 redaction) are proven by the live DB security probe + vitest
 * (src/lib/mcp/*.test.ts incl. the real MCP-client integration smoke).
 */

import { expect, test } from "./fixtures/auth-fixture"

const BAD_TOKEN = "f".repeat(64) // well-formed but unknown → must 401

test.describe("PROJ-48 / MCP bridge API auth-gates", () => {
  // --- admin token management: session-gated ---
  test("GET /api/connectors/mcp/tokens is auth-gated", async ({ request }) => {
    const res = await request.get("/api/connectors/mcp/tokens", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /api/connectors/mcp/tokens is auth-gated", async ({ request }) => {
    const res = await request.post("/api/connectors/mcp/tokens", {
      data: { label: "x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("DELETE /api/connectors/mcp/tokens is auth-gated", async ({ request }) => {
    const res = await request.delete(
      "/api/connectors/mcp/tokens?id=00000000-0000-0000-0000-000000000000",
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("GET /api/connectors/mcp/audit is auth-gated", async ({ request }) => {
    const res = await request.get("/api/connectors/mcp/audit", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  // --- PUBLIC MCP endpoint: reachable without a session, but token required ---
  test("POST /api/mcp without a bearer token → 401 (no redirect)", async ({ request }) => {
    const res = await request.post("/api/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
  })

  test("POST /api/mcp with an unknown token → 401, no tenant existence leak", async ({
    request,
  }) => {
    const res = await request.post("/api/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      headers: { authorization: `Bearer mcp_${BAD_TOKEN}` },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBe(401)
    const body = await res.json().catch(() => ({}))
    expect(JSON.stringify(body)).not.toContain("tenant")
  })

  test("POST /api/mcp with a malformed body → 400", async ({ request }) => {
    const res = await request.post("/api/mcp", {
      headers: { authorization: "Bearer mcp_x", "content-type": "application/json" },
      data: "{not json",
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBe(400)
  })
})
