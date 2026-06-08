# PROJ-88: AI Stakeholder Proposals from Context

## Status: Planned
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Origin:** CIA portfolio review 2026-06-08 (vision: "Wizard befüllt das ganze Projekt")
**Priority:** P1 — Should-have

## Summary
Extends the "auto-generate from kickoff" capability beyond work items: a new AI purpose `proposal_stakeholders_from_context` extracts stakeholders mentioned in a kickoff document and proposes linking them as **Resource / Project Member with a role**, reusing the PROJ-57 participant-resource-linking model. Because stakeholder extraction inherently surfaces personal names, this purpose is **Class-3 by design → Ollama-only** (CLAUDE.md invariant #3, no bypass). It is built as a **sibling of PROJ-70** — same router-invoke, `ki_suggestions`, drawer tab, bulk-accept RPC, 30s-undo, and `ki_provenance` mechanics — and does **not** wait on the skill framework (PROJ-76–81).

## Problem / Context
Today the only AI "from kickoff" output is `work_items` (PROJ-70). The user's vision is that after the wizard the AI also populates stakeholders → resources/project members with roles. PROJ-57 already provides the manual/guided linking model (Tenant Member ↔ Project Member ↔ Stakeholder ↔ Resource ↔ Role ↔ day rate) but there is **no AI-assisted creation of stakeholders from a document**.

Stakeholder data is personal data by definition (names, often emails/phones). Therefore this purpose must never route to a cloud provider; it is locked to local Ollama. Tenants without Ollama will receive a clear "no local provider" block (this is by design, not a fixable error — invariant #3).

## User Stories
- As a PM, I want the AI to read my kickoff document and propose the stakeholders it mentions, so that I don't have to enter them manually.
- As a PM, I want each proposed stakeholder to come with a suggested project role and an optional resource/member link, so that the proposal slots into the existing PROJ-57 structures on accept.
- As a Compliance officer, I want stakeholder extraction to run only on the tenant-local Ollama endpoint, so that personal names never reach a cloud LLM.
- As a tenant admin without Ollama, I want a clear message that stakeholder extraction needs a local provider, so that I understand why nothing is generated.

## Acceptance Criteria
- [ ] **AC-88.1**: A new `AIPurpose` value `proposal_stakeholders_from_context` is added to `src/lib/ai/types.ts` and wired through the router with a dedicated `invoke…` helper (mirrors `invokeProposalFromContextGeneration`).
- [ ] **AC-88.2**: The purpose is **Class-3-pinned**: the classifier/route returns classification 3 regardless of content, so the router clamps to Ollama-only; cloud providers are never selected.
- [ ] **AC-88.3**: When no Ollama provider is configured, the run records `external_blocked` with an actionable reason and the UI shows a clear "local provider required" message (no silent empty list).
- [ ] **AC-88.4**: Each suggestion carries: stakeholder name + inferred role + optional resource/member link target, structured to map onto the PROJ-57 linking model on accept.
- [ ] **AC-88.5**: A bulk-accept RPC persists accepted stakeholders (+ links) with `ki_provenance` trace and a 30s-undo window, mirroring the PROJ-70-β accept/undo pattern.
- [ ] **AC-88.6**: Accepted items appear as Stakeholders (PROJ-8) and, where a link target was chosen, as Resource/Project-Member with role (PROJ-57) — entered into the existing structures, not a parallel store.
- [ ] **AC-88.7**: Every AI-derived stakeholder carries a review state (draft/accepted/rejected/modified) and provenance — no silent mutation (invariant #2).
- [ ] **AC-88.8**: A drawer tab surfaces these proposals (consumed by PROJ-90's orchestration; standalone tab acceptable in this slice).

## Edge Cases
- Duplicate stakeholder already exists in the project → propose a link/merge rather than a duplicate create.
- Document mentions a role but no clear name → propose an unnamed role placeholder or skip (no fabricated names).
- Ollama configured but unreachable at run time → `error` status with a retry hint (not a silent stub).
- Name extracted but ambiguous (could be a product, e.g. "Microsoft Dynamics") → low-confidence flag so the reviewer can reject easily.

## Non-Goals / Out of Scope
- Budget extraction (stays at PROJ-82 / skill framework).
- The orchestrated multi-module Generate-All/Accept-All flow (that is PROJ-90).
- Any cloud routing of stakeholder data (forbidden by invariant #3).
- Auto-creating tenant memberships / auth identities (Stakeholder ≠ User — invariant #4).

## Dependencies
- Requires: PROJ-86 (classifier correctness for the surrounding flow), PROJ-57 (participant-resource-linking model), PROJ-8 (stakeholders), PROJ-70 (sibling mechanics: router/drawer/accept/undo/provenance), PROJ-32 (Ollama provider config).
- Unblocks: PROJ-90 (orchestration).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
