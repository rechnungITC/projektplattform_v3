# PROJ-89: AI Risk Proposals from Context

## Status: Planned
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Origin:** CIA portfolio review 2026-06-08 (vision: "Wizard befüllt das ganze Projekt")
**Priority:** P1 — Should-have

## Summary
Adds a new AI purpose `proposal_risks_from_context` that derives **risk proposals from the uploaded kickoff document** and persists accepted ones into the PROJ-20 risks backbone. This is distinct from the existing PROJ-12 `risks` purpose, which generates from the project's auto-collected context — not from an uploaded source. Built as a **sibling of PROJ-70** (same router/drawer/accept/undo/provenance mechanics) and **not** dependent on the skill framework (PROJ-76–81). Risk text is generally non-personal, so this purpose is **Class-2-capable** → cloud providers are allowed once PROJ-86 has fixed the false-positive classification.

## Problem / Context
The platform can already generate risks (PROJ-12 `risks` purpose → `invokeRiskGeneration`), but only from the project's internal auto-context. The user's vision is that the kickoff document itself yields risk proposals (e.g. "Vollautomatische Rechtsbewertung", regulatory exposure, dependency on third-party tracking) directly after the wizard. There is currently no path from a `context_source` to risk suggestions.

## User Stories
- As a PM, I want the AI to read my kickoff document and propose project risks it implies, so that the risk register starts populated instead of empty.
- As a PM, I want accepted risk proposals to land in the existing risks module with full provenance, so that they behave like any other risk (cross-link, mitigation, audit).
- As a Compliance officer, I want risk extraction to obey the same Class-3 routing rule, so that a kickoff containing personal data still routes locally.

## Acceptance Criteria
- [ ] **AC-89.1**: A new `AIPurpose` value `proposal_risks_from_context` is added to `src/lib/ai/types.ts` and wired through the router with a dedicated `invoke…` helper (mirrors `invokeProposalFromContextGeneration`).
- [ ] **AC-89.2**: Classification follows the standard path — Class-1/2 content routes to the tenant's cloud provider; if the source is (correctly, post-PROJ-86) Class-3, it routes to Ollama-only.
- [ ] **AC-89.3**: Generated suggestions map onto the PROJ-20 risk shape (title, description, and risk-relevant fields) and persist as `draft` on accept.
- [ ] **AC-89.4**: A bulk-accept RPC persists accepted risks with `ki_provenance` trace and a 30s-undo window (PROJ-70-β pattern).
- [ ] **AC-89.5**: Accepted risks appear in the existing risks module (PROJ-20) — not a parallel store — and are distinguishable as AI-derived via provenance/review state.
- [ ] **AC-89.6**: Clear delineation from the PROJ-12 `risks` purpose is documented (source-driven vs. project-context-driven); the two do not collide.
- [ ] **AC-89.7**: Every AI-derived risk carries a review state and provenance — no silent mutation (invariant #2).
- [ ] **AC-89.8**: A drawer tab surfaces these proposals (consumed by PROJ-90; standalone tab acceptable in this slice).

## Edge Cases
- Document implies a risk already present in the register → propose a link/update rather than a duplicate.
- Source classified Class-3 (real PII) but tenant has no Ollama → `external_blocked` with actionable message (consistent with PROJ-88).
- Vague/low-signal document → return few or zero risks rather than fabricated ones; zero is a valid, clearly-communicated outcome.

## Non-Goals / Out of Scope
- Budget extraction (PROJ-82 / skill framework).
- The orchestrated multi-module flow (PROJ-90).
- Changing or replacing the existing PROJ-12 `risks` purpose.
- Quantitative risk scoring beyond what PROJ-20 already models.

## Dependencies
- Requires: PROJ-86 (classifier correctness so Class-2 docs reach cloud), PROJ-20 (risks backbone), PROJ-70 (sibling mechanics), PROJ-12 (router + existing `risks` purpose to delineate against).
- Unblocks: PROJ-90 (orchestration).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
