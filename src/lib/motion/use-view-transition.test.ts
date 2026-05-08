/**
 * PROJ-51-δ — Tests for the View-Transitions feature-detection helper.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useViewTransition } from "./use-view-transition"

afterEach(() => {
  // Clean up any monkey-patched startViewTransition between tests.
  delete (document as unknown as { startViewTransition?: unknown })
    .startViewTransition
  vi.restoreAllMocks()
})

describe("useViewTransition", () => {
  it("invokes the callback immediately when the API is unavailable", () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    act(() => result.current(cb))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("delegates to document.startViewTransition when present", () => {
    // Typed call-signature so `apiMock.mock.calls[0][0]` keeps the
    // callback-argument tuple element — vi.fn(factory) without a generic
    // narrows to `[]` since the factory takes no args, which makes TS5
    // reject the positional index with TS2493 even though the mock does
    // receive a callback at runtime.
    const apiMock = vi.fn<
      (cb: () => unknown) => { finished: Promise<void> }
    >(() => ({ finished: Promise.resolve() }))
    ;(document as unknown as { startViewTransition: typeof apiMock })
      .startViewTransition = apiMock
    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    act(() => result.current(cb))
    expect(apiMock).toHaveBeenCalledTimes(1)
    // The API receives the callback unchanged (it gets invoked by the browser).
    expect(apiMock.mock.calls[0]?.[0]).toBe(cb)
  })

  it("accepts an async callback", async () => {
    const cb = vi.fn(async () => {
      await Promise.resolve()
    })
    const { result } = renderHook(() => useViewTransition())
    await act(async () => {
      result.current(cb)
    })
    expect(cb).toHaveBeenCalled()
  })

  it("returns a stable function reference (memoized via useCallback)", () => {
    const { result, rerender } = renderHook(() => useViewTransition())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
