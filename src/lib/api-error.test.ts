/**
 * PROJ-Y-143f — the wrapper must keep the HTTP status, because that is the
 * only thing telling a module-gated read apart from a real failure without
 * parsing German prose (the anti-pattern flagged in the PROJ-77-α QA).
 */

import { describe, expect, it } from "vitest"

import { ApiRequestError, apiRequestError, isUnavailable } from "./api-error"

function response(status: number, body?: unknown): Response {
  return {
    status,
    json: async () => {
      if (body === undefined) throw new Error("not json")
      return body
    },
  } as Response
}

describe("apiRequestError", () => {
  it("keeps status, code and the server's message verbatim", async () => {
    const err = await apiRequestError(
      response(404, {
        error: { code: "not_found", message: "Resource not found." },
      }),
    )
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(err.status).toBe(404)
    expect(err.code).toBe("not_found")
    // Unchanged copy: existing toasts keep reading the same.
    expect(err.message).toBe("Resource not found.")
  })

  it("falls back to the status when the body is not JSON", async () => {
    const err = await apiRequestError(response(503))
    expect(err.status).toBe(503)
    expect(err.message).toBe("HTTP 503")
  })

  it("stays an Error, so existing catch blocks keep working", async () => {
    const err = await apiRequestError(response(500, { error: { message: "x" } }))
    expect(err instanceof Error).toBe(true)
  })
})

describe("isUnavailable", () => {
  it("is true only for a 404 ApiRequestError", async () => {
    expect(isUnavailable(await apiRequestError(response(404, {})))).toBe(true)
    expect(isUnavailable(await apiRequestError(response(403, {})))).toBe(false)
    // A plain Error carries no status — must not be mistaken for a gate.
    expect(isUnavailable(new Error("Resource not found."))).toBe(false)
    expect(isUnavailable(null)).toBe(false)
  })
})
