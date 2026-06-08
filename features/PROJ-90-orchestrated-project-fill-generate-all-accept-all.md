# PROJ-90: Orchestrated "Fill the Project" — Multi-Tab Generate-All + Accept-All

## Status: Planned
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Origin:** CIA portfolio review 2026-06-08 (vision: "Wizard befüllt das ganze Projekt")
**Priority:** P1 — Epic bracket over PROJ-87/88/89

## Summary
The epic bracket that delivers the user's core vision: **after the wizard, the AI populates the whole project across modules in one orchestrated flow** — backlog/work items (PROJ-70), stakeholders → resources/members with roles (PROJ-88), and risks (PROJ-89) — landing method-appropriately in the **existing** structures. It implements the locked **"Generate-All + Accept-All"** philosophy: the AI generates proposals across all modules, the user confirms with one click (per module or globally) with a 30s-undo, fully auditable. It explicitly does **not** silently mutate business data (CLAUDE.md invariant #2): everything carries a review state + `ki_provenance`.

## Problem / Context
PROJ-70 (backlog), PROJ-88 (stakeholders), and PROJ-89 (risks) each produce single-purpose proposals in their own drawer tab. The vision is a single post-wizard experience where the user triggers generation once and reviews/accepts everything together. PROJ-70-ε already established a post-finalize deep-link handoff into the backlog drawer; this slice generalizes that into a multi-module orchestration.

**Auto-Apply decision (locked by user, 2026-06-08):** "Generate-All + Accept-All", **not** silent auto-create. The user's "automatically fill" intent is satisfied by a one-click Accept-All over reviewable proposals — which preserves the audit trail and DSGVO provability required by invariant #2.

## User Stories
- As a PM, after finishing the wizard I want one action that generates backlog, stakeholders, and risks from my kickoff document, so that the project is populated without manual entry.
- As a PM, I want to review the generated items in a single multi-tab drawer and accept them per module or all at once, so that "automatic" still means "I stay in control."
- As a PM, I want one undo step right after Accept-All, so that a wrong bulk acceptance is reversible.
- As a Compliance officer, I want every accepted item to carry an AI-origin provenance trace, so that the audit trail is complete.

## Acceptance Criteria
- [ ] **AC-90.1**: A multi-tab drawer (Backlog | Stakeholders | Risks) drives an orchestrated **Generate-All** that runs each purpose **sequentially** with a progress UI and a per-purpose cost-cap check (reusing the existing cap mechanism).
- [ ] **AC-90.2**: A wizard-finalize handoff (extending PROJ-70-ε's post-finalize deep link) opens this orchestrated drawer for the newly created project and can auto-trigger Generate-All.
- [ ] **AC-90.3**: **Accept-All** works per module **and** globally; a single 30s-undo reverts the bulk acceptance across modules.
- [ ] **AC-90.4**: Accepted items land in the existing structures, method-appropriately — work items in Backlog/Gantt per method (Waterfall/Scrum/Hybrid), stakeholders as Resource/Project-Member with role (PROJ-57), risks in the risks module (PROJ-20).
- [ ] **AC-90.5**: No silent mutation — each item is a reviewable proposal with state (draft/accepted/rejected/modified) + `ki_provenance` before it becomes a business record (invariant #2).
- [ ] **AC-90.6**: Class-3 routing is respected end-to-end — stakeholder generation stays Ollama-only; if no local provider, that module reports `external_blocked` while the other modules still proceed.
- [ ] **AC-90.7**: Partial failure isolation — if one purpose errors or is blocked, the others still generate and remain acceptable (no all-or-nothing).

## Edge Cases
- One module blocked (e.g. stakeholders, no Ollama) while others succeed → drawer shows per-module status, Accept-All only acts on available proposals.
- Generate-All triggered twice → in-flight run is not duplicated; second trigger is debounced or queued.
- Large kickoff → sequential generation with progress; cost cap may stop later purposes with a clear message.
- User accepts globally then undoes → all modules' acceptances revert atomically within the undo window.

## Non-Goals / Out of Scope
- **Silent / no-review auto-create** — explicitly excluded by the locked decision + invariant #2.
- Budget generation — stays at PROJ-82 / skill framework, not pulled forward.
- New extraction purposes beyond backlog/stakeholders/risks (future modules can join the orchestration later).

## Next / Later (flagged, not in initial scope)
- **Dialogic wizard clarifying questions** — a real gap surfaced by the audit: PROJ-5 follow-ups are rule-based (PROJ-6 catalog), not an AI dialog. An AI Q&A loop that sharpens the backlog before generation is a strong follow-up but is scoped **out of the initial PROJ-90** to keep it deliverable; promote to its own spec if pursued.

## Dependencies
- Requires: PROJ-87 (drawer surfacing in Backlog/Gantt), PROJ-88 (stakeholder proposals), PROJ-89 (risk proposals), and transitively PROJ-86, PROJ-70, PROJ-57, PROJ-20.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
