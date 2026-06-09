# PROJ-86: Class-3 Classifier — German False-Positive Fix

## Status: Deployed
**Created:** 2026-06-08
**Last Updated:** 2026-06-09
**Origin:** CIA portfolio review + live prod diagnosis 2026-06-08
**Deployed:** 2026-06-09 (PR #106 → main → Vercel prod). AC-86.5 fully green — live `ki_run` 21:42 UTC: `classification=2 / provider=openai / status=success / 2727→507 tokens`.
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
- [x] **AC-86.1**: `detectClass3Markers` returns `false` for the documented prod phrases ("Generisches Kickoff-Protokoll", "Google Analytics", "Meta Pixel", "Das System", "Use Case", "Best Practices", "Compliance-Verstöße", "Die Plattform", "Lead-Modul"). ✅ corpus test green.
- [x] **AC-86.2**: Returns `true` for `"Ansprechpartner: Anne Schmidt"`, `"Kontakt: Jörg Müller"` (umlaut), salutation forms ("Herr Müller", "Dr. Weber"), any email address, and DACH phone numbers (`+49…`, `0049…`, `0…`). ✅
- [x] **AC-86.3**: The bug-cementing assertions (incl. "Bitte Status Report" and the bare-name case) are inverted to `false`; a new corpus test feeds the real kickoff phrases (all `false`) plus the AC-86.2 positives. ✅ 18/18 in `classify-proposal-from-context.test.ts`.
- [x] **AC-86.4**: Defense-in-depth rationale (privacy_class floor + manual Class-3 stamp remain) documented in the Tech Design **and** in the `detectClass3Markers` code comment. ✅
- [x] **AC-86.5**: Live re-test ✅ — post-deploy `ki_run` 2026-06-09 21:42 UTC: `classification=2 → provider=openai → status=success → 2727 in / 507 out tokens` (real OpenAI call, > 0 proposals). Pre-deploy runs were still `3/stub/external_blocked`. Both halves green.
- [x] **AC-86.6**: No regression in the actual-PII path — a labelled name ("Ansprechpartner: …", "Herr …") still triggers Class-3; verified by the positive-guard tests. ✅

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
**Added:** 2026-06-08 · **Status after this pass:** Architected

### What gets built (one sentence)
A single, well-scoped change to the personal-data marker detector so it stops mistaking ordinary German nouns for people's names — keeping the precise email/phone detection and the surrounding Class-3 safety net untouched.

### Blast radius — narrow and verified
```
detectClass3Markers (src/lib/ai/classify.ts)
└── used by exactly ONE caller:
    └── classifyProposalFromContextAutoContext
        └── feeds: proposal_from_context purpose (PROJ-70) only
```
- The marker detector and its three patterns (email, phone, name) live entirely inside `classify.ts` and are referenced **nowhere else**.
- The other seven classifiers (risk, narrative, sentiment, coaching, trajectory, resource-swap, cross-project-links) do **not** use this detector — they are unaffected.
- **Consequence:** this is a contained library change. No database migration, no RPC, no API contract change, no new dependency. The only behavioural change is *which privacy class* a context-source excerpt receives — and only for the `proposal_from_context` flow today (and, by design, the future PROJ-88/89 siblings that will reuse the same detector).

### The problem in plain language
The name detector currently flags **any two capitalized words in a row** as a person's name. German capitalizes every noun, so business prose ("Generisches Kickoff-Protokoll", "Google Analytics", "Best Practices") trips it constantly. Result: real documents are wrongly labelled "contains personal data → Class-3 → must stay local", and with no local AI configured the system returns nothing.

### The approach (locked — CIA Option B)
1. **Keep email + phone detection exactly as-is.** They are precise and rarely misfire — they stay the primary, reliable PII signals.
2. **Make name detection context-bound instead of shape-bound.** A capitalized name only counts when it directly follows a **personal-context trigger word** — the way real people actually appear in kickoff documents:
   - Salutations/titles: *Herr, Frau, Hr., Fr., Dr.*
   - Role/contact labels: *Ansprechpartner, Kontakt, Lead, Owner, Name, Verantwortlich* (followed by a colon or space)
   
   So "Ansprechpartner: Anne Schmidt" is detected; "Generisches Kickoff-Protokoll" is not.
3. **Keep the false-positive whitelist as a thin residual safety net** — it becomes largely redundant but harms nothing.
4. Case-sensitivity and German-umlaut handling (Ä/Ö/Ü/ß) are preserved so labelled names with umlauts ("Kontakt: Jörg Müller") are still caught.

### Why this is safe to relax (DSGVO / false-negative decision)
This is an explicit, documented trade-off — not an oversight:
- **Defense-in-depth stays in force.** Two independent lines remain: (a) the upload-time `context_sources.privacy_class` floor — a source already stamped Class-3 stays Class-3 regardless of the detector; (b) the user/admin can manually stamp any source Class-3.
- **Residual false-negative:** a bare, unlabelled name in free text (e.g. "...dann übernimmt Anne Schmidt die Migration.") without any email/phone/label would now classify as Class-2 and could reach the cloud. This is the accepted cost of restoring a usable feature. It is bounded by the two lines above and by **PROJ-75** (full-text re-classification), which this change makes *more* relevant, not obsolete.
- **Net privacy posture:** moves from "100% false-positive (feature dead, classification not credible)" to "precise PII signals + context-bound names + manual override" — a credible classifier instead of an alarm-fatigue one.

### Test strategy
- **Invert the bug-cementing assertions** in `classify-proposal-from-context.test.ts` (the cases ~lines 50–97 that currently assert generic German phrases and "Bitte Status Report" return `true`). After the fix they must return `false`.
- **New corpus test** built from the real production kickoff excerpt: all the documented noun-phrase hits ("Generisches Kickoff-Protokoll", "Google Analytics", "Meta Pixel", "Das System", "Use Case", "Best Practices", "Compliance-Verstöße", "Die Plattform", "Lead-Modul") must classify as **not** Class-3.
- **Positive guard cases** kept/added: "Ansprechpartner: Anne Schmidt" → detected; any email → detected; DACH phone formats (`+49…`, `0049…`, `0…`) → detected; "Kontakt: Jörg Müller" (umlaut) → detected.

### Live re-test plan (AC-86.5)
After deploy, run a real kickoff upload for a tenant with a valid cloud provider and confirm via a fresh `ki_runs` row for `proposal_from_context`: `classification ≤ 2 → provider = anthropic/openai → status = success → > 0 suggestions`. This is the end-to-end proof that the dead pipeline is alive again. (Mirrors the project's "Live-RPC-Smoke Pflicht" convention.)

### Dependencies / packages
- None. No new package; no migration; no RPC.

### Handoff
- This is a backend/library change with co-located unit tests → next step is `/backend` (not `/frontend`).

## Implementation Notes — 2026-06-08 (/backend)
- **`src/lib/ai/classify.ts`**: replaced the shape-based `NAME_PATTERN` (any capitalized German bigram) with `NAME_TRIGGER_PATTERN` — a salutation/title form (`Herr|Frau|Hr.|Fr.|Dr.` + whitespace + capitalized word) **or** a role/contact label form (`Ansprechpartner|Kontakt|Lead|Owner|Name|Verantwortlich` + **colon** + capitalized word). The colon is deliberately required for label triggers so "Lead Scoring"/"Name Service" don't re-introduce false positives. `EMAIL_PATTERN` + `PHONE_PATTERN` unchanged. `NAME_FALSE_POSITIVES` retained as a residual filter applied to the captured name span (capture group 1). `detectClass3Markers` + comments updated with the defense-in-depth rationale.
- **`src/lib/ai/classify-proposal-from-context.test.ts`**: inverted the bug-cementing asserts (bare name, "Bitte Status Report" → now `false`); added the real-excerpt corpus test (8 phrases → `false`), positive-guard tests (salutation + label-colon + umlaut + email + phone → `true`), a "Lead Scoring / Name Service" negative, and a residual-whitelist case ("Owner: Project Manager" → `false`). 18/18 green.
- **Blast radius**: `detectClass3Markers` is consumed only by `classifyProposalFromContextAutoContext` → only `proposal_from_context`. No migration, no RPC, no new dependency.
- **Quality gates**: lint 0; tsc 13 baseline / 0 new; vitest **1744/1744**; build clean.
- **AC-86.5 status**: classification half verified against the live prod excerpt (Class-2). Generation half (`provider=openai → > 0 proposals`) to be confirmed post-deploy with a real upload + fresh `ki_runs` row.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
