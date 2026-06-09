# PROJ-91: AI Backlog Grounding in Project Intent (Wizard-Vorhaben)

## Status: Architected
**Created:** 2026-06-09
**Last Updated:** 2026-06-09
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
- [ ] **AC-91.1**: `collectProposalFromContextAutoContext` includes `projects.description` and the type `ProposalFromContextAutoContext.source_project` carries `description: string | null`.
- [ ] **AC-91.2**: `buildProposalFromContextPrompt` renders the project intent prominently (e.g. a "Vorhaben/Projektziel" block) before the kickoff content; when `description` is null/empty it degrades gracefully (no grounding line, relevance defaults to on-goal-by-document).
- [ ] **AC-91.3**: `PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT` instructs the model to ground every item in the project intent and to assess each item's relevance to it.
- [ ] **AC-91.4**: The suggestion schema gains a `relevance` field (`"on_goal" | "off_goal"`) — distinct from the existing `confidence` (confidence = "is it in the document"; relevance = "does it serve the project goal"). Off-goal items are **kept**, not suppressed.
- [ ] **AC-91.5**: The relevance value is mapped through the provider output, persisted in the `ki_suggestions` payload (JSON — no migration), and surfaced as a visible "≠ Ziel"/off-goal badge in the backlog proposal tree node.
- [ ] **AC-91.6**: All four providers (anthropic/openai/google/ollama) reuse the shared updated prompt + schema (no per-provider drift); the stub provider stays schema-compatible.
- [ ] **AC-91.7**: Live re-test against prod — re-generating the ERP project against the website-compliance kickoff yields items predominantly flagged `off_goal`; a matching kickoff yields `on_goal`. Verified via a fresh `ki_runs` row + suggestion payloads.

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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
