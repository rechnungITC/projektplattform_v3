import { afterEach, describe, expect, it, vi } from "vitest"

import {
  issueJiraWebhookToken,
  listJiraConflicts,
  listJiraWebhookTokens,
  resolveJiraConflict,
  revokeJiraWebhookToken,
} from "./inbound-api"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("Jira inbound API client (PROJ-50)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("issues a webhook token (POST, reveal-once shape)", async () => {
    const issued = {
      id: "tok-1",
      label: "Prod",
      created_at: "2026-06-12T00:00:00Z",
      token: "raw-token",
      webhook_url: "https://app/api/connectors/jira/webhook/raw-token",
    }
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse(issued, 201))
    vi.stubGlobal("fetch", fetchSpy)

    await expect(issueJiraWebhookToken("Prod")).resolves.toEqual(issued)
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/connectors/jira/webhook-token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Prod" }),
      }),
    )
  })

  it("omits label from the body when not provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ id: "t", token: "x", webhook_url: "u", label: null, created_at: "" }, 201))
    vi.stubGlobal("fetch", fetchSpy)
    await issueJiraWebhookToken()
    expect(fetchSpy.mock.calls[0][1].body).toBe(JSON.stringify({}))
  })

  it("lists webhook tokens", async () => {
    const tokens = [{ id: "t1", label: null, created_by: "u", created_at: "", last_used_at: null, revoked_at: null }]
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ tokens }))
    vi.stubGlobal("fetch", fetchSpy)
    await expect(listJiraWebhookTokens()).resolves.toEqual(tokens)
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/connectors/jira/webhook-token",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    )
  })

  it("revokes a token by id (DELETE)", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchSpy)
    await revokeJiraWebhookToken("tok-9")
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/connectors/jira/webhook-token?id=tok-9",
      expect.objectContaining({ method: "DELETE" }),
    )
  })

  it("lists pending conflicts with the resolution filter", async () => {
    const conflicts = [{ id: "c1", field: "title", v3_value: "a", jira_value: "b", resolution: "pending" }]
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ conflicts }))
    vi.stubGlobal("fetch", fetchSpy)
    await expect(listJiraConflicts("p-1", { resolution: "pending" })).resolves.toEqual(conflicts)
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/p-1/jira/conflicts?resolution=pending",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    )
  })

  it("resolves a conflict (POST with resolution body)", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true, resolution: "jira_wins", applied: true }))
    vi.stubGlobal("fetch", fetchSpy)
    await expect(resolveJiraConflict("p-1", "c-1", "jira_wins")).resolves.toEqual({
      ok: true,
      resolution: "jira_wins",
      applied: true,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/p-1/jira/conflicts/c-1/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ resolution: "jira_wins" }),
      }),
    )
  })

  it("throws the API error message on a failed response", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { message: "already resolved" } }, 409))
    vi.stubGlobal("fetch", fetchSpy)
    await expect(resolveJiraConflict("p-1", "c-1", "manual")).rejects.toThrow("already resolved")
  })
})
