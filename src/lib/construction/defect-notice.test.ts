import { describe, expect, it } from "vitest"

import { NOTICE_STATUSES, defectNoticeHref } from "./defect-notice"
import { CONSTRUCTION_DEFECT_STATUSES } from "@/types/construction-defect"

describe("NOTICE_STATUSES", () => {
  it("covers every non-terminal status and nothing else", () => {
    // Umgekehrt formuliert, damit ein neuer Status nicht stillschweigend
    // durchfällt: ausgenommen sind genau die beiden abschliessenden.
    const excluded = CONSTRUCTION_DEFECT_STATUSES.filter(
      (s) => !NOTICE_STATUSES.includes(s)
    )
    expect([...excluded].sort()).toEqual(["geprueft", "verworfen"])
  })

  it("keeps the awaiting-review state in the notice", () => {
    expect(NOTICE_STATUSES).toContain("erledigt")
  })
})

describe("defectNoticeHref", () => {
  it("addresses a trade", () => {
    expect(defectNoticeHref("p1", { tradeId: "t1" })).toBe(
      "/projects/p1/maengelanzeige/print?trade=t1"
    )
  })

  it("addresses a vendor", () => {
    expect(defectNoticeHref("p1", { vendorId: "v1" })).toBe(
      "/projects/p1/maengelanzeige/print?vendor=v1"
    )
  })

  it("prefers the trade when both are given — one notice, one addressee", () => {
    expect(defectNoticeHref("p1", { tradeId: "t1", vendorId: "v1" })).toBe(
      "/projects/p1/maengelanzeige/print?trade=t1"
    )
  })

  it("escapes ids instead of pasting them into the query", () => {
    expect(defectNoticeHref("p 1", { tradeId: "a&b" })).toBe(
      "/projects/p%201/maengelanzeige/print?trade=a%26b"
    )
  })

  it("falls back to the unfiltered page when no axis is chosen", () => {
    expect(defectNoticeHref("p1", {})).toBe("/projects/p1/maengelanzeige/print")
  })
})
