# PROJ-91: AI Backlog Grounding in Project Intent (Wizard-Vorhaben)

## Status: Deployed
**Created:** 2026-06-09
**Last Updated:** 2026-06-10
**Origin:** Live prod finding 2026-06-09 (PROJ-86 verification session)
**Priority:** P1 — generation-quality fix for PROJ-70

## Summary
The PROJ-70 AI backlog generation extracts items from the uploaded kickoff document but **never sees the project's own goal** (the "Vorhaben" the user entered in the wizard, stored in `projects.description`). So the AI cannot tell whether the document even matches the project — it just transcribes whatever the kickoff says. This slice feeds the project intent into the generation context and prompt (**grounding**) and adds a per-item **relevance flag** so off-goal items are visibly marked while still shown (user-locked behaviour: "Grounding + Relevanz-Flag").

## Problem / Context
Live evidence (prod, 2026-06-09): project **"ERP Implementierung"** has `description` = *"Wir wollen ein neues ERP System auf Basis von MS Dynamics einführen"*. The uploaded kickoff was about *"Softwareplattform zur Erfassung von Webseiten-Verstößen und Leadgenerierung für Datenschutzberatung"* — a **completely different project**. The AI generated a backlog for the website-compliance platform without any signal that it has nothing to do with the ERP goal.

Root cause: `collectProposalFromContextAutoContext` (`src/lib/ai/auto-context.ts`) selects only `id, name, project_type, project_method, lifecycle_status` from `projects` — **not** `description`. The shared prompt (`buildProposalFromContextPrompt` + `PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT` in `src/lib/ai/providers/graph-purpose-prompts.ts`) therefore frames the backlog by name/type/method only. There is no representation of the project intent to validate against.

## User Stories
- As a PM, I want the AI to know my project goal when it reads the kickoff, so that the proposed backlog serves what I actually set out to do.
- As a PM, I want items that don't fit my project goal to be clearly flagged (not hidden), so that I can reject off-topic suggestions at a glance.
- As a PM who uploaded the wrong document, I want the off-goal flags to make that obvious, so that I notice the mismatch instead of accepting an unrelated backlog.

## Acceptance Criteria
- [x] **AC-91.1**: `collectProposalFromContextAutoContext` selects `description` and `ProposalFromContextAutoContext.source_project` carries `description: string | null`. ✅
- [x] **AC-91.2**: `buildProposalFromContextPrompt` renders a "Vorhaben (Projektziel …)" block before the kickoff content; when `description` is null/empty it emits a "Kein Vorhaben hinterlegt → relevance=on_goal" note. ✅ (2 prompt tests)
- [x] **AC-91.3**: System prompt instructs grounding in the Vorhaben + per-item relevance assessment (shared + Ollama-local prompt). ✅
- [x] **AC-91.4**: Suggestion schema + `ProposalFromContextSuggestion` type gain `relevance` (`on_goal | off_goal`), distinct from `confidence`; off-goal items kept, not suppressed. ✅
- [x] **AC-91.5**: `relevance` mapped through provider output → persisted in `ki_suggestions.payload` (JSON, no migration) → "≠ Ziel" badge in `backlog-proposal-tree-node.tsx` (optional on read for pre-PROJ-91 rows). ✅
- [x] **AC-91.6**: Shared prompt/schema/mapper updated once for anthropic/openai/google; Ollama's replicated local schema/prompt/mapper updated to match; stub stays schema-compatible (emits []). ✅
- [x] **AC-91.7**: Live re-test against prod ✅ (2026-06-10, after iteration-2 prompt fix, v1.83.0). **Both directions proven on prod (openai/gpt-4o, classification 2):** (a) divergent website-compliance kickoff (excerpt MD5 `fa98338e…`) → ki_run `8ae0ba6a`: 15/15 items kickoff-derived (Crawler, Cookie-/Consent-Prüfung, Lead-Scoring, CRM-Export …) and **all flagged `off_goal`**; (b) counter-probe with a matching ERP kickoff (`[TEST PROJ-91]` source, cleaned up after) → ki_run `688141ff`: 7/7 verbatim-extracted items **all `on_goal`** — no inverse over-flagging. Note: the first re-test (pre-fix run e0f6f257, 2026-06-09) had FAILED the intent — grounding over-steered, model invented an on-goal ERP backlog (8/8 on_goal, off_goal never fired); fixed by iteration 2.
- [x] **AC-91.8** (defense-in-depth): the project `description` is now sent to the provider, so `classifyProposalFromContextAutoContext` also runs `detectClass3Markers` on it — a description carrying personal markers forces Class-3/Ollama routing. ✅ (keeps invariant #3 intact)

## Edge Cases
- Project has no `description` → no grounding block; relevance falls back to document-based judgement (default `on_goal`), no spurious off-goal flags.
- Mixed document (partly on-goal, partly off-goal) → per-item flags differ; the tree shows both.
- Very short / generic goal → grounding still applied but relevance leans `on_goal` unless an item clearly contradicts the goal.

## Non-Goals / Out of Scope
- Hard-blocking or refusing generation on mismatch (user chose "flag, don't block" — no gate).
- Dialogic wizard clarifying questions (separate gap, flagged in PROJ-90 Next/Later).
- Changing the Class-3 routing or the classifier (PROJ-86 owns that).
- Pulling richer wizard fields beyond `projects.description` (only `description` exists today; revisit if the wizard later persists structured goals/scope).

## Dependencies
- Requires: PROJ-86 (classifier fix — so generation actually runs), PROJ-70 (the generation pipeline + shared prompt module + tree node).
- Related: PROJ-90 (orchestration will inherit the grounded prompt); PROJ-87 (surfacing — the off-goal badge benefits from the Backlog/Gantt entry).

## Tech Design (Solution Architect)
**Added:** 2026-06-09 · Pure library/prompt change — **no migration** (relevance lives in the existing `ki_suggestions.payload` JSON), **no new dependency**.

### Touch points (all centralized — no per-provider drift)
```
src/lib/ai/auto-context.ts        → add `description` to projects select + return
src/lib/ai/types.ts               → source_project.description: string | null
                                     + ProposalFromContextSuggestion.relevance
src/lib/ai/providers/
  graph-purpose-prompts.ts        → schema (+relevance), system prompt (+grounding
                                     rules), buildProposalFromContextPrompt (+Vorhaben
                                     block), mapper (+relevance)
src/lib/ai/providers/stub.ts      → emit schema-compatible relevance (default on_goal)
src/components/projects/ai-proposals/
  backlog-proposal-tree-node.tsx  → off-goal badge ("≠ Ziel")
+ co-located tests (graph-purpose-prompts, classify-proposal unaffected)
```
The four cloud/local providers (`anthropic/openai/google/ollama`) all call the shared `buildProposalFromContextPrompt` + `ProposalFromContextResponseSchema` + `mapProposalFromContextSuggestions`, so a single change covers them.

### Relevance vs confidence (two axes, kept separate)
- `confidence` (existing): how clearly the item is grounded in the **document**.
- `relevance` (new): whether the item serves the **project goal**. Values `on_goal | off_goal`. Off-goal items are surfaced with a badge, never dropped — the human reviews.

### Prompt strategy
- `buildProposalFromContextPrompt`: insert a "Vorhaben (Projektziel)" line carrying `source_project.description` directly under the project header, before the kickoff content. Omit the line entirely when description is null/empty.
- System prompt: add rules — (1) ground every item in the stated Vorhaben; (2) set `relevance=off_goal` for items that come from the kickoff but do not serve the Vorhaben (do NOT suppress them); (3) when no Vorhaben is provided, judge relevance from the document alone and default to `on_goal`.

### Live re-test (AC-91.7)
Re-generate the existing ERP project against the website-compliance kickoff → expect the items flagged `off_goal`; confirm via fresh `ki_runs` + payload inspection. Mirrors the "Live-RPC-Smoke Pflicht" convention.

### Handoff
Backend/library + one small UI badge → `/backend` (badge is a trivial presentational add; no standalone `/frontend` slice needed).

## Implementation Notes — 2026-06-09 (/backend)
- **`src/lib/ai/auto-context.ts`**: `collectProposalFromContextAutoContext` selects + returns `description`.
- **`src/lib/ai/types.ts`**: `source_project.description: string | null`; `ProposalFromContextSuggestion.relevance: "on_goal" | "off_goal"` (required, two-axis model documented).
- **`src/lib/ai/providers/graph-purpose-prompts.ts`** (shared, used by anthropic/openai/google): schema `+relevance`; system prompt `+grounding/relevance` rules; `buildProposalFromContextPrompt` `+Vorhaben` block (or no-Vorhaben note); mapper `+relevance`.
- **`src/lib/ai/providers/ollama.ts`**: the replicated local schema/system-prompt/prompt-builder/mapper updated to match (cloud↔local drift avoided).
- **`src/lib/ai/classify.ts`**: AC-91.8 — `classifyProposalFromContextAutoContext` also classifies `description` (defense-in-depth, since it now leaves the RLS layer for the provider).
- **`src/lib/ai-proposals/proposal-from-context-api.ts`**: FE payload `relevance?` (optional for pre-PROJ-91 rows).
- **`src/components/projects/ai-proposals/backlog-proposal-tree-node.tsx`**: rose "≠ Ziel" badge when `relevance === "off_goal"`.
- **Tests**: `+relevance` in mapper-test fixtures + assertions; new `buildProposalFromContextPrompt` grounding tests (Vorhaben present / absent); classify fixture `+description`.
- **No migration, no new dependency.** Blast radius confined to the proposal_from_context path.
- **Quality gates**: lint 0; tsc 13 baseline / 0 new; vitest **1746/1746**; build clean.
- **AC-91.7 (live)**: pending deploy — to confirm with a real re-generation + `ki_runs`/payload inspection.

## Implementation Notes — 2026-06-10 (iteration 2: grounding over-steer fix, CIA-reviewed)
- **Live A/B finding (AC-91.7 re-test)**: identical kickoff (excerpt MD5 `fa98338e…`, content = website-compliance platform) on the ERP project. Pre-PROJ-91 run ebd7e151 (2026-06-08 21:42): website backlog, no relevance. Post-PROJ-91 run e0f6f257 (2026-06-09 13:09): **generic ERP backlog, 8/8 `on_goal` — `off_goal` never fired**. The model discarded the kickoff and invented items from the Vorhaben → mirror-image of the original bug, violating source traceability (architecture principle #2).
- **Root cause**: prompt wording made the Vorhaben a *generation source* ("richte deine Vorschläge primär am Vorhaben aus" in the shared system prompt; "richte die Vorschläge hieran aus" in the user-prompt label).
- **Fix (prompt-only, CIA do-now #1)**: shared system prompt grounding rule replaced with "Extrahiere Items AUSSCHLIESSLICH aus dem Kickoff-Dokument. Erfinde KEINE Items aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für `relevance`, NIE eine Quelle für Items."; user-prompt label → "NUR Bewertungsmaßstab für relevance, KEINE Quelle für Items". Ollama replicate mirrored (`ollama.ts`). No schema/mapper/API change.
- **Regression guard (CIA do-now #2, PROJ-86 pattern "invert the bug-cementing test")**: 2 new contract tests in `graph-purpose-prompts.test.ts` assert the yardstick-only invariant phrases AND the absence of the generation-imperative wording — on the shared prompt **and** the Ollama replicate (both exported for this). The old string-contains tests alone had cemented the faulty wording.
- **Track invariant (CIA)**: "Vorhaben/Projektziel ist IMMER nur Bewertungs-Achse, NIE Generierungsquelle" — to be carried as a mandatory AC into PROJ-88/89. Deferred: live-eval harness against a stored divergent kickoff fixture → PROJ-92 candidate.
- **Quality gates (iteration 2)**: lint 0; tsc 13 baseline / 0 new; vitest **1748/1748** (+2 contract tests); build clean.

## QA Test Results
_To be added by /qa_

## Deployment — 2026-06-10
- Iteration 1 (grounding + relevance plumbing): PR #107 → main (665fa36), live since 2026-06-09.
- Iteration 2 (over-steer fix + contract tests, CIA-reviewed): PR #110 → main (298b0b5), tag `v1.83.0-PROJ-91-grounding-fix`, Vercel production deployment `dpl_AaDwD6LFNC8rxwT74yo3ChghwSuG` READY.
- AC-91.7 live-verified post-deploy via two real prod generation runs (see AC list): divergent kickoff → 15/15 `off_goal`; matching kickoff → 7/7 `on_goal`. Synthetic counter-probe artifacts (`[TEST PROJ-91]` context source + its draft suggestions) cleaned up; ki_runs kept as audit records. The 15 real `off_goal` drafts remain reviewable in the drawer (with "≠ Ziel" badge) for the PM.
- Track invariant for PROJ-88/89 (CIA): "Vorhaben/Projektziel ist IMMER nur Bewertungs-Achse, NIE Generierungsquelle" — must become a mandatory AC in both specs. Deferred: live-eval harness (PROJ-92 candidate).
