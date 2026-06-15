# PROJ-90: Orchestrated "Fill the Project" — Multi-Tab Generate-All + Accept-All

## Status: In Progress
**Created:** 2026-06-08
**Last Updated:** 2026-06-15
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
**Added:** 2026-06-15 · Epic bracket over the three deployed siblings PROJ-70 (Backlog), PROJ-88 (Stakeholder), PROJ-89 (Risiken). **Primarily a frontend orchestration layer** — the three generation purposes, their bulk-accept/undo RPC pairs, the per-purpose cost-cap, and `ki_provenance` already exist and are live. **No new database table, no new migration, no new RPC, no new dependency.** One small wizard-handoff URL change.

### Two architecture forks — user-locked 2026-06-15
1. **Global-Undo = client-side fan-out** (not a new cross-module transaction RPC): "Alles akzeptieren" calls the three existing bulk-accept RPCs in sequence; the single Undo toast fires the three existing undo RPCs. Best-effort per module — if one module's undo fails, the others still revert (matches AC-90.7 partial-isolation). Avoids a new persistence pattern (no CIA review needed) and avoids duplicating the three RPCs' logic. The true-atomic cross-module RPC is captured as a **Later** option if QA shows the partial states confuse users.
2. **Orchestration UI = a dedicated 7th drawer tab "Projekt befüllen"** (not a header bar) — the conductor lives in its own tab; the three existing tabs stay for per-item review/edit. Keeps the narrow drawer (`max-w-xl`) uncluttered.

### What gets built (PM view)

**1. A conductor tab "Projekt befüllen" in the existing AIProposalDrawer**
This new tab orchestrates the three kickoff-derived modules. It does not replace the per-module tabs — it drives them.

```
AIProposalDrawer (existing, extended)
├── [NEW] Tab "Projekt befüllen"  ← conductor (default when deep-linked via ?aiDrawer=fill)
│   ├── Shared kickoff-source picker (choose ONE source → used for all 3 modules)
│   │   └── + upload fallback (reuses the PROJ-70-γ file picker)
│   ├── "Alles generieren" button → sequential Generate-All
│   ├── Progress list (3 rows, run top-to-bottom):
│   │   ├── Backlog        → idle / generiert… / ✓ N Vorschläge / blockiert / Fehler
│   │   ├── Stakeholder    → (same states; "blockiert" = no local Ollama, AC-90.6)
│   │   └── Risiken        → (same states)
│   ├── "Alles akzeptieren" button (global) + per-module accept buttons
│   └── Single 30s-Undo toast (reverts all three modules via fan-out)
├── Backlog tab     (existing PROJ-70) — review/edit/accept individual cards
├── Stakeholder tab (existing PROJ-88)
└── Risiken tab     (existing PROJ-89)
```

**2. Sequential Generate-All (AC-90.1, AC-90.7)**
- The conductor calls the three existing trigger endpoints one after another (Backlog → Stakeholder → Risiken), updating the progress row as each returns.
- Each module is wrapped independently: a blocked or errored module sets its own row status and the loop continues to the next (no all-or-nothing). The cost-cap is already enforced server-side inside each generation call — the conductor only surfaces the result (e.g. "blockiert: Monats-Token-Cap erreicht").
- Class-3 routing is unchanged and respected end-to-end (AC-90.6): Stakeholder generation is Class-3-pinned → if no Ollama is configured, that row shows "blockiert" while Backlog and Risiken (content-classified → cloud-capable) still generate.
- Re-entrancy guard (edge case "triggered twice"): while a Generate-All run is in flight the button is disabled and re-triggers are ignored.

**3. Accept-All — per module and global (AC-90.3)**
- Each module keeps its own "Alle akzeptieren" (the existing per-tab bulk bar).
- The conductor's global "Alles akzeptieren" calls the three bulk-accept RPCs in sequence and remembers, per module, which suggestion ids were accepted (kept in client state only).
- Because the three accepts run back-to-back (cloud/DB, ~1–2s total), all three per-module 30s-undo windows are fresh when the single Undo toast appears. One click on "Rückgängig" fans out to the three undo RPCs. Partial isolation: if one window somehow lapsed, the others still revert and the toast reports the partial result.

**4. Generalized wizard handoff (AC-90.2)**
- PROJ-70-ε already uploads one kickoff `context_source` in the wizard's `ki_backlog` step and, on finalize, attaches it to the new project and deep-links to `…/graph?aiDrawer=backlog&contextSource=<id>`.
- PROJ-90 generalizes that single source to feed all three purposes: the wizard finalize switches its deep link to `?aiDrawer=fill&contextSource=<id>`, and the graph view's existing deep-link parser learns the `fill` value → opens the conductor tab and auto-triggers Generate-All for that source.
- The old `?aiDrawer=backlog` link stays valid (back-compat); only the wizard's emitted URL changes.

### Data model (plain language)
**Nothing new is stored.** PROJ-90 reuses, unchanged:
- `ki_runs` / `ki_suggestions` / `ki_provenance` (one run + N draft suggestions per purpose; provenance on accept).
- The three purpose values `proposal_from_context`, `proposal_stakeholders_from_context`, `proposal_risks_from_context`.
- The three bulk-accept + undo RPC pairs (SECURITY DEFINER, 30s window, same-actor, H-2 provenance cleanup, dedup→link-not-create).
- The per-purpose `tenant_ai_cost_caps` rows.

The only PROJ-90 state — which modules ran, their run ids, per-module accepted-suggestion ids for the undo fan-out, and progress/status — is **ephemeral React component state** in the conductor tab. It is UI coordination, not a business record, so it is intentionally not persisted (a closed-and-reopened drawer simply re-reads the existing draft/accepted suggestions per tab).

### No silent mutation (AC-90.4, AC-90.5)
Every item remains a reviewable `ki_suggestions` row (draft → accepted/rejected/modified) and only becomes a business record (work item / stakeholder+resource / risk) through the existing accept RPCs, which always write `ki_provenance`. The conductor never bypasses this — "Generate-All" only creates drafts; "Accept-All" only calls the same audited accept RPCs the per-module tabs use. Method-appropriateness (Waterfall/Scrum/Hybrid for work items, PROJ-57 linking for stakeholders, PROJ-20 register for risks) is inherited verbatim from PROJ-70/88/89.

### Backend need
**Frontend-only**, plus one one-line wizard-handoff URL change (`aiDrawer=backlog` → `aiDrawer=fill`) and the graph deep-link parser learning the `fill` value. No API route, no migration, no RPC, no schema change. This makes PROJ-90 a low-risk composition slice.

### Tech decisions (why)
- **Reuse, don't rebuild:** every backend mechanic PROJ-90 needs is already deployed and QA-proven (PROJ-70/88/89). Adding a cross-module RPC would duplicate audited logic for marginal atomicity gain — rejected in favor of the client fan-out.
- **Conductor as a tab, not a replacement:** the per-module tabs already give the best detail-review UX; the conductor adds coordination without re-implementing card rendering, inline edit, or per-module accept.
- **Ephemeral orchestration state:** persisting "which modules ran" would invent a new table for a transient UI concern; the suggestions themselves are already the durable record.
- **No CIA needed:** spec-following composition of three deployed siblings; no new technology, no new persistence pattern, no architecture-level change (checked against `.claude/rules/continuous-improvement.md` triggers).

### Dependencies (packages)
None — reuses the existing React / shadcn / sonner stack and the three deployed `…-proposals-api` client wrappers.

### Slice plan (handoff)
1. `/frontend` — conductor tab "Projekt befüllen" (shared source picker + upload fallback, sequential Generate-All with progress rows, global + per-module Accept-All, single cross-module Undo toast) + `defaultTab="fill"` wiring + graph deep-link parser `fill` + wizard finalize URL switch (~1.5 PT). No backend.
2. `/qa` — live orchestrated run (Backlog+Risiken cloud, Stakeholder blocked-or-Ollama), partial-failure isolation, double-trigger debounce, global Accept-All → single Undo across modules, wizard→fill deep-link E2E, Playwright conductor smoke (~0.5 PT).

### Open / deferred
- **Cross-module atomic accept/undo RPC** — only if QA shows the fan-out's partial states confuse users (fork option B).
- **Dialogic wizard clarifying questions** (from spec "Next/Later") — stays out; promote to its own spec if pursued.

## Implementation Notes — Frontend-Slice (2026-06-15, /frontend)

**Conductor-Tab „Projekt befüllen" komplett (AC-90.1/90.3/90.4/90.5/90.6/90.7 frontend-seitig). Reine Frontend-Komposition — kein Backend-Change.**

- **Neu `orchestration-tab.tsx`** (`OrchestrationTab`): EINE gemeinsame Kickoff-Quelle (Dropdown `/api/context-sources` + Upload-Fallback via `uploadContextSourceFile`, PROJ-70-γ-Picker-Reuse) → speist alle drei Module. Uniforme API-Surface der drei deployten Wrapper (`API[key].{list,trigger,accept,undo}`) macht die Orchestrierung generisch.
- **Sequenzielles Generate-All (AC-90.1, AC-90.7)**: Schleife Backlog → Stakeholder → Risiken; jedes Modul in eigenem try/catch → blocked/error setzt nur die eigene Progress-Zeile, die Schleife läuft weiter. Cost-Cap serverseitig (nur Ergebnis gespiegelt). 3 Progress-Zeilen mit Status-Icon (idle/running/done N/blocked/error) + Per-Modul-„Annehmen".
- **Class-3-Isolation (AC-90.6)**: Stakeholder-Trigger liefert bei fehlendem Ollama `external_blocked` → Zeile „blockiert"; Backlog + Risiken laufen trotzdem.
- **Accept-All (AC-90.3, user-locked Fork: Client-Fan-out)**: globaler Button + Per-Modul; vor jedem Accept werden die Draft-IDs frisch gelistet (`refreshDrafts`) → nie stale IDs an die Bulk-RPCs. EIN 30s-Undo-Toast (sonner) fächert via `Promise.allSettled` über die drei Undo-RPCs auf — best-effort, meldet Teil-Undo wenn ein Fenster abgelaufen ist.
- **Re-Entrancy (Edge-Case „triggered twice")**: `generating`/`accepting`-Guards deaktivieren die Buttons; Deep-Link-Auto-Run via `autoRanRef` einmalig.
- **Wizard-Handoff verallgemeinert (AC-90.2)**: `wizard-client` Finalize-URL `?aiDrawer=backlog` → `?aiDrawer=fill`; `trajectory-graph-view` Deep-Link-Parser akzeptiert `backlog` (back-compat) UND `fill`; Drawer routet `autoGenerateContextSourceId` konditional (fill→Conductor, backlog→Backlog-Tab) → keine Doppel-Generierung. `graph-shell` erzwingt bereits trajectory-mode für jeden `aiDrawer`-Wert.
- **Drawer**: 7. Tab „Projekt befüllen" als erster Tab; `defaultTab`-Union um `"fill"` erweitert. Die drei bestehenden Tabs bleiben für Detail-Review/Edit unverändert.
- **State rein ephemer** (React) — nichts Neues persistiert; jede Karte bleibt eine reviewbare `ki_suggestions`-Row (Invariante #2).

**Gates:** lint 0 · tsc 13 Baseline/0 neu · vitest 1799/1799 · build clean. Keine neuen Deps. Gebaut in eigener Worktree (`/tmp/pv3-proj90-fe`, Primary-Checkout durch Parallel-Session belegt).

**Offen für `/qa`:** Live-orchestrierter Lauf (Backlog+Risiken Cloud, Stakeholder blocked-or-Ollama), Partial-Failure-Isolation, Double-Trigger-Debounce, globaler Accept-All → ein Undo über Module, Wizard→fill-Deep-Link-E2E, Playwright-Conductor-Smoke.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
