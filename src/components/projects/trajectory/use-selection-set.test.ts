import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useSelectionSet } from "./use-selection-set"

describe("useSelectionSet", () => {
  it("starts with an empty set", () => {
    const { result } = renderHook(() => useSelectionSet())
    expect(result.current.size).toBe(0)
    expect(result.current.has("phase:1")).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it("toggles an id in and out of the set", () => {
    const { result } = renderHook(() => useSelectionSet())

    act(() => {
      result.current.toggle("phase:1")
    })
    expect(result.current.size).toBe(1)
    expect(result.current.has("phase:1")).toBe(true)

    act(() => {
      result.current.toggle("phase:1")
    })
    expect(result.current.size).toBe(0)
    expect(result.current.has("phase:1")).toBe(false)
  })

  it("supports multiple distinct selections", () => {
    const { result } = renderHook(() => useSelectionSet())
    act(() => {
      result.current.toggle("phase:1")
      result.current.toggle("sprint:2")
      result.current.toggle("phase:3")
    })
    expect(result.current.size).toBe(3)
    expect(result.current.has("phase:1")).toBe(true)
    expect(result.current.has("sprint:2")).toBe(true)
    expect(result.current.has("phase:3")).toBe(true)
  })

  it("clear() empties the set", () => {
    const { result } = renderHook(() => useSelectionSet())
    act(() => {
      result.current.toggle("phase:1")
      result.current.toggle("sprint:2")
    })
    expect(result.current.size).toBe(2)
    act(() => result.current.clear())
    expect(result.current.size).toBe(0)
  })

  it("clear() is a no-op when the set is already empty", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useSelectionSet({ onChange }))
    act(() => result.current.clear())
    expect(onChange).not.toHaveBeenCalled()
  })

  it("fires onChange after every mutation with the new size", () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useSelectionSet({ onChange }))
    act(() => result.current.toggle("a"))
    expect(onChange).toHaveBeenLastCalledWith(1)
    act(() => result.current.toggle("b"))
    expect(onChange).toHaveBeenLastCalledWith(2)
    act(() => result.current.toggle("a"))
    expect(onChange).toHaveBeenLastCalledWith(1)
    act(() => result.current.clear())
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})
