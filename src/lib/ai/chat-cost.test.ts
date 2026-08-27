import { describe, expect, it } from "vitest"

import { computeUsageCost, sumConversationCost } from "./chat-cost"

const PRICES = [
  { provider: "openai", model: "gpt-4o", input_per_1m: 2.5, output_per_1m: 10, currency: "EUR" },
]

describe("computeUsageCost", () => {
  it("rechnet Eingabe und Ausgabe getrennt ab", () => {
    const cost = computeUsageCost(
      { provider: "openai", model: "gpt-4o", token_input: 1_000_000, token_output: 1_000_000 },
      PRICES,
    )
    expect(cost).toEqual({ known: true, amount: 12.5, currency: "EUR" })
  })

  it("sagt 'kein Preis' statt 0 € zu behaupten", () => {
    const cost = computeUsageCost(
      { provider: "anthropic", model: "unbekannt", token_input: 100, token_output: 100 },
      PRICES,
    )
    expect(cost).toEqual({ known: false, reason: "no_price" })
  })

  it("unterscheidet 'kein Preis' von 'keine Token'", () => {
    expect(
      computeUsageCost(
        { provider: "openai", model: "gpt-4o", token_input: null, token_output: null },
        PRICES,
      ),
    ).toEqual({ known: false, reason: "no_tokens" })
  })

  it("rundet auf Cent — mehr Stellen suggerieren falsche Genauigkeit", () => {
    const cost = computeUsageCost(
      { provider: "openai", model: "gpt-4o", token_input: 3333, token_output: 0 },
      PRICES,
    )
    expect(cost).toEqual({ known: true, amount: 0.01, currency: "EUR" })
  })
})

describe("sumConversationCost", () => {
  it("zählt unbezifferbare Posten, statt sie zu verschweigen", () => {
    const sum = sumConversationCost(
      [
        { provider: "openai", model: "gpt-4o", token_input: 1_000_000, token_output: 0 },
        { provider: "ollama", model: "qwen", token_input: 500, token_output: 500 },
      ],
      PRICES,
    )
    expect(sum).toEqual({ amount: 2.5, currency: "EUR", unpriced: 1 })
  })

  it("vermischt keine Währungen — abweichende gelten als unbeziffert", () => {
    const sum = sumConversationCost(
      [
        { provider: "openai", model: "gpt-4o", token_input: 1_000_000, token_output: 0 },
        { provider: "x", model: "y", token_input: 1_000_000, token_output: 0 },
      ],
      [...PRICES, { provider: "x", model: "y", input_per_1m: 1, output_per_1m: 1, currency: "USD" }],
    )
    expect(sum.currency).toBe("EUR")
    expect(sum.unpriced).toBe(1)
  })

  it("liefert bei leerer Unterhaltung eine ehrliche Null ohne Währung", () => {
    expect(sumConversationCost([], PRICES)).toEqual({ amount: 0, currency: null, unpriced: 0 })
  })
})
