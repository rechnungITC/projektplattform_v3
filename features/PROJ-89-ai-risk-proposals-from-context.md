# PROJ-89: AI Risk Proposals from Context

## Status: In Progress
**Created:** 2026-06-08
**Last Updated:** 2026-06-11
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
**Added:** 2026-06-11 · Sibling of PROJ-70/PROJ-88 — same router/drawer/accept/undo/provenance mechanics. **No new dependency.** One migration (purpose value + accept/undo RPC pair). **Class-2-capable → cloud allowed** (post-PROJ-86); content-based classification, NOT Class-3-pinned.

### Mandatory track invariant (inherited from PROJ-91 deploy, Pflicht-AC)
> **Das Vorhaben (`projects.description`) ist IMMER nur Bewertungs-Achse (`relevance`), NIE Generierungsquelle.** Risiken werden AUSSCHLIESSLICH aus dem Kickoff-Dokument abgeleitet; niemals aus dem Vorhaben erfunden. Jede Suggestion trägt `relevance` (`on_goal`/`off_goal`); der Prompt übernimmt die PROJ-91-yardstick-only-Formulierung und wird durch Contract-Tests abgesichert (Invariant-Phrasen vorhanden + Generierungs-Imperativ abwesend — Muster aus PROJ-88). → **AC-89.9 (neu, Pflicht)**:
> - [ ] **AC-89.9**: Risks are derived **exclusively from the kickoff document**; the Vorhaben is **only the relevance yardstick** (`on_goal`/`off_goal` per suggestion), never a generation source. Guarded by prompt contract tests.

### What gets built (PM view)

**1. New AI purpose with standard (content-based) classification**
- `proposal_risks_from_context` joins the purpose list. Unlike PROJ-88 (Class-3-pinned), the classifier follows the **standard whitelist path** (PROJ-70-α pattern): the kickoff excerpt + Vorhaben are scanned with the post-PROJ-86 marker detection. Clean business documents → Class 2 → tenant cloud provider (OpenAI/Anthropic/Google). Real PII in the document → Class 3 → Ollama-only via the standard resolver (no hard-pin — PROJ-93 forward-compat, same as PROJ-88).
- Defense-in-depth: the `privacy_class` floor of the `context_source` is respected — a manually Class-3-stamped source never goes to cloud, regardless of marker detection (mirror PROJ-70).
- No eligible provider for the resulting class → `external_blocked` with actionable reason + UI banner (consistent with PROJ-88, F-1 fix already ships the reason text).

**2. What the AI reads (auto-context)**
- Project frame: name, type, method, lifecycle + the **Vorhaben** (yardstick only, see invariant).
- The kickoff document: title, kind, content excerpt (same excerpt that PROJ-70/88 use).
- **Existing risks of the project** (title, probability, impact, status) — so the model proposes `duplicate_of_risk_id` instead of duplicate creates, and does not re-propose what the register already has (AC edge case 1).

**3. What a suggestion looks like (payload)**
Mapped onto the PROJ-20 risk shape (AC-89.3): title (≤255), description (≤5000), probability 1–5, impact 1–5, mitigation (≤5000, actionable next step), plus review aids: `duplicate_of_risk_id` (validated post-hoc against the supplied list — hallucinated ids → null, PROJ-88 pattern), `source_quote` (verbatim locator from the document), `confidence` (low/medium/high), `relevance` (on_goal/off_goal). Validate-loose, clamp-after in the Ollama provider (PROJ-88 D-1a lesson); cloud providers keep strict schemas.

**4. Accept = real risks in the PROJ-20 register (AC-89.4/89.5)**
- Bulk-accept RPC + 30s-undo RPC pair (SECURITY DEFINER, PROJ-70-β/PROJ-88 pattern: editor/lead/admin check, atomic TX, GUC-bypass for the immutability trigger, undo only within 30s by same actor).
- Accepted suggestions insert into `public.risks` with **status `open`** + `ki_provenance` rows (`entity_type='risks'` — plural, H-1 lesson). **Design clarification to AC-89.3:** the risks table has no `draft` status (CHECK: open/mitigated/accepted/closed) and the existing PROJ-12 accept inserts `open`; the "draft" review semantics live in `ki_suggestions` (draft → accepted/rejected/modified) + provenance, which satisfies AC-89.5/89.7 ("distinguishable as AI-derived via provenance/review state") without touching the PROJ-20 status model. Extending the risks status CHECK is explicitly out of scope (would ripple through PROJ-20 UI/filters/reports).
- Duplicate-marked suggestions (`duplicate_of_risk_id` set, reviewer-confirmed) create **no** new risk on accept; they record provenance against the existing risk (PROJ-88 L4 pattern: link instead of create).
- Undo deletes the created risks + provenance rows (and restores suggestion state), mirror `accept_stakeholder_proposals_undo` incl. H-2 lesson (provenance cleanup so re-accept works).

**5. Surfacing: Drawer-Tab 6 „Risiken" (AC-89.8)**
- New tab in the existing `AIProposalDrawer` (6 tabs then), `defaultTab="risks"` prop for PROJ-90. Flat cards (no hierarchy): title, P×I badge with score, mitigation preview, `source_quote`, „≠ Ziel"-badge (off_goal), duplicate hint, confidence badge. Inline edit: title/description/probability/impact/mitigation via the purpose-aware PATCH (extend the existing dispatch). BulkActionBar (Accept-All/Reject-All) + 30s-undo toast (sonner) — all reused components/patterns from PROJ-70-β/88.
- Source picker + upload fallback identical to the stakeholder tab (shared sub-component where practical).

**6. Delineation from PROJ-12 `risks` purpose (AC-89.6)**
| | PROJ-12 `risks` | PROJ-89 `proposal_risks_from_context` |
|---|---|---|
| Source | project auto-context (phases, milestones, work items, existing risks) | uploaded kickoff document (`context_source`) |
| Trigger | risks module ("KI-Vorschläge" button) | AIProposalDrawer tab „Risiken" (and PROJ-90 orchestration) |
| Accept | single-accept RPC `accept_ki_suggestion_risk` | bulk-accept + 30s-undo RPC pair |
| Purpose value in `ki_runs`/`ki_suggestions` | `risks` | `proposal_risks_from_context` |
Both persist into `public.risks`; the dedup context (existing risks) prevents collisions. The PROJ-12 path is untouched.

### Provider coverage (PROJ-85 lesson — no silent stub fallback)
All five providers implement the new purpose from day 1: **Anthropic, OpenAI, Google** (shared strict schema + shared system prompt module, mirror `graph-purpose-prompts` approach), **Ollama** (loose-schema replica + clamp-after), **Stub** (empty list by design, CIA-L5). The capability-matrix regression test is extended with the new purpose so a missing implementation fails CI instead of silently stubbing.

### Migration (one file, lockstep pattern)
1. Purpose CHECKs: `ki_runs`, `ki_suggestions`, `tenant_ai_cost_caps` re-enumerated **including `sentiment` + `coaching`** (⚠️ the 20260614100000 restore — the lockstep-copy bug that dropped them must not repeat; smoke check asserts both).
2. `ki_suggestions` accepted-consistency + immutability-trigger bypass extended for the new purpose (mirror 20260613100000).
3. RPC pair `accept_risk_proposals_bulk` + `accept_risk_proposals_undo` (SECURITY DEFINER, search_path-hardened, EXECUTE revoked from anon).
4. DO-block smoke checks (constraint defs + RPC existence + trigger mentions), no data mutation.

### Routes (3 new + 1 extension, mirror PROJ-88)
- POST/GET `/api/projects/[id]/ai/risk-proposals` (generate / list)
- POST `…/risk-proposals/accept` + `…/risk-proposals/undo`
- PATCH `/api/ki/suggestions/[id]` purpose-aware dispatch extended (risk-proposal payload fields)

### Tech decisions (why)
- **Content-based classification instead of Class-3-pin:** risk text is business language, not personal data; pinning would force every tenant to run Ollama for a Class-2 use case and contradict the spec (AC-89.2). The PROJ-86-fixed classifier + privacy-class floor + Class-3 resolver clamp give three defense layers.
- **Status `open` instead of new `draft` risk status:** review semantics already live in `ki_suggestions` + provenance; extending the PROJ-20 status CHECK would ripple through deployed UI/filters/reports for marginal gain.
- **Shared prompt/schema module for cloud providers:** prevents the OpenAI/Google drift that PROJ-85 had to repair; one place to apply the AC-89.9 yardstick wording.
- **No CIA review needed:** spec-following sibling implementation, no new technology/dependency, no architecture-level pattern change, no deployed-feature rewrite (checked against `.claude/rules/continuous-improvement.md` triggers).

### Dependencies (packages)
None — everything reuses the existing AI SDK, Zod, shadcn/sonner stack.

### Slice plan (handoff)
1. `/backend` — purpose + classifier + collector + shared prompts + 5 provider methods + router + migration/RPCs + routes + PATCH extension (~2 PT). **Live-RPC-Smoke gegen Prod ist Pflicht** (accept → undo → re-accept, 0 Residuen).
2. `/frontend` — Drawer-Tab 6 + cards + inline edit + bulk bar + undo toast (~1 PT).
3. `/qa` — live cloud generation run (Class-2 → OpenAI) + live Ollama run (Class-3 path), security probes, Playwright auth-gates + drawer smoke (~0.5 PT).

## Implementation Notes — Backend-Slice (2026-06-11, /backend)

**Status: Backend komplett, gebaut exakt nach Tech Design (PROJ-88-Spiegel mit Cloud-Erweiterung).**

- **Typen + Classifier + Collector**: `proposal_risks_from_context` in `AIPurpose`; `RiskProposalsAutoContext`/`RiskProposalSuggestion`/`RouterRiskProposalsResult` (`types.ts`); `classifyRiskProposalsAutoContext` content-based (PROJ-70-Muster: privacy_class-Floor + Marker-Detection auf Excerpt UND Vorhaben, 5 Tests inkl. PROJ-86-Regression-Guard); `collectRiskProposalsAutoContext` mit `existing_risks` (top-100) für Dedup + Projekt-Scope-Guard.
- **Shared Prompt/Schema-Modul** (`graph-purpose-prompts.ts`, PROJ-85-Lektion): strict `RiskProposalsResponseSchema` (cloud), `RISK_PROPOSALS_SYSTEM_PROMPT` (AC-89.9 yardstick-only-Wording), `buildRiskProposalsPrompt`, `mapRiskProposalsSuggestions` (clamps + halluzinierte `duplicate_of_risk_id` → null) — EIN Mapper für alle Provider.
- **Alle 5 Provider ab Tag 1**: Anthropic/OpenAI/Google via shared strict schema; Ollama mit loose Replica (`looseEnum` + `z.coerce.number`, validate-loose/clamp-after per PROJ-88-D-1a) + shared Prompt; Stub empty-by-design. Capability-Matrix-Test erweitert (`generateRiskProposals` Pflicht auf allen 5).
- **AC-89.9 Contract-Tests**: 4 neue Cases in `graph-purpose-prompts.test.ts` (Vorhaben-Block, no-Vorhaben-Note, existing-risks-Dedup-Liste, yardstick-only + Absenz des Generierungs-Imperativs) + 2 Mapper-Tests.
- **Router**: `invokeRiskProposalsGeneration` — Standard-Resolver (kein Pin, PROJ-93-forward-compat), Cost-Cap, ki_runs, Stub-Fallback mit `external_blocked` + blockedReason (PROJ-88-F-1-Muster), Display-Enrichment, ki_suggestions-Insert.
- **Migration `20260615100000`** (in Prod angewendet, 5 Smoke-CHECKs grün): Purpose-CHECKs ki_runs/ki_suggestions/cost_caps **inkl. sentiment+coaching-Guard** (CHECK 1 schlägt fehl, wenn die 20260614100000-Restore je wieder wegkopiert wird); accepted-consistency verbatim (neuer Purpose = strict branch via `risk`/`risk_link`); Immutability-Bypass erweitert; RPC-Paar `accept_risk_proposals_bulk`/`accept_risk_proposals_undo` (SECURITY DEFINER, EXECUTE revoked von anon, 30s-Window, same-actor, H-2-Provenance-Cleanup; Dedup-Branch = Provenance auf Bestand, Undo löscht NIE `risk_link`-Ziele).
- **Routen**: POST/GET `/api/projects/[id]/ai/risk-proposals` (+ `/accept` + `/undo`), Editor-Gate + `ai_proposals`-Modul-Check; purpose-aware PATCH um `riskProposalPayloadSchema` erweitert (relevance bleibt erhalten — PROJ-91-Lektion, testgesichert). FE-Wrapper `risk-proposals-api.ts` (list/trigger/reject/accept/undo/edit).
- **Live-RPC-Smoke (Pflicht) gegen Prod GRÜN, 0 Residuen**: DO-Block mit `request.jwt.claims`-Simulation des Tenant-Admins → echtes Projekt, 2 Drafts (Create + Duplikat auf geseedetes Bestands-Risiko) → `accept_risk_proposals_bulk` (1 created/status=open + 1 risk_link, 2 Provenance-Rows) → `accept_risk_proposals_undo` (created Risk weg, **Bestands-Risiko überlebt**, Provenance weg, Drafts restored) → Re-Accept (H-2 bewiesen) → ROLLBACK_MARKER. Nachzählung: 0 smoke_risks / 0 suggestions / 0 runs.

**Gates:** lint 0 · tsc 13 Baseline/0 neu · vitest **1799/1799** (+29 neue Tests: 5 Classifier + 6 Prompt/Mapper + 1 Capability + 8 Accept + 6 Undo + 2 PATCH + 1 Matrix-Erweiterung) · build clean.

**Offen:** Drawer-Tab 6 „Risiken" → `/frontend`; Live-Cloud-Generierungslauf (Class-2 → OpenAI) + Live-Ollama-Lauf + Security-Probes + Playwright → `/qa`.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
