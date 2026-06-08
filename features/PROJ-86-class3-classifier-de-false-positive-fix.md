# PROJ-86: Class-3 Classifier — German False-Positive Fix

## Status: Planned
**Created:** 2026-06-08
**Last Updated:** 2026-06-08
**Origin:** CIA portfolio review + live prod diagnosis 2026-06-08
**Priority:** P1 — Must-have (unblocks the deployed PROJ-70 pipeline)

## Summary
`detectClass3Markers` over-classifies **every German document** as Class-3, which hard-blocks all cloud AI providers and routes the request to the empty `StubProvider` → zero proposals. This single heuristic defect makes the fully-deployed PROJ-70 "auto-generated backlog from kickoff" pipeline effectively dead for German content. This slice fixes the classifier so that only **real personal-data markers** trigger Class-3, while keeping the Class-3 hard block (CLAUDE.md invariant #3) intact.

## Problem / Context
`src/lib/ai/classify.ts` upgrades a Class-1/2-stamped context source to Class-3 when `detectClass3Markers(content_excerpt)` returns `true`. The name detector is:

```
NAME_PATTERN = /\b[A-ZÄÖÜ][a-zäöüß]{2,}(?:[\- ][A-ZÄÖÜ][a-zäöüß]{2,})+\b/
```

This matches **any pair of capitalized words**. Because German capitalizes all nouns (and titles/headers are Title-Case), it fires on ordinary business prose.

**Live evidence (prod, 2026-06-08):**
- All 9 `proposal_from_context` runs (Jun 6–8) recorded `classification=3 → provider=stub → status=external_blocked → 0 tokens, 0 suggestions`.
- Regex test against the real "Generisches Kickoff.docx" excerpt: `has_email=false`, `has_phone=false`, `has_name=TRUE` — but **no actual name**. The "name" hits were noun/title phrases: *"Generisches Kickoff-Protokoll", "Google Analytics", "Meta Pixel", "Das System", "Use Case", "Best Practices", "Compliance-Verstöße"* (74 distinct false hits).
- Tenant "IT-Couch GmbH" has only a cloud provider (OpenAI) and no Ollama → Class-3 has no local target → Stub.

The `NAME_FALSE_POSITIVES` whitelist (≈18 entries) cannot scale against the unbounded set of German noun bigrams.

## Solution Direction (locked — CIA Option B)
- **Keep** `EMAIL_PATTERN` and `PHONE_PATTERN` (precise, near-zero false positives).
- **Replace** `NAME_PATTERN` with **salutation-/label-bound** detection: a capitalized name bigram only counts as PII when it immediately follows a trigger such as `Herr | Frau | Hr. | Fr. | Dr. | Ansprechpartner | Kontakt | Lead | Owner | Name | Verantwortlich` followed by `[:\s]`. This matches the way real people appear in kickoff documents (attendee lists, contact rows) and ignores free-text nouns.
- `NAME_FALSE_POSITIVES` becomes largely unnecessary; keep it as a residual safety net.
- **Defense-in-depth stays in force:** the upload-time `context_sources.privacy_class` floor and the user's ability to manually stamp a source as Class-3 remain the second line — which is why relaxing `NAME_PATTERN` is acceptable.

## User Stories
- As a PM, I want a German kickoff protocol without real names to be routed to my connected cloud LLM, so that I get proposals instead of an empty stub response.
- As a Compliance officer, I want only genuine personal markers (name after a salutation/label, email, phone) to trigger a Class-3 lock, so that the classification stays credible and doesn't cause alarm fatigue.
- As a tenant admin, I want documents that actually contain attendee names/emails to still be locked to local processing, so that the Class-3 guarantee is not weakened.

## Acceptance Criteria
- [ ] **AC-86.1**: `detectClass3Markers` returns `false` for the 9 documented prod phrases ("Generisches Kickoff-Protokoll", "Google Analytics", "Meta Pixel", "Das System", "Use Case", "Best Practices", "Compliance-Verstöße", "Die Plattform", "Lead-Modul").
- [ ] **AC-86.2**: Returns `true` for `"Ansprechpartner: Anne Schmidt"`, for any email address, and for DACH phone numbers (`+49…`, `0049…`, `0…`).
- [ ] **AC-86.3**: The existing test in `classify-proposal-from-context.test.ts` (≈ lines 90–97) that currently asserts the buggy `true` is inverted; a new corpus test feeds the real kickoff excerpt and asserts all noun-phrase hits → `false`, plus the positive cases from AC-86.2.
- [ ] **AC-86.4**: The defense-in-depth rationale (privacy_class floor + manual Class-3 stamp remain) is documented in this spec's Tech Design and in the code comment.
- [ ] **AC-86.5**: Live re-test — a real kickoff upload for a tenant with a valid cloud provider yields `classification ≤ 2 → provider = anthropic/openai → > 0 proposals` (verified against prod via a `ki_runs` row).
- [ ] **AC-86.6**: No regression in the actual-PII path — a document containing a real labeled name still classifies as Class-3 and routes to Ollama (or blocks if no local provider).

## Non-Goals / Out of Scope
- NER library (e.g. `wink-nlp`, `compromise`) — heavy dependency, Edge-runtime bundle cost, questionable German model quality. Deferred; only revisit on pilot demand (would be its own CIA-reviewed follow-up).
- Full-text re-classification beyond the 8000-char excerpt — that remains **PROJ-75** (this fix makes PROJ-75 *more* relevant, not obsolete).
- Any change to the Class-3 → Ollama routing itself (already correct).

## Dependencies
- Requires: PROJ-12 (classifier + router), PROJ-44/PROJ-70 (`proposal_from_context` + `context_sources.privacy_class`).
- Unblocks: PROJ-70 (deployed but dead for German content), PROJ-87/88/89/90.
- Related: PROJ-75 (Class-3 re-classification over full text).

## Security / Privacy Note
This is a **security-relevant** change to DSGVO data classification. It must not ship as a casual "quick fix." The relaxation is bounded: only the over-broad `NAME_PATTERN` branch changes; email/phone detection and the upload-time floor are untouched. False-negative risk (a bare unlabeled name in free text) is accepted as the trade for restoring a usable feature, and is mitigated by the privacy_class floor + manual stamp + PROJ-75.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
