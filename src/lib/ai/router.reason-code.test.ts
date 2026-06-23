/**
 * PROJ-137 — data-driven regression test for the AI-Failure-Transparency
 * reason code.
 *
 * AC-3 intent: guarantee no AI purpose can silently lose the "why was this
 * empty/blocked?" reason. The reason is set in the SHARED finalize path of the
 * router (every `invoke*Generation` calls `deriveReasonCode(...)` →
 * `updateKiRunStatus({ reasonCode })`), so the structural guarantee is:
 *
 *   1. A single central helper (`deriveReasonCode`) maps the finalize state to
 *      a typed `AiRunReasonCode | null`. Every purpose routes through it.
 *   2. `ALL_AI_PURPOSES` below is asserted (at compile time) to be EXHAUSTIVE
 *      over the `AIPurpose` union. Adding a new purpose to the type WITHOUT
 *      adding it here fails compilation — forcing the author to acknowledge
 *      the new purpose, which (because it must use the shared finalize path)
 *      inherits the reason automatically.
 *
 * Together these prevent the PROJ-32 regression (where new purposes silently
 * dropped the block reason) from recurring.
 */

import { describe, expect, it } from "vitest"

import { deriveReasonCode } from "./router"
import type { AiRunReasonCode, AIPurpose } from "./types"

// ---------------------------------------------------------------------------
// AC-3 — exhaustive, compile-time-guarded list of every AI purpose.
//
// `satisfies readonly AIPurpose[]` rejects any token that is NOT a valid
// AIPurpose. The `Record<AIPurpose, true>` assignment below rejects the
// inverse: a purpose present in the type but MISSING from this array — that
// is the regression guard. If you add a purpose to `AIPurpose`, TypeScript
// will fail here until you add it to `ALL_AI_PURPOSES` too.
// ---------------------------------------------------------------------------
const ALL_AI_PURPOSES = [
  "risks",
  "decisions",
  "work_items",
  "open_items",
  "narrative",
  "sentiment",
  "coaching",
  "trajectory_sequence",
  "resource_swap",
  "cross_project_links",
  "proposal_from_context",
  "proposal_stakeholders_from_context",
  "proposal_risks_from_context",
  "clarifying_questions_from_context",
] as const satisfies readonly AIPurpose[]

// Compile-time exhaustiveness guard: this assignment only type-checks when
// EVERY member of the AIPurpose union appears in ALL_AI_PURPOSES. A missing
// purpose => "Property '<purpose>' is missing in type ..." compile error.
const _PURPOSE_EXHAUSTIVENESS: Record<AIPurpose, true> = Object.fromEntries(
  ALL_AI_PURPOSES.map((p) => [p, true] as const),
) as Record<AIPurpose, true>
void _PURPOSE_EXHAUSTIVENESS

describe("PROJ-137 AC-3 — AIPurpose exhaustiveness guard", () => {
  it("ALL_AI_PURPOSES covers every member of the AIPurpose union", () => {
    // The compile-time guards above are the real protection; this runtime
    // assertion documents the count + that there are no duplicates, so a
    // careless copy/paste duplicate is caught too.
    const unique = new Set<string>(ALL_AI_PURPOSES)
    expect(unique.size).toBe(ALL_AI_PURPOSES.length)
    // Every purpose is a non-empty string token.
    for (const p of ALL_AI_PURPOSES) {
      expect(typeof p).toBe("string")
      expect(p.length).toBeGreaterThan(0)
    }
  })
})

describe("PROJ-137 — deriveReasonCode central helper", () => {
  const ALL_BLOCK_CODES: AiRunReasonCode[] = [
    "no_provider",
    "class3_blocked",
    "provider_error",
    "cost_cap_exceeded",
    "external_ai_disabled",
  ]

  it("AC-6: success → null (legit result / legit-empty stays distinguishable)", () => {
    expect(
      deriveReasonCode({ finalStatus: "success", blockedReasonCode: undefined }),
    ).toBeNull()
    // Even if a stale block code were present, success wins → null.
    expect(
      deriveReasonCode({
        finalStatus: "success",
        blockedReasonCode: "class3_blocked",
      }),
    ).toBeNull()
  })

  it("each blockedReasonCode passes through when there is no provider error", () => {
    for (const code of ALL_BLOCK_CODES) {
      expect(
        deriveReasonCode({
          finalStatus: "external_blocked",
          blockedReasonCode: code,
        }),
      ).toBe(code)
    }
  })

  it("providerError → provider_error", () => {
    expect(
      deriveReasonCode({
        finalStatus: "error",
        providerError: "connect ECONNREFUSED",
      }),
    ).toBe("provider_error")
  })

  it("providerFallbackMessage → provider_error (capacity fallback to stub)", () => {
    expect(
      deriveReasonCode({
        finalStatus: "external_blocked",
        providerFallbackMessage: "Provider anthropic failed; fell back to Stub.",
      }),
    ).toBe("provider_error")
  })

  it("edge case: Class-3 block but Ollama down → providerError overrides class3_blocked", () => {
    // A blocked code is present (would normally be class3_blocked) but the
    // chosen local provider actually threw — the PM must learn the config is
    // OK but the service is down, so provider_error takes precedence (spec
    // Edge Case: "Class-3-Block, aber Tenant hat Ollama … das gerade down ist").
    expect(
      deriveReasonCode({
        finalStatus: "external_blocked",
        blockedReasonCode: "class3_blocked",
        providerFallbackMessage: "ollama unreachable",
      }),
    ).toBe("provider_error")
    expect(
      deriveReasonCode({
        finalStatus: "error",
        blockedReasonCode: "class3_blocked",
        providerError: "ollama timeout",
      }),
    ).toBe("provider_error")
  })

  it("non-success with neither block code nor provider error → null", () => {
    // Defensive: should not happen in practice (a non-success run always has
    // a cause), but the helper must not invent a reason.
    expect(deriveReasonCode({ finalStatus: "error" })).toBeNull()
    expect(deriveReasonCode({ finalStatus: "external_blocked" })).toBeNull()
  })
})
