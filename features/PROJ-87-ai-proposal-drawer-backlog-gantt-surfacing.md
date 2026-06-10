# PROJ-87: AI Proposal Drawer — Surfacing in Backlog + Gantt

## Status: Deployed
**Created:** 2026-06-08
**Last Updated:** 2026-06-10
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
- [x] **AC-87.1**: The Backlog view (`backlog-client.tsx`) shows a "KI-Backlog generieren" control (`data-testid="backlog-ai-proposals-trigger"`) opening `AIProposalDrawer` with `defaultTab="backlog"`. ✅
- [x] **AC-87.2**: The Arbeitspakete slug re-exports the backlog page, so the same control surfaces there; the **Gantt** lives at `/planung` (`planung-client.tsx`) and got its own header entry. ✅
- [x] **AC-87.3**: Gated at the call site by the host view's `canEdit` (`useProjectAccess(projectId, "edit_master")`). NB: the graph view shows its trigger ungated and relies on **server** enforcement (`requireProjectAccess "edit"` + `requireModuleActive "ai_proposals"`); we additionally hide it for non-editors (better UX, consistent with the host views' own edit-action gating). Module enforcement remains server-side, mirroring the graph view (no client module check exists there). ✅
- [x] **AC-87.4**: No new API route / backend change — reuses PROJ-70 routes via the shared `AIProposalDrawer`. ✅
- [x] **AC-87.5**: Method-awareness preserved — `projectMethod` passed from the backlog view; generation respects the project method server-side regardless. ✅
- [x] **AC-87.6**: Graph-view entry untouched (no regression; vitest 1746/1746, build clean). ✅

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

## Implementation Notes — 2026-06-09 (/frontend)
- **New** `src/components/projects/ai-proposals/backlog-ai-proposal-launcher.tsx`: self-contained client component — a "KI-Backlog generieren" button that mounts `AIProposalDrawer` with `defaultTab="backlog"`. Reuses the existing drawer; **no backend code**.
- **`backlog-client.tsx`**: launcher rendered in the toolbar header, `canEdit`-gated. Because `arbeitspakete/page.tsx` is a thin re-export of `backlog/page`, this single insertion covers both `/backlog` and `/arbeitspakete`.
- **`planung-client.tsx`** (the Gantt): launcher rendered in the page header, `canEdit`-gated.
- **Discovery**: the dedicated `/ai-proposals` route (`AiProposalsTabClient`) is a **status-list** of `ki_suggestions` (draft/accepted/rejected) — NOT the generation drawer; left unchanged.
- **Gating decision**: client-hide for non-editors (host views already gate their edit actions this way); server still enforces editor + `ai_proposals` module on every route. The graph view's own trigger is server-gated only — we are slightly stricter on the client for UX.
- **Quality gates**: lint 0; tsc 13 baseline/0 new; vitest 1746/1746; build clean.
- **Deferred**: a Playwright smoke (button visible for editor / hidden for viewer, opens drawer on backlog tab) → `/qa`.

## Tech Design (Solution Architect)
Folded into this slice — see Summary + Solution above. Pure frontend: one new presentational client component + two call-sites; reuses the PROJ-70 drawer and routes. No data model, no migration, no new dependency.

## QA Test Results
_To be added by /qa_

## Deployment — 2026-06-10
- PR #108 squash-merged to `main` (3f5404b), tag `v1.82.0-PROJ-87`.
- Vercel production deployment `dpl_CPF6co1kECoJHeXVgNXFNBA1zPiE` READY on `projektplattform-v3.vercel.app` (aliases incl. git-main).
- Post-deploy prod smoke: `/` and `/projects/{id}/backlog` both 307 → `/login?next=…` — auth-gate intact.
- Open: deferred Playwright smoke (launcher visible for editor / hidden for viewer, opens drawer on backlog tab) still pending `/qa`; frontend-only slice, server enforcement unchanged.
