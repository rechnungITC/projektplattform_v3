import { describe, expect, it } from "vitest"

import { formatBytes } from "./format"

describe("formatBytes", () => {
  it("renders zero / negative as 0 B", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(-5)).toBe("0 B")
  })
  it("renders whole bytes without decimals", () => {
    expect(formatBytes(512)).toBe("512 B")
  })
  it("renders KB / MB / GB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1_572_864)).toBe("1.5 MB")
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB")
  })
})
