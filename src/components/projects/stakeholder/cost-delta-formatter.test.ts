import { describe, expect, it } from "vitest"

import {
  formatCostDelta,
  formatRate,
  formatRiskDelta,
  formatTimeDelta,
} from "./cost-delta-formatter"

describe("formatCostDelta", () => {
  it("renders exact positive cents with + prefix and currency", () => {
    expect(
      formatCostDelta({ kind: "exact", amount_cents: 400_000, currency: "EUR" }),
    ).toBe("+4.000 EUR")
  })
  it("renders exact negative cents without forced minus prefix beyond the value sign", () => {
    expect(
      formatCostDelta({ kind: "exact", amount_cents: -250_000, currency: "EUR" }),
    ).toBe("-2.500 EUR")
  })
  it("renders aggregate buckets with the masked '*' marker", () => {
    expect(formatCostDelta({ kind: "aggregate", bucket: "less" })).toBe(
      "− geringerer Aufwand *",
    )
    expect(formatCostDelta({ kind: "aggregate", bucket: "much-more" })).toBe(
      "+ deutlich höherer Aufwand *",
    )
  })
  it("renders the empty 'none' case as em-dash", () => {
    expect(formatCostDelta({ kind: "none" })).toBe("—")
  })
})

describe("formatTimeDelta", () => {
  it("renders positive days with + prefix and German plural", () => {
    expect(formatTimeDelta(2)).toBe("+2 Tage")
    expect(formatTimeDelta(1)).toBe("+1 Tag")
  })
  it("renders negative days with the value sign", () => {
    expect(formatTimeDelta(-3)).toBe("-3 Tage")
  })
  it("renders zero as ≈", () => {
    expect(formatTimeDelta(0)).toBe("≈")
  })
  it("renders null as em-dash", () => {
    expect(formatTimeDelta(null)).toBe("—")
  })
})

describe("formatRiskDelta", () => {
  it("formats named transitions", () => {
    expect(formatRiskDelta({ kind: "named", from: "mittel", to: "hoch" })).toBe(
      "mittel → hoch",
    )
  })
  it("renders even risk as ≈", () => {
    expect(formatRiskDelta({ kind: "even" })).toBe("≈")
  })
})

describe("formatRate", () => {
  it("renders masked rate with placeholder + asterisk", () => {
    expect(formatRate({ kind: "masked" })).toBe("1.x XX €/PT *")
  })
  it("renders exact rate with localised number + currency", () => {
    expect(
      formatRate({ kind: "exact", amount_cents: 125_000, currency: "EUR" }),
    ).toBe("1.250 EUR/PT")
  })
  it("renders null as em-dash", () => {
    expect(formatRate(null)).toBe("—")
  })
  it("honours a custom unit", () => {
    expect(
      formatRate({
        kind: "exact",
        amount_cents: 12000,
        currency: "EUR",
        unit: "h",
      }),
    ).toBe("120 EUR/h")
  })
})
