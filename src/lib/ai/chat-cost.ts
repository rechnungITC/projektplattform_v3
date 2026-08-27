/**
 * PROJ-151-α — Kosten einer Unterhaltung beziffern (AC-151.21–.23).
 *
 * V3 hatte bisher Kostendeckel (PROJ-32d), aber keine Preise: Kosten waren
 * begrenzbar, nicht ausdrückbar. Das schließt diese Lib.
 *
 * **Denk-Token zählen als Ausgabe** — aus U-Know als Regel übernommen, nicht
 * als Code. Anbieter rechnen „Thinking" beim Ausgabepreis ab; sie als Eingabe
 * zu zählen ergäbe eine zu niedrige Zahl.
 *
 * Fehlt ein Preis, wird das **gesagt** statt 0 € zu behaupten (AC-151.22). Eine
 * Null wäre von „kostet nichts" nicht zu unterscheiden.
 */

export interface ModelPrice {
  provider: string
  model: string
  input_per_1m: number
  output_per_1m: number
  currency: string
}

export interface TokenUsage {
  provider: string | null
  model: string | null
  token_input: number | null
  token_output: number | null
}

export type ChatCost =
  | { known: true; amount: number; currency: string }
  | { known: false; reason: "no_price" | "no_tokens" }

const PER_MILLION = 1_000_000

/**
 * Kosten einer einzelnen Nutzung. Bewusst eine reine Funktion — sie ist damit
 * ohne Datenbank testbar, und die Rundung liegt an einer Stelle.
 */
export function computeUsageCost(
  usage: TokenUsage,
  prices: ModelPrice[],
): ChatCost {
  if (usage.token_input === null && usage.token_output === null) {
    return { known: false, reason: "no_tokens" }
  }
  if (!usage.provider || !usage.model) {
    return { known: false, reason: "no_price" }
  }

  const price = prices.find(
    (p) => p.provider === usage.provider && p.model === usage.model,
  )
  if (!price) return { known: false, reason: "no_price" }

  const input = ((usage.token_input ?? 0) / PER_MILLION) * price.input_per_1m
  const output = ((usage.token_output ?? 0) / PER_MILLION) * price.output_per_1m

  // Auf Cent runden — mehr Stellen suggerieren eine Genauigkeit, die die
  // Token-Zählung der Anbieter nicht hergibt.
  return {
    known: true,
    amount: Math.round((input + output) * 100) / 100,
    currency: price.currency,
  }
}

/** Summe über eine Unterhaltung. Unbekannte Posten werden gezählt, nicht ignoriert. */
export function sumConversationCost(
  usages: TokenUsage[],
  prices: ModelPrice[],
): { amount: number; currency: string | null; unpriced: number } {
  let amount = 0
  let currency: string | null = null
  let unpriced = 0

  for (const u of usages) {
    const cost = computeUsageCost(u, prices)
    if (cost.known) {
      amount += cost.amount
      // Währungen nicht vermischen: die erste gewinnt, abweichende zählen als
      // unbeziffert. Ein FX-Umrechner gehört nicht in diese Slice.
      if (currency === null) currency = cost.currency
      else if (currency !== cost.currency) unpriced += 1
    } else if (cost.reason === "no_price") {
      unpriced += 1
    }
  }

  return { amount: Math.round(amount * 100) / 100, currency, unpriced }
}
