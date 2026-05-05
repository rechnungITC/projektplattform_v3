import * as path from "node:path"

import { describe, expect, it } from "vitest"

import { walkFiles } from "./ast-walker"

const fixture = (name: string) =>
  path.resolve(__dirname, "__fixtures__", `${name}.ts`)

describe("walkFiles", () => {
  it("detects a static .from().select() call", () => {
    const calls = walkFiles([fixture("static-select")])
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe("work_items")
    expect(calls[0].rawSelect).toBe("id, title")
    expect(calls[0].dynamic).toBe(false)
  })

  it("follows a chained .from().eq().order().select()", () => {
    const calls = walkFiles([fixture("chained-select")])
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe("work_items")
    expect(calls[0].rawSelect).toBe("id, title, status")
    expect(calls[0].dynamic).toBe(false)
  })

  it("preserves a multi-line SELECT string verbatim", () => {
    const calls = walkFiles([fixture("multiline-select")])
    expect(calls).toHaveLength(1)
    expect(calls[0].rawSelect).toContain("outline_path")
    expect(calls[0].rawSelect).toContain("responsible:profiles!fk")
  })

  it("flags a template-literal SELECT as dynamic", () => {
    const calls = walkFiles([fixture("dynamic-select")])
    expect(calls).toHaveLength(1)
    expect(calls[0].dynamic).toBe(true)
    expect(calls[0].rawSelect).toBeNull()
    expect(calls[0].dynamicReason).toContain("select() argument")
  })

  it("captures wildcard selects without flagging them dynamic", () => {
    const calls = walkFiles([fixture("wildcard-select")])
    expect(calls).toHaveLength(1)
    expect(calls[0].rawSelect).toBe("*")
    expect(calls[0].dynamic).toBe(false)
  })

  it("reports the 1-based line number of the .select() call", () => {
    const calls = walkFiles([fixture("static-select")])
    expect(calls[0].line).toBeGreaterThan(0)
  })
})
