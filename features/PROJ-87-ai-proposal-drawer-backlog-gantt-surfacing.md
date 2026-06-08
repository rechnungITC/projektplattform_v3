# PROJ-87: AI Proposal Drawer — Surfacing in Backlog + Gantt

## Status: Planned
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Origin:** CIA portfolio review 2026-06-08
**Priority:** P1 — Should-have (no new backend code)

## Summary
The PROJ-70 AI-backlog generation is fully built but the user can only reach it through the trajectory **graph** view, where the `AIProposalDrawer` is the only mount point. Project managers work in the **Backlog** and **Gantt/Arbeitspakete** views — those should carry the entry point so AI proposals land where they are needed. This slice adds the drawer entry to Backlog + Gantt; it reuses the existing PROJ-70 routes and drawer props, so it is **frontend-only, no new backend code**.

## Problem / Context
`AIProposalDrawer` is mounted only in `src/components/projects/trajectory-graph-view.tsx` (≈ lines 43, 744). The Backlog view (`src/app/(app)/projects/[id]/backlog/backlog-client.tsx`) and the Gantt/work-package view (`src/app/(app)/projects/[id]/arbeitspakete/page.tsx`) have no entry point. A PM who wants an AI-generated backlog must detour through the graph — unintuitive and easy to miss.

PROJ-70-ε already added the props needed to open the drawer programmatically on the Backlog tab: `defaultTab` and `autoGenerateContextSourceId`. So the work is wiring an entry button and opening the existing drawer.

## User Stories
- As a PM, I want to open the AI-backlog drawer directly from the Backlog view, so that I don't have to switch to the trajectory graph.
- As a PM, I want the same entry from the Gantt/work-package view, so that I can populate the schedule where I plan it.
- As an editor without AI-module access, I want the entry disabled/hidden consistently, so that the UI matches my permissions.

## Acceptance Criteria
- [ ] **AC-87.1**: The Backlog view shows an entry control ("KI-Backlog generieren / aus Kontext befüllen") that opens `AIProposalDrawer` with `defaultTab="backlog"`.
- [ ] **AC-87.2**: The Gantt/Arbeitspakete view shows the same entry control with the same behavior.
- [ ] **AC-87.3**: The entry is gated by the same editor-role check **and** `ai_proposals` module-active check used in the graph view; non-eligible users see it disabled or hidden consistently.
- [ ] **AC-87.4**: No new API route or backend change — the drawer reuses the existing PROJ-70 generate/list/accept/undo routes.
- [ ] **AC-87.5**: Method-awareness preserved — the drawer's generated hierarchy still respects the project method (Waterfall/Scrum/Hybrid) exactly as in the graph entry.
- [ ] **AC-87.6**: The graph-view entry continues to work unchanged (no regression).

## Edge Cases
- Project has no method set yet → drawer still opens; generation uses the existing PROJ-70 default behavior.
- No context source uploaded yet → drawer opens on the Backlog tab and offers the upload/generate flow (PROJ-70-γ file picker).
- A generation is already running when the user switches Backlog↔Gantt → state is preserved or cleanly re-entered (no duplicate runs).

## Non-Goals / Out of Scope
- Any new AI purpose or backend logic (that is PROJ-88/89).
- The orchestrated multi-module "fill the whole project" flow (that is PROJ-90).
- Redesign of the Backlog/Gantt views beyond adding the entry control.

## Dependencies
- Requires: PROJ-86 (so the drawer actually produces proposals for German content), PROJ-70 (drawer + routes + `defaultTab`/`autoGenerateContextSourceId` props).
- Unblocks: PROJ-90 (orchestrated entry can reuse these mounts).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
