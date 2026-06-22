/**
 * PROJ-48 — one-shot, stateless MCP transport for Next.js route handlers.
 *
 * The official `StreamableHTTPServerTransport` is built around Node's
 * `http.IncomingMessage`/`ServerResponse`, which the App Router does not hand
 * us. Instead of bridging Web ↔ Node, we drive `McpServer.connect()` with this
 * minimal SDK-native `Transport`: it injects exactly one JSON-RPC request and
 * resolves with the single matching response.
 *
 * Trade-offs (acceptable for a read-only V1 — see PROJ-48 tech design):
 *   - no SSE / server-initiated messages, no resumability;
 *   - one request → one response per HTTP call (stateless JSON mode).
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"

function isResponseForId(
  message: JSONRPCMessage,
  id: string | number,
): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    (message as { id?: unknown }).id === id &&
    ("result" in message || "error" in message)
  )
}

export class OneShotTransport implements Transport {
  onmessage?: (message: JSONRPCMessage, extra?: unknown) => void
  onclose?: () => void
  onerror?: (error: Error) => void

  private resolveResponse!: (message: JSONRPCMessage) => void
  private settled = false
  /** Resolves with the server's response to the injected request. */
  readonly response: Promise<JSONRPCMessage>

  constructor() {
    this.response = new Promise<JSONRPCMessage>((resolve) => {
      this.resolveResponse = resolve
    })
  }

  async start(): Promise<void> {
    /* nothing to connect — messages are injected synchronously */
  }

  /** The MCP server calls this with its outgoing response message. */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.settled) return
    // Only settle on an actual response (has id + result/error); ignore any
    // server-initiated notifications a read-only server should never emit.
    if ("id" in message && ("result" in message || "error" in message)) {
      this.settled = true
      this.resolveResponse(message)
    }
  }

  async close(): Promise<void> {
    this.onclose?.()
  }

  /**
   * Feed a single client JSON-RPC request into the connected server and await
   * the matching response. Requests without an id (notifications) resolve to
   * null because the protocol mandates no response for them.
   */
  async handle(request: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    if (!this.onmessage) {
      throw new Error("OneShotTransport: server is not connected")
    }
    const id =
      typeof request === "object" && request !== null && "id" in request
        ? (request as { id?: string | number }).id
        : undefined

    this.onmessage(request)

    if (id === undefined || id === null) {
      return null // notification — no response expected
    }
    const message = await this.response
    return isResponseForId(message, id) ? message : message
  }
}
