# PROJ-88: AI Stakeholder Proposals from Context

## Status: Approved
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
- [x] **AC-88.1**: ✅ (backend 2026-06-10) A new `AIPurpose` value `proposal_stakeholders_from_context` is added to `src/lib/ai/types.ts` and wired through the router with a dedicated `invoke…` helper (mirrors `invokeProposalFromContextGeneration`).
- [x] **AC-88.2**: ✅ (unconditional classifier, 3 tests) The purpose is **Class-3-pinned**: the classifier/route returns classification 3 regardless of content, so the router clamps to Ollama-only; cloud providers are never selected.
- [x] **AC-88.3**: ✅ (router `external_blocked` + persistent banner „Lokaler KI-Provider (Ollama) erforderlich" mit Link zu /settings/tenant/ai-providers) When no Ollama provider is configured, the run records `external_blocked` with an actionable reason and the UI shows a clear "local provider required" message (no silent empty list).
- [x] **AC-88.4**: ✅ (payload incl. role_key/org_unit/contacts/duplicate_of/source_quote + reviewer-set create_resource/linked_user_id) Each suggestion carries: stakeholder name + inferred role + optional resource/member link target, structured to map onto the PROJ-57 linking model on accept.
- [x] **AC-88.5**: ✅ (RPC pair, live-smoked against prod incl. undo + re-accept) A bulk-accept RPC persists accepted stakeholders (+ links) with `ki_provenance` trace and a 30s-undo window, mirroring the PROJ-70-β accept/undo pattern.
- [x] **AC-88.6**: ✅ (stakeholders + resources via source_stakeholder_id bridge; member-link only to existing tenant members — live-smoked) Accepted items appear as Stakeholders (PROJ-8) and, where a link target was chosen, as Resource/Project-Member with role (PROJ-57) — entered into the existing structures, not a parallel store.
- [x] **AC-88.7**: ✅ (ki_suggestions states + is_modified + ki_provenance) Every AI-derived stakeholder carries a review state (draft/accepted/rejected/modified) and provenance — no silent mutation (invariant #2).
- [x] **AC-88.8**: ✅ (drawer tab 5 „Stakeholder", defaultTab="stakeholders" für PROJ-90) A drawer tab surfaces these proposals (consumed by PROJ-90's orchestration; standalone tab acceptable in this slice).
- [x] **AC-88.9**: ✅ (4 prompt contract tests) (track invariant, CIA-locked 2026-06-10 from PROJ-91): Stakeholders are extracted **exclusively from the kickoff document**; the Vorhaben (`projects.description`) is **only the relevance yardstick** (`on_goal`/`off_goal` per suggestion), never a generation source. The prompt uses the PROJ-91 yardstick-only wording and is guarded by contract tests (assert the invariant phrases, assert the absence of any "richte … am Vorhaben aus" generation imperative).

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

## Implementation Notes — 2026-06-10 (/frontend)
- **New** `src/components/projects/ai-proposals/stakeholder-proposal-tab.tsx`: flat suggestion cards (L6) — kind icon (Person/Organisation) + origin badge + „≠ Ziel"-relevance badge + role/unit/contacts + italic `source_quote` (traceability) + duplicate hint („Accept verknüpft statt neu anzulegen"); inline editor as sub-component (name/kind/origin/role_key — no set-state-in-effect); per-card accept options „auch als Resource anlegen"-Switch + Member-Picker (nur existierende Tenant-Member aus `/api/projects/[id]/participant-links`), beide sofort via purpose-aware PATCH persistiert (Bulk-RPC liest DB-Payloads); BulkActionBar (Alle akzeptieren/ablehnen); 30s-Undo-Toast (sonner action, Mirror PROJ-70-β) mit „X neu angelegt · Y mit Bestand verknüpft"; Quellen-Wahl: Dropdown vorhandener `context_sources` ODER frischer Upload (Reuse `uploadContextSourceFile`).
- **AC-88.3 banner**: `external_blocked` setzt einen persistenten amber-Banner (kein Toast — by-design-Block, keine Fehlermeldung) mit Link zu Einstellungen → KI-Provider.
- **Drawer**: Tab 5 „Stakeholder" + `defaultTab`-Union um `"stakeholders"` erweitert (PROJ-90-Orchestrierung kann den Tab direkt öffnen).
- **Quality gates**: lint 0; tsc 13 baseline/0 neu; vitest 1770/1770; build clean.
- **Open for /qa**: Live-Ollama-Generierungslauf (WSL2-Endpoint), Auth-Gate-Playwright für die 3 Routen, Security-Probes; PROJ-87-deferred-Smoke fährt mit.

## QA Test Results — 2026-06-10 (/qa)

### Verdict: **PRODUCTION-READY** — 0 Critical / 0 High; F-1 (Medium) in-QA gefixt + live verifiziert; **D-1 geschlossen** (Ollama-Happy-Path live in Prod, 2 dabei gefundene Bugs gefixt: PR #118/#119); F-2/F-3 Env-Findings ohne PROJ-88-Bezug

### AC-Verifikation
| AC | Ergebnis | Evidenz |
|---|---|---|
| AC-88.1 Purpose + Router | ✅ PASS | Code + 1770 vitest; Live-Run ki_run `9999378e` mit purpose=proposal_stakeholders_from_context |
| AC-88.2 Class-3-Pin | ✅ PASS (live, Prod) | Tenant hat **gültigen OpenAI-Key** — Live-POST ergab trotzdem classification=3 / provider=stub / external_blocked; Cloud strukturell nie gewählt. 3 Classifier-Unit-Tests |
| AC-88.3 external_blocked + actionable + UI | ✅ PASS nach F-1-Fix | Live-Run zeigte external_blocked, aber `ki_runs.error_message` war NULL → **F-1 (Medium)**, in-QA gefixt (s.u.); FE-Banner unabhängig davon funktional (Playwright-gerendert) |
| AC-88.4 Payload-Struktur | ✅ PASS | Route-Tests + Live-RPC-Smoke (Backend-Slice) |
| AC-88.5 Bulk-RPC + Provenance + 30s-Undo | ✅ PASS (live, Prod) | Live-RPC-Smoke im Backend-Slice: accept(create+resource+dup-link) → undo → re-accept, 0 Residuen |
| AC-88.6 Stakeholder/Resource in Bestand | ✅ PASS (live) | Smoke verifizierte stakeholders-Row + resources-Row via source_stakeholder_id-Brücke |
| AC-88.7 Review-States + Provenance | ✅ PASS | Smoke + Route-Tests; Immutability-Trigger erweitert |
| AC-88.8 Drawer-Tab | ✅ PASS (Playwright chromium) | Tab 5 sichtbar, geseedete Card mit Name/„≠ Ziel"-Badge/Resource-Toggle/Member-Picker/Accept-All |
| AC-88.9 Track-Invariante | ✅ PASS | 4 Prompt-Contract-Tests (yardstick-only-Phrasen + Absenz des Generierungs-Imperativs, shared-Muster) |

### Live-Probes (Prod, authentifizierte Session)
- **Class-3-Pin-Probe**: POST gegen echtes Projekt mit gültigem Tenant-OpenAI-Key → `{classification:3, provider:"stub", status:"external_blocked", suggestion_ids:[]}` — der wichtigste Sicherheitsbeweis der Slice.
- **Security-Probes (6)**: fremde/nonexistente suggestion-ids → 400 `some_suggestions_invalid…`; Undo nonexistent → 400 `undo_invalid_or_window_expired`; fremdes Projekt → 404; count=500 → 400 Zod; unauth → 307 Auth-Gate; Cross-Purpose-PATCH durch Zod-Purpose-Dispatch geblockt (Schema-Ebene, route-getestet).

### Findings
- **F-1 (Medium, in-QA gefixt nach PROJ-70-δ-Präzedenz)**: `selectProviderForPurpose` lieferte im blocked-Branch keinen `blockedReason` → `ki_runs.error_message` NULL für ALLE Class-3-geblockten Läufe (purposeübergreifend, seit PROJ-32). Fix: Resolver-Reason wird als actionable Text durchgereicht („Class-3-Purpose erfordert einen tenant-lokalen Provider (Ollama)…"). Live-Re-Test nach Deploy dokumentiert unten.
- **F-2 (Env, Low)**: Playwright-WebKit (Mobile Safari) kann auf diesem WSL2-Host nicht mehr starten — neues webkit-2287-Binary braucht System-Libs (libgtk-4 u.a.), Installation erfordert sudo: `sudo npx playwright install-deps webkit`. Chromium voll grün; kein PROJ-88-Defekt.

### Deviation D-1 — Ollama-Happy-Path: **GESCHLOSSEN 2026-06-10 (nachgeholt, live in Prod)**
User stellte einen Remote-Ollama-Endpoint bereit (Hostinger, Ollama 0.30.7). Ablauf: `qwen2.5:7b` remote gepullt → Tenant-Provider via `PUT /api/tenants/{id}/ai-providers/ollama` registriert (`status: valid`) → Live-Lauf. Dabei **zwei echte Bugs gefunden + gefixt**, die NUR ein echter Endpoint zeigen konnte:
- **D-1a (PR #118)**: harte Zod-`.max()`-Caps ließen `generateObject` die GESAMTE Response verwerfen, wenn das Modell z.B. lange wörtliche `source_quote`s schreibt → validate-loose, clamp-after (Längen-Clamps im Mapper) + lowercase-Enum-Preprocess.
- **D-1b (PR #119, Root-Cause)**: `createOpenAICompatible` sendete das `response_format json_schema` NIE an den Endpoint (AI-SDK-Warnung „responseFormat … only supported with structuredOutputs") — das Modell sah das Schema nicht und erfand eigene Strukturen. `supportsStructuredOutputs: true` behebt das für **alle 8 Ollama-Purposes** (war latent seit PROJ-32-c-β, nie gegen echten Endpoint exercised).
- **Finaler Prod-Lauf** ki_run `da0e0c6e` (2026-06-10): `classification=3 / provider=ollama / model=qwen2.5:7b / status=success / 7 suggestions` — Drafts mit validen kinds/origins/relevance in `ki_suggestions`. AC-88.1/88.2/88.3 damit auch im Happy-Path live bewiesen.
- **Modell-Qualitäts-Nits (7B, dokumentiert, kein Blocker — Mensch reviewt jede Karte)**: Bei einem Kickoff OHNE Personennamen extrahiert das Modell Rollen-/Org-Erwähnungen statt Personen (korrekt: keine Namen erfunden, AC-88.9 hält); `source_quote` blieb leer (Prompt sagt „wenn möglich"); `relevance` großzügig on_goal trotz Ziel-Divergenz; „CRM-Systeme" grenzwertig (System vs. Anbieter). Für Pilot ggf. größeres Modell (z.B. qwen2.5:14b+) empfehlen.

### Playwright
- Neu: `tests/PROJ-88-stakeholder-proposals.spec.ts` — 4 Auth-Gates + invalid-uuid (beide Browser grün) + authentifizierter Drawer-Smoke (chromium grün; webkit s. F-2). Enthält den **deferred PROJ-87-Smoke**: Launcher-Button sichtbar → Klick → Drawer öffnet mit Backlog-Tab → Stakeholder-Tab → geseedete Card. Seeds idempotent + afterAll-Cleanup.

- **F-3 (Low, Vorbestand)**: 2 PROJ-51-Visual-Regression-Snapshots schlagen fehl (Tenant-Settings +160px Seitenhöhe, Login-mobile 2%-Pixel-Drift). Baseline vom 2026-05-13, Settings-Code seither unverändert — die Screenshots laufen gegen die Prod-DB und sind durch **Datenwachstum** gedriftet, nicht durch Code. Kein PROJ-88-Bezug; Re-Baselining → PROJ-67-Followup.

### Regression (volle Chromium-E2E-Suite, seriell)
**88 passed / 5 skipped / 2 failed** — beide Failures = F-3 (PROJ-51-Snapshots, Vorbestand). Alle PROJ-70/87-bezogenen Specs grün; der neue PROJ-88-Spec ergänzt die permanente Regressions-Suite.

### Gates
lint 0 · tsc 13 baseline/0 neu · vitest 1770/1770 · build clean · Playwright PROJ-88-Spec: chromium 6/6, webkit 5/6 (F-2-Env) · Voll-Suite chromium 88/90 (2× F-3-Vorbestand)


## Deployment
_To be added by /deploy_
