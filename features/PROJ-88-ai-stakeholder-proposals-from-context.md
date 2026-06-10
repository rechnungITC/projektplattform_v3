# PROJ-88: AI Stakeholder Proposals from Context

## Status: In Progress
**Created:** 2026-06-08
**Last Updated:** 2026-06-10
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
- [ ] **AC-88.9** (track invariant, CIA-locked 2026-06-10 from PROJ-91): Stakeholders are extracted **exclusively from the kickoff document**; the Vorhaben (`projects.description`) is **only the relevance yardstick** (`on_goal`/`off_goal` per suggestion), never a generation source. The prompt uses the PROJ-91 yardstick-only wording and is guarded by contract tests (assert the invariant phrases, assert the absence of any "richte … am Vorhaben aus" generation imperative).

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
- Forward-compat (PROJ-93, CIA 2026-06-10): the implementation must route Class-3 through the **standard key-resolver path** (classifier returns 3 → resolver picks the eligible provider set), NOT hard-pin Ollama in the purpose code. When PROJ-93 ships, attested Trusted-EU-Processor endpoints join the eligible set automatically — no PROJ-88 change needed.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Added:** 2026-06-10 · Sibling of PROJ-70 — same router/drawer/accept/undo/provenance mechanics. **No new dependency.** One migration (purpose value + accept/undo RPCs). Class-3-pinned → Ollama-only by design.

### Mandatory track invariant (CIA-locked 2026-06-10, from PROJ-91)
> **Das Vorhaben (`projects.description`) ist IMMER nur Bewertungs-Achse (`relevance`), NIE Generierungsquelle.** Stakeholder werden AUSSCHLIESSLICH aus dem Kickoff-Dokument extrahiert; niemals aus dem Vorhaben erfunden. Jede Suggestion trägt `relevance` (`on_goal`/`off_goal`) analog PROJ-91; der Prompt übernimmt die gefixte Formulierung (yardstick-only) und der Contract-Test-Ansatz aus `graph-purpose-prompts.test.ts` wird auf den neuen Prompt gespiegelt. → **AC-88.9 (neu, Pflicht)**.

### What gets built (PM view)

**1. New AI purpose, locked to the local model**
- `proposal_stakeholders_from_context` joins the purpose list. Its classifier returns Class 3 **unconditionally** (same pattern as the existing `resource_swap` purpose) — the router can therefore only ever pick the tenant's Ollama endpoint. Cloud providers are structurally unreachable for this purpose, fulfilling invariant #3 without relying on content detection.
- No Ollama configured → the run is recorded as `external_blocked` with an actionable reason, and the tab shows "Lokaler KI-Provider (Ollama) erforderlich" with a link to the tenant AI settings (AC-88.3). No silent empty list, no stub items.

**2. What the AI reads (auto-context)**
- Project header (name, type, method, lifecycle) + the **Vorhaben** (relevance yardstick only).
- The kickoff document excerpt (full excerpt is fine here — it never leaves the tenant boundary, Ollama is tenant-local).
- The project's **existing stakeholders** (id, name, role_key) — so the AI can propose "link/merge with existing" instead of duplicates (edge case 1).

**3. What the AI returns (one suggestion per stakeholder mention)**
Plain-language payload per suggestion:
- Name (person or organization) + `kind` (person/organization)
- Suggested project role (`role_key`, free text from the document, e.g. "Projektleiter Fachbereich")
- Contact details if the document states them (email/phone — they stay in the tenant DB, which is exactly what the stakeholder contact fields are for)
- Organization/department hint (`org_unit`)
- `duplicate_of_stakeholder_id` when the AI recognizes an existing stakeholder (proposes a merge/enrich instead of a create)
- `confidence` (low for ambiguous names like products — edge case 4) + `relevance` (on_goal/off_goal, AC-88.9)
- A short "where in the document" quote for source traceability (review aid)

**4. Review & accept (drawer tab 5: "Stakeholder")**
- The existing `AIProposalDrawer` gets a fifth tab (the `defaultTab` prop is extended; PROJ-87 launchers can open it directly later, PROJ-90 orchestrates it).
- List of suggestion cards (not a tree — stakeholders are flat) with inline edit of name/role/kind before accept, mirroring the Backlog tab's inline-edit pattern.
- Per-suggestion toggle **"auch als Resource anlegen"** (default off). Accept then also creates a Resource bridged via `source_stakeholder_id` (the PROJ-57 model). Day rates stay untouched (tenant-admin territory, PROJ-54).
- Optional reviewer-picked link to an existing tenant member (`linked_user_id`) — **never** auto-created memberships/users (invariant #4, Stakeholder ≠ User).
- Bulk-accept + reject-all + 30s-undo toast, mirroring PROJ-70-β.

**5. Persistence on accept (one new RPC pair, mirroring PROJ-70-β)**
- `accept_stakeholder_proposals_bulk`: atomically creates `stakeholders` rows (and Resources where toggled, merges where `duplicate_of` was confirmed), writes `ki_provenance` (`entity_type='stakeholder'` / `'resource'`), flips suggestions to `accepted`.
- `accept_stakeholder_proposals_undo`: 30-second window, removes the created rows + provenance, returns suggestions to `draft` (incl. the PROJ-70-δ-QA lesson: provenance rows are cleaned up so re-accept works).
- Both SECURITY DEFINER with the established tenant/project guards; a **live RPC smoke** against prod is mandatory before Approved (Live-RPC-Smoke Pflicht).

### Decisions locked in this design
| # | Decision | Rationale |
|---|---|---|
| L1 | Class-3 pin = unconditional classifier (no content detection) | Mirrors `resource_swap`; structurally safe, not heuristic |
| L2 | Accept creates **Stakeholder always; Resource only via per-item toggle; Member-link only to existing users picked by reviewer** | AC-88.6 + invariant #4; resource auto-create for every mention would flood capacity planning |
| L3 | Contact data (email/phone) is persisted into the stakeholder contact fields | That is their purpose; data never left the tenant (Ollama-local) |
| L4 | Dedup via AI-proposed `duplicate_of_stakeholder_id` + reviewer confirmation; accept enriches instead of creating | Edge case 1; no silent merges |
| L5 | Vorhaben = relevance yardstick only + `relevance` flag + prompt contract tests | CIA track invariant from PROJ-91 (AC-88.9) |
| L6 | Suggestion cards flat (no tree), inline edit before accept | Stakeholders have no hierarchy; reuses Backlog-tab editing pattern |

### Touch points (for the implementing skills — no code here)
- `src/lib/ai/types.ts` (purpose + payload types) · `src/lib/ai/classify.ts` (pinned classifier) · `src/lib/ai/auto-context.ts` (collector) · `src/lib/ai/providers/ollama.ts` (generation method + prompt, yardstick-only wording) · `src/lib/ai/providers/stub.ts` (schema-compatible empty) · router invoke module (sibling of `proposal-from-context.ts`)
- New API routes under `…/ai/stakeholder-proposals/` (POST generate / GET list / accept / undo), purpose-aware PATCH extension for inline edit
- `src/components/projects/ai-proposal-drawer.tsx` (tab 5 + defaultTab) + new `stakeholder-proposal-tab.tsx`
- 1 migration: `ki_suggestions`/`ki_runs` purpose value + the two RPCs
- Prompt contract tests mirroring `graph-purpose-prompts.test.ts` (yardstick-only invariant)

### Explicitly out of scope (unchanged from spec)
Budget extraction (PROJ-82), Generate-All orchestration (PROJ-90), any cloud routing, auto-created users/memberships.

### Suggested build order
1. `/backend` — purpose + classifier + collector + Ollama prompt/method + routes + migration/RPCs (~2 PT)
2. `/frontend` — drawer tab + cards + toggles + undo toast (~1 PT)
3. `/qa` — live Ollama run (WSL2 endpoint exists since PROJ-86 setup), RPC live smoke, security probes (~0.5 PT); PROJ-87 deferred Playwright smoke rides along here.

## Implementation Notes — 2026-06-10 (/backend)
- **Purpose + types** (`src/lib/ai/types.ts`): `proposal_stakeholders_from_context` + `StakeholderProposalsAutoContext` (project incl. Vorhaben, context source, `existing_stakeholders` for dedup) + flat `StakeholderProposalSuggestion` (name/kind/origin/role_key/org_unit/contacts/duplicate_of/source_quote/confidence/relevance + reviewer-set `create_resource`/`linked_user_id`).
- **Classifier** (`classify.ts`): `classifyStakeholderProposalsAutoContext` — unconditional Class-3 pin (L1, resource_swap mirror). 3 tests.
- **Collector** (`auto-context.ts`): `collectStakeholderProposalsAutoContext` — project + source (same scope-guard as PROJ-70) + active stakeholders (id/name/kind/role_key, limit 100).
- **Ollama provider**: local Zod schema (≤30), system prompt with AC-88.9 yardstick-only grounding + no-fabricated-names + dedup + product-ambiguity rules; builder renders Vorhaben block ("NUR Bewertungsmaßstab…"), existing-stakeholder list with ids, kickoff content. Post-hoc defense: hallucinated `duplicate_of_stakeholder_id` → null. **Stub**: empty by design. 4 prompt contract tests (`ollama-stakeholder-prompts.test.ts`) assert the invariant phrases AND absence of the generation imperative.
- **Router** (`router.ts`): `invokeStakeholderProposalsGeneration` — standard resolver path (NO Ollama hard-pin → PROJ-93 forward-compat AC-93.9), cost-cap, ki_runs, Stub-fallback (`external_blocked`), display enrichment, ki_suggestions insert.
- **Migration** `20260613100000` (applied to prod): purpose CHECKs (ki_runs/ki_suggestions/cost_caps), `ki_provenance` entity CHECK + `stakeholders`/`resources` (plural, H-1 lesson), immutability-trigger bypass extended to the new purpose, RPC pair `accept_stakeholder_proposals_bulk`/`_undo` (SECURITY DEFINER, 30s window, same-actor, H-2 provenance cleanup). Accept semantics: dedup → `stakeholder_link` (no create, never deleted on undo); create → stakeholder (+resource per toggle, bridged via `source_stakeholder_id`); `linked_user_id` must be an existing tenant member (invariant #4).
- **Routes**: `…/ai/stakeholder-proposals` (POST editor+ / GET member), `accept`, `undo`; purpose-aware PATCH in `/api/ki/suggestions/[id]` (+ drive-by fix: `relevance` was being stripped from `proposal_from_context` payloads on inline-edit since PROJ-91 — now preserved).
- **FE wrapper**: `src/lib/ai-proposals/stakeholder-proposals-api.ts` (list/trigger/reject/accept/undo/edit).
- **Live RPC smoke (Pflicht) 2026-06-10, prod DB, DO-block + rollback-marker, 0 residue**: 3-suggestion accept (create + create_resource+linked_user + dedup-link), undo (deletes only created, pre-existing stakeholder survives, provenance cleaned), re-accept after undo. **Found + fixed live: `resources_tenant_user_unique` collision** — when the linked user already owns a resource, the RPC now creates the resource without the user-link (stakeholder bridge intact) instead of failing the accept; prod function patched via anchor-replace, migration file updated.
- **Quality gates**: lint 0; tsc 13 baseline / 0 new; vitest **1770/1770** (+22: 3 classifier + 4 prompt contract + 15 route); build clean.
- **Hygiene**: removed stale `.claude/worktrees/deploy-proj47-proj74` worktree (clean, identical to main) that doubled vitest counts and broke the lint baseline.
- **Open for /frontend**: drawer tab 5 ("Stakeholder", flat cards + inline-edit + create_resource toggle + member picker + 30s-undo toast), AC-88.3 UI message ("Lokaler KI-Provider erforderlich"), AC-88.8. **Open for /qa**: live Ollama generation run (WSL2 endpoint), Playwright auth-gates, security probes; PROJ-87 deferred smoke rides along.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
