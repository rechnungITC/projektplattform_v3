# PROJ-135: Dialogic Wizard Clarifying Questions (AI-Rückfragen vor der Generierung)

## Status: Planned
**Created:** 2026-06-16
**Last Updated:** 2026-06-16
**Origin:** PROJ-90 "Next/Later" — promoted to its own spec (user-requested 2026-06-16)
**Priority:** P1 — sharpens the PROJ-86–91 AI-bootstrap output

## Summary
Today the wizard's follow-up questions (PROJ-5) are **rule-based** from the PROJ-6 catalog — they do not look at the uploaded kickoff document. This feature adds an **AI clarifying-question round** inside the wizard, **before finalize**: after the user uploads a kickoff artefact, the AI reads the document + the Vorhaben (`projects.description`) and asks **one round of a few targeted questions** about the gaps and ambiguities it found. The user answers what they want (each question skippable), and the answers are stored as a **structured context addendum** that the downstream generation (PROJ-70 backlog, PROJ-88 stakeholders, PROJ-89 risks, orchestrated via PROJ-90) reads — producing higher-quality, more goal-aligned proposals.

It reuses the existing AI-router machinery (purpose-based `invoke…`, Class-3 routing, cost-cap, no silent mutation). It introduces **no autonomous agent loop** and **no business-data mutation** — the only output is reviewable Q&A text attached to the context source.

## Problem / Context
The AI-bootstrap track (PROJ-86–91) can now generate a whole project from a kickoff document, but the quality ceiling is the **input**: a thin or ambiguous kickoff yields thin or off-target proposals. The wizard's existing follow-ups are generic catalog questions (PROJ-6), blind to the actual document. There is no step where the AI says "your kickoff doesn't mention a go-live date / budget owner / target system — can you clarify?" before it generates. This feature closes that gap with a single, controlled clarifying round that enriches the context the generation already consumes.

## Locked scope decisions (user, 2026-06-16)
1. **Trigger point:** inside the wizard, **before finalize** — a new optional step after the kickoff upload (mirrors the existing optional `ki_backlog` step).
2. **Answer sink:** answers become a **structured context addendum** attached to the kickoff `context_source`; the Vorhaben (`projects.description`) is **NOT** modified — preserving the PROJ-91 track invariant (Vorhaben = relevance yardstick only, never a generation source).
3. **Dialog shape:** **one round** of a few (3–6) targeted, **individually skippable** questions — one AI call, deterministic, testable. No multi-turn agent loop.
4. **Class-3 behaviour:** the question-generation is its own AI purpose routed through the **standard resolver** (Class-1/2 → cloud, Class-3/PII → Ollama-only). If the source is Class-3 and no local provider is configured, the clarifying step is **gracefully skipped** (never blocks the wizard); generation proceeds as before. Consistent with PROJ-88/89.

## User Stories
- As a PM uploading a kickoff in the wizard, I want the AI to ask me a few pointed questions about gaps it found in my document, so that the project it generates afterwards is sharper and more complete.
- As a PM, I want every clarifying question to be optional (skippable), so that the wizard never stalls on a question I can't or don't want to answer.
- As a PM, I want my answers to visibly feed the generation (backlog/stakeholders/risks), so that answering feels worthwhile rather than busywork.
- As a Compliance officer, I want the clarifying round to obey the same Class-3 routing as the rest of the AI bootstrap, so that a kickoff containing personal data keeps its Q&A local.
- As a PM with no kickoff document, I want the clarifying step to simply not appear, so that the wizard stays short for the manual path.

## Acceptance Criteria
- [ ] **AC-135.1**: A new `AIPurpose` value (e.g. `clarifying_questions_from_context`) is added and wired through the router with a dedicated `invoke…` helper (mirrors `invokeProposalFromContextGeneration`): it takes the kickoff context (excerpt + Vorhaben + project frame) and returns **0–6 clarifying questions**, each with a short prompt text and an optional rationale/gap-tag.
- [ ] **AC-135.2**: Classification follows the **standard path** — Class-1/2 kickoff → cloud provider; Class-3 (PII, post-PROJ-86 detection or stamped `privacy_class`) → Ollama-only via the resolver clamp (no hard-pin — PROJ-93 forward-compat).
- [ ] **AC-135.3**: A new **optional wizard step** appears only when a kickoff source was uploaded (mirrors the `ki_backlog` step visibility); it renders the generated questions with a free-text answer field per question and a clear **"überspringen"** affordance per question and for the whole step.
- [ ] **AC-135.4**: On finalize, the answered questions are persisted as a **structured Q&A addendum** on the kickoff `context_source` (e.g. in `source_metadata`), **without** modifying `projects.description`. Unanswered/skipped questions are omitted from the addendum.
- [ ] **AC-135.5**: The downstream generation purposes (PROJ-70/88/89) **read the Q&A addendum** as part of their auto-context, so accepted proposals reflect the clarifications. The PROJ-91 track invariant is preserved: the Vorhaben stays the relevance yardstick; the addendum is treated as additional **kickoff-derived** source material, not as a generation goal.
- [ ] **AC-135.6**: **No silent mutation / full auditability** — the clarifying run is recorded as a `ki_run` (purpose, classification, provider, tokens, status) like every other AI call; the Q&A addendum is reviewable text, not a business record. No `work_items`/`stakeholders`/`risks` are created by this step (invariant #2).
- [ ] **AC-135.7**: **Graceful skip / non-blocking** — if question generation errors, returns zero questions, is `external_blocked` (Class-3 without Ollama), or hits the cost cap, the step shows a clear, non-blocking message and the user can proceed to finalize; generation downstream is unaffected. No all-or-nothing.
- [ ] **AC-135.8**: **Cost-cap respected** — the clarifying purpose is gated by the existing per-purpose cost-cap mechanism (its own purpose row, NULL-purpose fallback), like the other AI purposes.

## Edge Cases
- No kickoff uploaded → the clarifying step is not shown at all (manual wizard path unchanged).
- Kickoff is thin/empty → AI returns 0 questions → step auto-skips with a brief "keine Rückfragen nötig" note, or is not shown.
- User skips every question → no addendum is written; generation runs on the original context (identical to today).
- Class-3 kickoff, no Ollama → step shows "lokaler Provider erforderlich – übersprungen" and lets the user finalize; downstream generation still respects Class-3.
- User edits an AI question's intent by answering tangentially → the answer is stored verbatim; the AI is told (in the downstream prompt) these are user clarifications, grounding still requires kickoff-derived items.
- Wizard draft is saved mid-clarifying-step and resumed → answered questions survive in the draft (no re-generation forced unless the user re-triggers).
- Generate-All triggered twice / wizard re-finalize → the clarifying run is not duplicated; the addendum is idempotently overwritten by the latest answered set.

## Non-Goals / Out of Scope
- **Multi-turn / autonomous agent dialog** — explicitly excluded; one controlled round only.
- **Modifying the Vorhaben** (`projects.description`) from answers — excluded to preserve the PROJ-91 invariant.
- **Post-finalize re-run in the PROJ-90 conductor** — out of this slice (the locked trigger is the wizard); can be promoted later if pilot demand appears.
- **New extraction targets** (budget, schedule auto-fill) — stays with their owning specs.
- **Replacing the PROJ-6 rule-based follow-ups** — the AI clarifying round is additive, not a replacement of the catalog questions.

## Dependencies
- Requires: PROJ-86 (classifier correctness so Class-2 kickoffs reach cloud), PROJ-70 (`context_source` + proposal-from-context auto-context that will read the addendum), PROJ-5 (wizard step framework + draft persistence), PROJ-12 (AI router, `ki_runs`, cost-cap), PROJ-91 (track invariant the addendum must respect).
- Relates to: PROJ-90 (the orchestrated generation that benefits from the sharpened context), PROJ-88/89 (also consume the enriched context).
- Unblocks: higher proposal quality across the whole AI-bootstrap track.

## Technical Requirements (optional)
- The clarifying step must not add a hard dependency that blocks finalize — it is always skippable and fail-open.
- No new npm dependency expected (reuses the AI SDK + router stack); a CIA review is warranted at `/architecture` because this introduces a **new AI purpose + a new wizard interaction pattern**.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
