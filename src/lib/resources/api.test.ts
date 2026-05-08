import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { updateResource } from "./api"

// PROJ-54-β AC-21 — the optimistic-lock token must hit the wire as
// `If-Unmodified-Since` exactly when the caller passes it. Without the
// option the header must NOT be set (backwards-compat for callers that
// don't carry an `updated_at`).

const RESOURCE_ID = "44444444-4444-4444-8444-444444444444"

describe("updateResource — If-Unmodified-Since", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        resource: { id: RESOURCE_ID, display_name: "X" },
      }),
    }))
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends If-Unmodified-Since when ifUnmodifiedSince is provided", async () => {
    await updateResource(
      RESOURCE_ID,
      { display_name: "Renamed" },
      { ifUnmodifiedSince: "2026-05-08T14:00:00.000Z" }
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe("PATCH")
    const headers = init?.headers as Record<string, string>
    expect(headers["If-Unmodified-Since"]).toBe("2026-05-08T14:00:00.000Z")
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("omits If-Unmodified-Since when no token is provided", async () => {
    await updateResource(RESOURCE_ID, { display_name: "Renamed" })

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    const headers = init?.headers as Record<string, string>
    expect(headers).not.toHaveProperty("If-Unmodified-Since")
  })

  it("propagates a server error message via thrown Error", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: "stale_record",
          message:
            "Die Ressource wurde inzwischen geändert. Lade die Seite neu und versuche es erneut.",
        },
      }),
    })

    await expect(
      updateResource(
        RESOURCE_ID,
        { display_name: "Late" },
        { ifUnmodifiedSince: "2026-05-08T13:30:00.000Z" }
      )
    ).rejects.toThrow(/inzwischen geändert/)
  })
})
