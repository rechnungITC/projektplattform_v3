# PROJ-85: AI Provider Capability Completeness

## Status: Approved
**Created:** 2026-06-08
**Last Updated:** 2026-06-08

## Summary
Closes the silent-stub-fallback gap in the multi-provider AI router. Each AI purpose is dispatched to the tenant's selected provider; when the provider doesn't implement that purpose's method, the router silently falls back to the `StubProvider` (empty/placeholder output). This hid a real capability gap: the PROJ-65/70 graph purposes (`trajectory_sequence`, `cross_project_links`, `proposal_from_context`) were only implemented on Anthropic, so tenants on OpenAI/Google/Ollama got stub output without any visible signal.

Discovered during the PROJ-70-δ session (a `trajectory_sequence` run on an OpenAI-priority tenant logged "provider openai does not implement … fell back to Stub"). The bulk of the fix — OpenAI + Google implementations of all five cloud-eligible purposes — landed via parallel provider work. This slice closes the **residual** Ollama gap and adds a regression guard so the matrix can't silently degrade again.

## Background — the capability matrix

| Purpose | anthropic | openai | google | ollama | stub | routing class |
|---|---|---|---|---|---|---|
| `risks` | ✅ | ✅ | ✅ | ✅ | ✅ | Class 1/2 |
| `narrative` | ✅ | ✅ | ✅ | ✅ | ✅ | Class 1/2 |
| `trajectory_sequence` | ✅ | ✅ | ✅ | ✅¹ | ✅ | Class 2 advisory |
| `cross_project_links` | ✅ | ✅ | ✅ | ✅¹ | ✅ | Class 2 advisory |
| `proposal_from_context` | ✅ | ✅ | ✅ | ✅ | ✅ | Class 1/2 (+ Class-3 → Ollama) |
| `resource_swap` | ❌² | ❌² | ❌² | ✅ | ✅ | **Class 3 → Ollama-only (by design)** |

¹ Added by this slice (PROJ-85). ² Intentionally absent — `resource_swap` is Class-3 and must only run on the tenant-local Ollama endpoint (PROJ-65 ε.4.β); cloud providers must never receive it.

## Dependencies
- Requires: PROJ-12 (AI router + StubProvider fallback), PROJ-32 (multi-provider key-resolver)
- Requires: PROJ-65 ε.4 (`trajectory_sequence` / `cross_project_links` shared schemas + prompts)
- Builds on: parallel OpenAI/Google capability work (already on `main`)

## Acceptance Criteria

- [x] **AC-85.1**: OpenAI + Google implement `generateTrajectorySequence`, `generateCrossProjectLinks`, `generateProposalFromContext` with real `generateObject` calls (delivered via parallel provider work; verified on `main`).
- [x] **AC-85.2**: `OllamaProvider` implements `generateTrajectorySequence` — reuses the shared `graph-purpose-prompts` schema/prompt/mapper so local output matches cloud shape.
- [x] **AC-85.3**: `OllamaProvider` implements `generateCrossProjectLinks` — same shared-schema reuse; mapper filters hallucinated work-item ids against the request.
- [x] **AC-85.4**: `resource_swap` remains Ollama-only (Class-3); cloud providers do NOT implement it.
- [x] **AC-85.5**: A capability-matrix regression test pins the intended matrix so a future provider regression fails loudly instead of degrading to stub output.

## Out of Scope
- **Capability-aware routing / observable fallback log** — the router keeps its per-purpose `does not implement → StubProvider` fallback. Surfacing those fallbacks as a metric/log is a separate observability follow-up (candidate, not required now that the matrix is complete).
- **`resource_swap` on cloud providers** — deliberately excluded (Class-3 routing invariant).
- New providers beyond the existing four.

## Tech Design (Solution Architect)

### Approach
`generateTrajectorySequence` + `generateCrossProjectLinks` on `OllamaProvider` are thin wrappers over the **shared** `graph-purpose-prompts.ts` schema/prompt/mapper (the exact artefacts the `AnthropicProvider` already uses), invoked through the existing `createOpenAICompatible` → `generateObject` path. No Ollama-local schema variant (unlike `proposal_from_context`, which needed a simplified local schema) — trajectory/cross-links are structured-reasoning purposes where the shared prompt already yields compatible output, and reusing it prevents cloud↔local output drift.

### Why no new dependency / no CIA
Mirrors a deployed pattern (Anthropic's identical methods) on an existing provider via an existing SDK path. No new package, no new persistence/RLS/RPC pattern → CIA not triggered.

## Implementation Notes — 2026-06-08

- **`src/lib/ai/providers/ollama.ts`**: added `generateTrajectorySequence` + `generateCrossProjectLinks` (shared-schema reuse) + the matching type imports. No change to the Class-3 `resource_swap` path.
- **`src/lib/ai/providers/capability-matrix.test.ts`** (new): pins the full matrix — stub implements everything; cloud providers implement all non-Class-3 purposes; `resource_swap` is Ollama-only; Ollama now has the two Class-2 graph purposes. 4 cases, would have caught the original gap.
- **Quality gates**: lint 0/0; tsc clean (the one pre-existing `graph-purpose-prompts.test.ts` error is baseline, unrelated); vitest green; build clean.
- **Residual**: an observable router-fallback log/metric is left as an out-of-scope observability candidate.
