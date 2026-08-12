/**
 * PROJ-Y-143f — a module-gated 404 is a state, not a failure.
 *
 * The `output_rendering` module is off for the [E2E] tenant and for any
 * workspace that has not enabled it, so `GET /api/projects/:id/snapshots`
 * answers 404 with the deliberately generic "Resource not found."
 * (`requireModuleActive`, read intent). The hook used to turn every non-ok
 * response into `error = "HTTP 404"`, which the project room rendered in
 * destructive red — and which PROJ-51 had frozen into a visual baseline as
 * if it were the intended UI.
 *
 * Only `fetch` is stubbed here: the hook's own branching is what is under
 * test, so it runs for real.
 */

import { waitFor } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSnapshots } from "./use-snapshots"

const PROJECT = "11111111-1111-4111-8111-111111111111"

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useSnapshots — module-gated 404", () => {
  it("reports 404 as unavailable, not as an error", async () => {
    stubFetch(404, { error: { code: "not_found", message: "Resource not found." } })
    const { result } = renderHook(() => useSnapshots(PROJECT))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unavailable).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.snapshots).toEqual([])
  })

  it("still reports a real failure as an error", async () => {
    stubFetch(500, { error: { message: "boom" } })
    const { result } = renderHook(() => useSnapshots(PROJECT))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unavailable).toBe(false)
    expect(result.current.error).toBe("HTTP 500")
  })

  it("clears unavailable on a successful load", async () => {
    stubFetch(200, { snapshots: [] })
    const { result } = renderHook(() => useSnapshots(PROJECT))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unavailable).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
