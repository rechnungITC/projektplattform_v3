import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useStorySelection } from "./use-story-selection"

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

describe("useStorySelection — toggle", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useStorySelection())
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.isSelected(A)).toBe(false)
  })

  it("toggle adds when absent", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    expect(result.current.isSelected(A)).toBe(true)
    expect(result.current.selectedIds.size).toBe(1)
  })

  it("toggle removes when present", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    act(() => result.current.toggle(A))
    expect(result.current.isSelected(A)).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it("toggle accumulates multiple distinct IDs", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    act(() => result.current.toggle(B))
    act(() => result.current.toggle(C))
    expect(result.current.selectedIds.size).toBe(3)
    expect(result.current.isSelected(A)).toBe(true)
    expect(result.current.isSelected(B)).toBe(true)
    expect(result.current.isSelected(C)).toBe(true)
  })
})

describe("useStorySelection — range (Shift-Click)", () => {
  it("Shift-Click without prior anchor falls back to single-select", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.range(B, [A, B, C, D]))
    expect(result.current.selectedIds.size).toBe(1)
    expect(result.current.isSelected(B)).toBe(true)
  })

  it("Shift-Click after toggle selects forward range inclusive", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    act(() => result.current.range(C, [A, B, C, D]))
    expect(result.current.selectedIds.size).toBe(3)
    expect(result.current.isSelected(A)).toBe(true)
    expect(result.current.isSelected(B)).toBe(true)
    expect(result.current.isSelected(C)).toBe(true)
    expect(result.current.isSelected(D)).toBe(false)
  })

  it("Shift-Click works backward (anchor after target)", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(D))
    act(() => result.current.range(B, [A, B, C, D]))
    expect(result.current.selectedIds.size).toBe(3)
    expect(result.current.isSelected(B)).toBe(true)
    expect(result.current.isSelected(C)).toBe(true)
    expect(result.current.isSelected(D)).toBe(true)
    expect(result.current.isSelected(A)).toBe(false)
  })

  it("range replaces previous selection (not additive)", () => {
    const { result } = renderHook(() => useStorySelection())
    // Build up an ad-hoc selection: A, then B added with toggle.
    act(() => result.current.toggle(A))
    act(() => result.current.toggle(B))
    // Now Shift-Click on D from anchor B → selection becomes B-C-D, not A-B-C-D.
    act(() => result.current.range(D, [A, B, C, D]))
    expect(result.current.selectedIds.size).toBe(3)
    expect(result.current.isSelected(A)).toBe(false)
    expect(result.current.isSelected(B)).toBe(true)
    expect(result.current.isSelected(D)).toBe(true)
  })

  it("range falls back to single-select if anchor no longer visible (filter changed)", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    // A was filtered out — orderedIds no longer contains A.
    act(() => result.current.range(C, [B, C, D]))
    expect(result.current.selectedIds.size).toBe(1)
    expect(result.current.isSelected(C)).toBe(true)
  })
})

describe("useStorySelection — clear / set", () => {
  it("clear empties the selection and resets the anchor", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    act(() => result.current.toggle(B))
    act(() => result.current.clear())
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.isSelected(A)).toBe(false)
  })

  it("set replaces the selection with the given IDs", () => {
    const { result } = renderHook(() => useStorySelection())
    act(() => result.current.toggle(A))
    act(() => result.current.set([B, C]))
    expect(result.current.selectedIds.size).toBe(2)
    expect(result.current.isSelected(A)).toBe(false)
    expect(result.current.isSelected(B)).toBe(true)
    expect(result.current.isSelected(C)).toBe(true)
  })
})
