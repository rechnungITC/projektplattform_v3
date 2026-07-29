# PROJ-77: Skill-Customizing

## Status: Deployed (α, β, γ) — COMPLETE

> **Post-Deploy-Audit 2026-07-28 → [PROJ-141](PROJ-141-cross-cutting-audit-remediation-77-96-132.md) — α-Slice komplett in Prod 2026-07-28/29 (H-1 RLS + M-9 If-Match + M-10 activate-Guard + M-11 audit-events+discard + L-3 422). β (M-7/M-8/L-5) und γ (PROJ-96/132-Konsistenz) bleiben in PROJ-141 Planned. Details siehe dortige Implementation Notes.**
**Created:** 2026-06-06
**Last Updated:** 2026-07-29

## Summary
Extends the deployed PROJ-76 Skill-Framework with the three customizing dimensions plus a real draft→publish workflow. Admin-only. Refined 2026-07-24 (`/requirements`) and reconciled against **as-built PROJ-76 + PROJ-79 (both now Deployed)**. Three user-locked decisions shape this slice:

1. **Editable drafts** — a `draft` skill version becomes editable *in place* (mutable while `draft`, frozen on publish), with `If-Match` optimistic concurrency. This **relaxes the PROJ-76 content-immutability trigger** (which currently freezes *every* version incl. drafts) → **re-architects a deployed feature → CIA is MANDATORY at `/architecture`** (rule #3).
2. **Sub-slices α/β/γ** — one spec, staged build: **α** allowed-actions (store+validate) + editable-draft/publish workflow (PROJ-76 only) · **β** reusable examples · **γ** knowledge-links (needs PROJ-79 DMS).
3. **Allowed-actions: store + validate here, enforce downstream** — PROJ-77 persists + enum-validates + audit-plumbs `allowed_actions`; the actual 403 enforcement lands in PROJ-82 (proposals) and PROJ-83 (doc-generation) where those actions exist. The enforcement contract is documented here so it isn't dead code.

## Dependencies
- Requires: **PROJ-76** (Skill-Framework Foundation) — **Deployed** (tag `v2.22.0-PROJ-76`); extends `skills` / `skill_versions`, the immutability trigger, and the `frontmatter` JSON schema.
- Requires: **PROJ-79** (DMS Foundation) — **Deployed** (tag `v2.18.0-PROJ-79`); knowledge links reference `document_tree_nodes`.
- Requires: PROJ-10 (Audit).
- Influences: PROJ-80 (RAG) — examples + knowledge links feed retrieval prompts.
- Influences: PROJ-82 (Skill-driven AI Proposals) + PROJ-83 (Task-driven Content Generation) — **own the `allowed_actions` enforcement contract** defined below.

## Sub-Slices (build order)
- **PROJ-77-α — Allowed-Actions + Editable-Draft/Publish.** Depends only on deployed PROJ-76. Adds `allowed_actions` to the version frontmatter (store + enum-validate), relaxes the immutability trigger so `draft` versions are editable in place, adds `skill_versions.updated_at` for `If-Match` concurrency, and reframes the detail-page version workflow as draft → publish → rollback with a diff-confirm. **CIA-mandatory (trigger change on deployed table).**
- **PROJ-77-β — Skill-Examples.** New `skill_examples` table + admin CRUD UI on the skill detail page. Independent of α/γ.
- **PROJ-77-γ — Knowledge-Links.** New `skill_knowledge_links` table referencing PROJ-79 `document_tree_nodes` + admin UI (node picker, `include_subtree`, `link_mode`). Consumed later by PROJ-80/82 retrieval.

## V2 Reference Material
- None.
- ADR to be created at `/architecture`: `docs/decisions/skill-allowed-actions.md` (enum + enforcement contract) and a note in `docs/decisions/skill-versioning.md` on the draft-mutability relaxation.

## User Stories
- **[V3 SK-07]** As a tenant admin, I want to link specific DMS document nodes to a Skill, so that the Skill's agent can read those documents at runtime through PROJ-80 retrieval. *(γ)*
- **[V3 SK-08]** As a tenant admin, I want to attach reusable input/output example pairs to a Skill, so that the agent learns expected patterns by example. *(β)*
- **[V3 SK-09]** As a tenant admin, I want to declare which actions a Skill's agent may perform (`propose_work_item`, `generate_document`, `read_only`, …), so that the agent cannot act outside its mandate. *(α — stored + validated here; enforced in PROJ-82/83)*
- **[V3 SK-10]** As a tenant admin, I want to keep editing a `draft` version until it's ready and then publish it in one step, without exposing half-finished changes to PMs. *(α)*
- **[V3 SK-11]** As a tenant admin editing a draft that a colleague changed underneath me, I want a clear conflict warning rather than silently overwriting their edit. *(α)*

## Acceptance Criteria

### α — Allowed-Actions (store + validate; enforce downstream)
- [ ] `allowed_actions: string[]` is accepted as an optional key in the skill-version `frontmatter` (PROJ-76 ships a `.strict()` frontmatter schema — it MUST be extended to permit this key; unknown *actions* still rejected).
- [ ] Values validated against a **fixed V1 enum** centralized in `src/lib/skills/allowed-actions.ts`: `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `generate_document`, `summarize_document`, `read_only`.
- [ ] Unknown action → 422 at save/publish time.
- [ ] `allowed_actions` is part of the immutable version content (changing it = a new/edited draft, published as a new active version) — so a skill's mandate is versioned and auditable.
- [ ] **Enforcement contract (deferred, documented — no dead code in α):** PROJ-82 proposal endpoints and PROJ-83 doc-generation MUST read the active version's `allowed_actions` and reject out-of-mandate actions with **403 + audit `skill.action_denied`** (`action_name` + reason). `read_only` present ⇒ no mutating action permitted. Empty/absent `allowed_actions` ⇒ **fail-closed** (no actions permitted) — this default is locked here.

### α — Editable draft → publish workflow (relaxes PROJ-76 immutability)
- [ ] A version with `status='draft'` is **editable in place**: admin PATCHes its `markdown_content` + `frontmatter` any number of times while it stays `draft`. `active` and `archived` versions remain fully immutable (PROJ-76 guarantee preserved).
- [ ] Drafts are invisible to PMs (PROJ-76 only exposes `active`).
- [ ] **Publish** = the existing PROJ-76 `activate_skill_version` path: previous `active` → `archived`, draft → `active`, `skills.current_version_id` updated, atomic. On publish the (now active) content is frozen.
- [ ] **"Neuer Entwurf"** creates a new `draft` version when there is no open draft (never mutates an `active` version's content). At most one open draft per skill at a time (locked default — avoids ambiguous "which draft publishes").
- [ ] **Concurrency:** draft edits require `skill_versions.updated_at`; the editing PATCH carries `If-Match: <updated_at>`; a stale value → **409** with a clear "draft changed underneath you" message (SK-11). `updated_at` is added to `skill_versions` in this slice.
- [ ] Immutability trigger change is verified by a live smoke: draft content-edit succeeds; active/archived content-edit still blocked (23514); PROJ-76 RPC-smoke + RLS-pentest remain green (regression).

### α — Rollback UX
- [ ] The detail-page version timeline shows status badges (draft / active / archived) and a "Rollback to this version" action on archived rows (PROJ-76 `rollback_skill_version` already exists).
- [ ] Rollback opens a confirmation dialog showing a text diff between the current active content and the target archived version's content.

### β — `skill_examples` table
- [ ] `id UUID PK, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, title TEXT NOT NULL, input TEXT NOT NULL, expected_output TEXT NOT NULL, tags TEXT[] NOT NULL DEFAULT '{}', display_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] Examples listed ordered by `display_order` then `created_at`.
- [ ] Empty `input` or `expected_output` → 422.
- [ ] RLS: tenant-scoped; read = admin (examples are authoring aids, not PM-facing in V1); write = `is_tenant_admin`. PROJ-10 audit-wired.
- [ ] Admin CRUD UI on the skill detail page (add/edit/reorder/remove).

### γ — `skill_knowledge_links` table
- [ ] `id UUID PK, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE, document_node_id UUID NOT NULL REFERENCES document_tree_nodes(id) ON DELETE CASCADE, include_subtree BOOLEAN NOT NULL DEFAULT false, link_mode TEXT NOT NULL CHECK (link_mode IN ('reference','required')), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] Unique `(skill_id, document_node_id)`.
- [ ] `link_mode='required'` ⇒ the node MUST be included in retrieval context (PROJ-80); `reference` ⇒ optional weighting.
- [ ] `include_subtree=true` ⇒ the node and its descendants are in scope.
- [ ] RLS: tenant-scoped; write = `is_tenant_admin`. The linked `document_node_id` MUST belong to the SAME tenant as the skill (cross-tenant link rejected).
- [ ] Admin UI on the skill detail page: DMS node picker (reuse PROJ-79 tree), `include_subtree` toggle, `link_mode` select, list + remove.
- [ ] PROJ-10 audit-wired.

### Audit (all slices, via PROJ-10)
- [ ] Events: `skill_version.published`, `skill_version.draft_discarded` (α); `skill_example.added` / `.updated` / `.removed` (β); `skill_knowledge_link.added` / `.removed` (γ).
- [ ] Deferred (PROJ-82/83): `skill.action_denied` (contract only in α).

## Edge Cases
- **Linked document node deleted in DMS** → `skill_knowledge_links` row cascade-deletes. If it was `link_mode='required'`, surface a warning on the skill detail page; downstream (PROJ-82) returns a soft warning rather than failing the action. *(γ)*
- **Skill has zero linked knowledge nodes** → permitted; agent runs prompt-only. *(γ)*
- **`allowed_actions` includes an unknown action** → 422 at save/publish. *(α)*
- **`allowed_actions` empty or absent** → fail-closed: agent may perform no mutating action (locked default). *(α)*
- **Two admins edit the same draft** → second PATCH with stale `If-Match` → 409 (SK-11). *(α)*
- **Publish race (two admins publish within the same instant)** → PROJ-76's single-active partial-unique + the atomic activate RPC guarantee exactly one winner; the loser gets a clean error, not a corrupt state. *(α)*
- **Admin tries to edit an `active` or `archived` version's content** → still blocked (23514) — immutability preserved for non-drafts. *(α)*
- **Example with PII** → out of scope to detect in V1; data-class tagging is PROJ-84's job (noted, not enforced here). *(β)*
- **Cross-tenant knowledge link attempt** (link a node from another tenant) → rejected (tenant-consistency check + RLS). *(γ)*

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Dialog`, `AlertDialog`, `Tabs`, `Badge`, `Select`, `Switch`; reuse PROJ-79 tree component for the node picker).
- **⚠ CIA MANDATORY at `/architecture`** for slice α: relaxing the deployed PROJ-76 `enforce_skill_version_immutability` trigger to allow in-place `draft` edits is a re-architecture of a deployed feature (continuous-improvement rule #3) with security-relevant blast radius (must not weaken active/archived immutability or the RLS/admin-gate). The `/architecture` pass must lock: exact trigger predicate (draft↔draft content change allowed, everything else blocked), how `updated_at` bumps interact with the trigger, and a regression proof that the PROJ-76 pentest + RPC-smoke stay green.
- **New dependency (α, CIA at `/architecture`):** a client-side text-diff for the rollback confirm dialog (`diff-match-patch` or a lighter alternative) — evaluate vs. a dependency-free line-diff before adding, given the recent supply-chain hardening (PROJ-140). Not needed if a minimal in-repo line-diff suffices.
- **Schema (α):** add `skill_versions.updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` + `extensions.moddatetime` trigger, reconciled with the immutability trigger.
- **`allowed_actions` enum** centralized in `src/lib/skills/allowed-actions.ts`; frontmatter Zod schema (PROJ-76 `.strict()`) extended to accept the key.
- **Multi-tenant:** all new tables carry `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`; RLS via `is_tenant_admin()` / `is_tenant_member()`; audit opt-in follows the PROJ-76 recipe (recreate audit helper fns from live defs + re-grant `authenticated` EXECUTE; add both tables to the `entity_type` CHECK, `_tracked_audit_columns`, `can_read_audit_entry`).
- **Live-RPC/RLS smoke Pflicht** before Approved (every new RPC/trigger + tenant-isolation, per project rule), 0 residue.
- **Auth:** Supabase Auth; admin gate on every write.

## Out of Scope
- `allowed_actions` **enforcement** (403 at action time) — owned by PROJ-82/83 (contract documented here).
- Example-based fine-tuning of the LLM (retrieval injection only, later in PROJ-80).
- Action policies beyond an allow-list (per-action rate limits, quotas).
- Knowledge-link weight tuning (V2).
- Example-driven evaluation harness ("does the agent actually produce expected_output?").
- PII detection in examples (PROJ-84 data-class tags).
- PM-facing surfacing of examples/knowledge links (authoring aids only in V1).

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> Authored 2026-07-24. **CIA-reviewed** (mandatory: re-architects the deployed PROJ-76 immutability trigger + a new dependency). CIA verdict: Q1 GO · Q2 GO · Q3 ADJUST → **user-locked to option (b) app-layer guard** · Q4 dep-free. Grounded against the live PROJ-76 migration + both regression smokes. ADRs: `docs/decisions/skill-allowed-actions.md` (new) + a relaxation note in `docs/decisions/skill-versioning.md`.

### What we're building (α)
Turn PROJ-76's write-once versions into an **editable-draft** authoring loop, and give a skill a **declared action mandate**. A `draft` version becomes editable in place until the admin **publishes** it (which freezes it and makes it the live version); `active`/`archived` versions stay exactly as immutable as PROJ-76 shipped them. Plus `allowed_actions` — a validated allow-list stored with each version, whose enforcement lands later in PROJ-82/83.

### The one decision that touches deployed code — draft-editability (CIA-locked, safe)
PROJ-76's version-immutability trigger today blocks **every** content change unless a controlled internal flag (set only by the activate/rollback operations) is present, and even then only the `status` may change. α adds **one new allowed path**: a content change is permitted, without that flag, **only when the row is a draft both before and after the change** (i.e. it stays `draft`) and none of its identity fields (which skill, which tenant, version number, author, creation time) change. Everything else — editing an `active` or `archived` version, or flipping a draft to active by a plain write — remains hard-blocked exactly as before. This "draft-in / draft-out on both sides" double-check is the security core and is stated as a firm invariant. Status transitions (publish, rollback) keep going only through the existing controlled operations.
- **Publish** reuses the deployed `activate` operation unchanged (previous active → archived, draft → active, pointer moved, atomic; the now-active content freezes).
- **Rollback** stays exactly as deployed (creates a copied version and activates it) — **no change to that operation** (Q3-b decision), so its proven behaviour and smoke are untouched.

### Concurrency & "one open draft" (Q3 → option b, app-layer)
- A new `updated_at` timestamp on versions (auto-maintained) powers optimistic concurrency: editing a draft requires the caller to send the `updated_at` it last saw (`If-Match`); if it no longer matches, the edit is rejected with **409** ("draft changed underneath you", SK-11). The immutability trigger is deliberately blind to `updated_at` (it may always bump) — verified by CIA, no interaction.
- **At most one open draft per skill** is enforced in the create-draft endpoint (if an open draft already exists → 409), **not** by a database constraint — because a DB "one draft" rule would break the deployed rollback operation (which briefly creates a draft). Accepted residual: two simultaneous admin create-draft requests could momentarily yield two drafts; this is benign (self-heals on publish) and documented.

### Allowed-actions (store + validate here; enforce in PROJ-82/83)
- `allowed_actions` becomes an optional key in a version's structured behaviour metadata (PROJ-76's metadata schema is extended to accept it). Values are checked against a **fixed V1 list** kept in one place in code: `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `generate_document`, `summarize_document`, `read_only`. Unknown value → rejected (422). Because it lives in the version's (immutable-once-published) content, a skill's mandate is versioned and auditable.
- **Enforcement contract (documented, not built here):** PROJ-82 (proposals) and PROJ-83 (doc-generation) read the active version's `allowed_actions` and refuse out-of-mandate actions with **403 + an audit `skill.action_denied` entry**. Empty/absent list ⇒ **fail-closed** (no mutating action allowed). This default is locked now so downstream can't accidentally choose fail-open.

### Rollback diff view (Q4 → dependency-free)
The rollback confirmation shows a **line-level text diff** (added / removed / unchanged) between the current active content and the target archived version. Implemented as a ~40-line in-repo helper — **no `diff-match-patch` dependency** (a read-only panel doesn't justify an unmaintained package right after the PROJ-140 supply-chain hardening). Character-level diffing is a demand-gated later nicety.

### β — Skill-Examples (standard EXTEND recipe)
A new `skill_examples` table (per skill: title, input, expected output, tags, display order), tenant-scoped, admin-writable, PROJ-10 audit-wired. Admin CRUD (add / edit / reorder / remove) on the skill detail page. Empty input or expected-output → 422. Examples are authoring aids — admin-only, not PM-facing in V1. No forks; follows the PROJ-107 catalog pattern.

### γ — Knowledge-Links (standard EXTEND recipe, references deployed PROJ-79 DMS)
A new `skill_knowledge_links` table linking a skill to a PROJ-79 document-tree node, with an `include_subtree` flag and a `link_mode` (`reference` = optional weighting / `required` = must be in retrieval context). Unique per (skill, node); the linked node must be in the **same tenant** as the skill (cross-tenant link rejected — consistency check + RLS). Admin UI reuses the PROJ-79 tree as a node picker. Deleting the node cascades the link away; a lost `required` link surfaces a warning (consumed later by PROJ-80/82). PROJ-10 audit-wired.

### Data model (plain language)
- **A skill version** (existing) gains: `updated_at` (concurrency) and an optional `allowed_actions` list inside its behaviour metadata. Draft versions become editable; active/archived stay frozen.
- **A skill example** (new): belongs to one skill + tenant; title, input text, expected-output text, tags, ordering.
- **A skill knowledge link** (new): belongs to one skill + tenant; points at one DMS node; subtree flag; reference/required mode.
All new tables carry `tenant_id` (cascade-delete with the tenant) and go through the established RLS helpers + the PROJ-76 audit-opt-in recipe (recreate audit helper functions from their live definitions, re-grant the authenticated execute, add the new tables to the audit allow-list / tracked-columns / read-gate).

### Component structure (UI — all on the existing skill detail page)
```
/stammdaten/skills/[id]  (admin, extends PROJ-76 detail)
+-- Version timeline (existing) — now with:
|   +-- "Entwurf bearbeiten" on the open draft (inline edit, If-Match)
|   +-- "Veröffentlichen" (publish = activate) on the draft
|   +-- "Neuer Entwurf" (guarded: 409 if a draft is open)
|   +-- "Zurückrollen" on archived rows → diff-confirm dialog (dep-free diff)
+-- "Bearbeiten" tab (existing) + new "Erlaubte Aktionen" multi-select (allowed_actions)
+-- "Beispiele" section (β) — add/edit/reorder/remove
+-- "Wissensquellen" section (γ) — DMS node picker + include_subtree + link_mode + list
```

### Backend need
Yes — 1 migration (α: `updated_at` + moddatetime + trigger relaxation + frontmatter-schema extension for `allowed_actions`; β/γ: two new tables + RLS + audit wiring), a new draft-PATCH endpoint (α) + endpoints for examples (β) and knowledge-links (γ), and the dep-free diff helper (frontend). No new external service. Publish/rollback reuse deployed operations.

### Dependencies (packages)
- **None.** Explicitly no `diff-match-patch` — a dependency-free in-repo line-diff is used instead (CIA NO-GO on the package).

### Mandatory verification (locked by CIA)
- Re-run **both** deployed PROJ-76 smokes + the RLS pentest → must stay green.
- Add **new draft-immutability smoke cases**: (H) draft content-edit without the internal flag → succeeds; (I) archived content-edit → still blocked; (J) draft→active by a plain write → still blocked (promotion only via the controlled operation).
- `If-Match` guard proven (stale value → 409); "one open draft" guard proven (second create → 409).
- Trigger function recreated → re-verify its execute grant stays revoked from public/anon/authenticated.
- Live-RPC/RLS smoke Pflicht before Approved, 0 residue.

### Slice / handoff order
`/backend` α → `/frontend` α → `/qa` α (deploy), then β, then γ (γ after confirming the PROJ-79 tree component is reusable as a picker). Each sub-slice is independently deployable.

### Deviations from the original (pre-refinement) spec
- Draft editing is **in-place with a status-gated trigger relaxation** (not "edit = always a new version"); rollback RPC is **not** modified (Q3-b); the "one open draft" rule is **app-layer, not a DB constraint**; the diff is **dependency-free**. All CIA-reviewed + user-locked 2026-07-24.

## Implementation Notes

### α backend (2026-07-24)

**Migration** `20260724144648_proj77_alpha_editable_drafts` (in Prod; repo version-matched):
- `skill_versions.updated_at` (auto via `extensions.moddatetime`, trigger `skill_versions_set_updated_at`) — powers `If-Match`.
- **`enforce_skill_version_immutability` recreated from the live def** with a second allowed branch: content/frontmatter/summary edits pass **only when `OLD.status='draft' AND NEW.status='draft'`** and identity fields (skill_id/tenant_id/version_number/created_by/created_at) are unchanged. GUC-branch (activate/rollback) unchanged; hard-block last. `updated_at` deliberately not compared (moddatetime bumps it). `search_path=''` + execute revoked from public/anon/authenticated preserved.
- **Rollback + activate RPCs untouched** (Q3-b).

**App layer:**
- `src/lib/skills/allowed-actions.ts` — fixed V1 enum (single source of truth); frontmatter Zod schema (`_schema.ts`, still `.strict()`) extended with `allowed_actions` (enum-validated, unknown → 422). `serialize.ts` + `SkillFrontmatter` + `SkillVersion.updated_at` + `SKILL_VERSION_SELECT` updated.
- **PATCH `/api/skills/[id]/versions/[vid]`** (new) — edit a draft in place, admin-only; 409 if not a draft; `If-Match: <updated_at>` → 409 on stale; write guarded by `updated_at` + `status='draft'` (race-safe). Trigger allows (stays draft); active/archived stay blocked.
- **One-open-draft guard** in POST `/versions` (409 if a draft exists) — app-layer, deployed rollback RPC untouched (benign race → max 2 drafts, documented).
- `patchSkillVersion` client wrapper (If-Match header).
- `src/lib/skills/diff.ts` — **dependency-free** LCS line-diff for the rollback confirm panel (no `diff-match-patch`).

**Verification (live vs Prod, 0 residue — CIA-locked):**
- **α draft-immutability smoke 4/4** (`tests/sql/PROJ-77-alpha-draft-immutability-smoke.sql`): H draft in-place edit allowed · I archived edit blocked (23514) · J draft→active plain-write blocked (23514) · K draft identity mutation blocked.
- **Regression:** PROJ-76 `rpc-smoke` **8/8** + `rls-pentest` **11/11** re-run **green under the α trigger**.
- Advisors **0 ERROR** (only the by-design activate/rollback SECURITY-DEFINER WARNs, unchanged).

**Quality gates:** vitest **40/40** skills (serialize + diff [6 cases] + skills routes + versions POST one-draft + versions/[vid] PATCH [9 cases]); tsc **0** skill errors; ESLint 0 on new/changed; build clean.

### α frontend (2026-07-24)

Reworked the existing `skill-detail-client.tsx` into a draft-centric authoring loop + one new dialog `skill-rollback-diff-dialog.tsx`:
- **Draft edit-in-place:** `openDraft` = the `status='draft'` version. When one exists → editable "Entwurf bearbeiten (vN)" card (body + behaviour fields + **allowed-actions multi-select** via reused `SkillTagPicker` + change_summary) with **"Entwurf speichern"** (`patchSkillVersion` with `If-Match = openDraft.updated_at`) and **"Veröffentlichen"** (confirm → `activateSkillVersion`). When none → **"Neuer Entwurf"** card (`createSkillVersion` seeded from the active version).
- **Optimistic concurrency:** save splices the returned version (fresh `updated_at`) back into state → the next save's `If-Match` is current (no skeleton flash). Stale/conflict → toast + `refresh()`.
- **Timeline:** the draft row's primary action is **"Veröffentlichen"**; archived rows open the **rollback diff-confirm dialog** (`lineDiff` + `diffStats`, +N/−M header, green/red/muted lines, empty-diff copy) → `rollbackSkillVersion`.
- **allowed-actions** bound to `frontmatter.allowed_actions` with a fail-closed helper note; German labels for the 8 enum values.

**Deviations (accepted):** (1) save = soft local update, not full `refresh()` (keeps editing context; create/publish/rollback still full-refresh); (2) archived rows expose only "Zurückrollen" (the α restore path via diff-confirm), removing PROJ-76's direct "Aktivieren" on archived — end-state equivalent, cleaner immutable history; (3) **409 detection by server-message fragment** because the shared `skills/api.ts` wrapper discards HTTP status — robust for the current stable English messages; exposing `err.status` in the wrapper is a small hardening follow-up (flag at `/qa`).

**Gates (independently re-verified):** ESLint 0 on both files; tsc 0 skill errors; vitest 40/40 skills (unchanged); production build clean.

**Remaining:** `/qa` α — Playwright auth-gates on the new PATCH route + If-Match/one-draft/publish/rollback E2E; re-confirm the live smokes. β/γ are separate later slices.

## QA Test Results

### α (2026-07-27) — **PRODUCTION-READY** (0 Critical / 0 High) · Status → Approved

**Security audit (red-team, live vs Prod, 0 residue) — the α trigger relaxation is the risk surface:**
- **α security pentest 4/4** (`tests/sql/PROJ-77-alpha-security-pentest.sql`) — the critical proof: **a non-admin member CANNOT edit a draft (0 rows, RLS admin-gate)** even though the relaxed trigger structurally allows draft edits; **admin can** (1 row applied); admin editing an **archived** version → blocked (23514); admin flipping **draft→active by plain write** → blocked (23514, promotion only via the activate RPC). The relaxation did not weaken the admin-gate or active/archived immutability.
- **α draft-immutability smoke 4/4** (`tests/sql/PROJ-77-alpha-draft-immutability-smoke.sql`): H draft-edit allowed · I archived blocked · J promotion blocked · K identity frozen.
- **Regression under the α trigger:** PROJ-76 `rpc-smoke` **8/8** + `rls-pentest` **11/11** re-run green.
- Advisors **0 ERROR** (only the by-design activate/rollback SECURITY-DEFINER WARNs).

**AC coverage (α):**
| AC | Evidence |
|---|---|
| allowed_actions stored + enum-validated (422 on unknown) | frontmatter Zod extension; route test "400 on unknown allowed_action"; serialize includes it |
| allowed_actions fail-closed enforcement | contract documented + ADR; deferred to PROJ-82/83 (not built here) |
| draft editable in place; active/archived frozen | trigger draft-branch; α smoke H/I + security A1/A2 |
| `updated_at` + If-Match 409 on stale | migration + PATCH route; route test "409 on stale If-Match" |
| one open draft per skill (409) | POST /versions guard; route test "409 when an open draft exists" |
| publish = activate; rollback unchanged | reuses deployed RPCs; rpc-smoke 8/8 green |
| rollback diff-confirm | `lineDiff`/`diffStats` + `skill-rollback-diff-dialog`; diff unit tests 6/6 |

**Automated tests:** full vitest regression **2463/2463**; PROJ-77 unit/route **40/40** skills (serialize, dep-free diff [6], skills routes, versions POST one-draft [2], versions/[vid] PATCH [9]); **Playwright `tests/PROJ-77-skill-customizing.spec.ts` 2/2 chromium** (PATCH route auth-gated, incl. with If-Match).

**Findings:**
- **0 Critical, 0 High, 0 Medium.**
- **Low / follow-up:** the client detects 409 by server-message fragment because the shared `skills/api.ts` wrapper discards the HTTP status (frontend deviation 3). Robust for the current stable English messages; exposing `err.status` in the wrapper is a small hardening follow-up (PROJ-Y candidate) — no functional impact (worst case a 409 falls to a generic error toast; data stays safe).
- **Info / deviations (accepted):** save = soft local update (keeps editing context); archived rows expose only "Zurückrollen" (α restore path via diff-confirm), removing PROJ-76's direct "Aktivieren" on archived (end-state equivalent, cleaner immutable history).
- **Env:** Mobile-Safari Playwright skipped (WebKit host libs, PROJ-67/F2). Chromium green.

**Note:** authenticated E2E of the full edit→publish→rollback flow is covered at the DB/route layer (live pentests + 40 unit/route tests) rather than a browser fixture, per the project's established skill-framework QA pattern (auth-gate E2E + live smokes). β/γ remain separate later slices.

### β (2026-07-27/28) — `skill_examples` — **PRODUCTION-READY** (0 Critical / 0 High)

**Backend:** migration `20260727160552_proj77_beta_skill_examples` (in prod) — `skill_examples` table (title/input/expected_output/tags/display_order + updated_at), **4 admin-only RLS policies** (authoring aids, not PM-facing in V1), moddatetime, PROJ-10 audit-wired (trio patched from live defs via anchor-replace + `authenticated` EXECUTE re-granted). GET/POST `/api/skills/[id]/examples` + PATCH/DELETE `.../[eid]`; empty title/input/expected_output → 400 (Zod `min(1)`; repo convention vs the spec's 422 — documented deviation). Client wrappers + `SkillExample` type.

**Frontend:** admin-only "Beispiele" CRUD section (`skill-examples-section.tsx`) mounted on the skill detail page (list sorted by display_order; add/edit shared Dialog with client non-empty validation; delete AlertDialog; all states + a11y; renders null for non-admins).

**QA — security (live vs prod, 0 residue):** β smoke **6/6** (`tests/sql/PROJ-77-beta-skill-examples-smoke.sql`): non-admin member cannot SELECT (0, admin-only) / INSERT (42501) / UPDATE (0 rows); non-member stranger sees 0 (isolation); admin reads (1) + edits (1 row) with a field-level **audit** row written. Advisors: RLS enabled + 4 policies (0 new ERROR). **Automated:** full vitest regression **2505/2505**; PROJ-77 skills unit/route **57/57** (incl. 15 new example route tests); **Playwright `tests/PROJ-77-beta-skill-examples.spec.ts` 4/4 chromium** (all 4 example routes auth-gated). Findings: **0 Critical/High/Medium**; deviation: empty→400 not 422 (codebase convention). γ remains a separate later slice.

### γ (2026-07-28/29) — `skill_knowledge_links` → PROJ-79 DMS — **PRODUCTION-READY** (0 Critical / 0 High)

**Backend:** migration `20260728150536_proj77_gamma_skill_knowledge_links` (in prod) — `skill_knowledge_links` (skill ↔ DMS `document_tree_nodes`, `include_subtree`, `link_mode` reference/required) + `unique(skill_id, document_node_id)` + **4 admin-only RLS policies** + a **SECURITY DEFINER tenant-consistency trigger** (skill + node + tenant must all match; a cross-tenant node is rejected regardless of RLS visibility) + moddatetime + PROJ-10 audit (trio patched from live defs + re-grant). GET/POST + PATCH/DELETE routes; duplicate → 409, cross-tenant/invalid node → 422, skill-not-found → 404. Client wrappers + `SkillKnowledgeLink` type.

**Frontend:** admin-only "Wissensquellen" section on the skill detail page. Node picker reuses PROJ-79 DMS (`useProjects` + `fetchDocumentTree(projectId)`): project → node path-label Select + `include_subtree` + `link_mode`. Existing links resolve node names via an RLS-scoped `document_tree_nodes` read (no cross-project get-node-by-id API exists — documented deviation; columns exist → schema-drift clean). Inline edit + remove-confirm; 409/422 friendly toasts.

**QA — security (live vs prod, 0 residue):** γ smoke **7/7** (`tests/sql/PROJ-77-gamma-skill-knowledge-links-smoke.sql`): same-tenant link ok; **cross-tenant node rejected (23514 trigger)**; duplicate rejected (23505); admin update + field-level audit; non-admin member cannot read/write; non-member sees 0. **Regression finding caught in QA:** a concurrent session's migration had recreated `_tracked_audit_columns` from a pre-γ live def and dropped the `skill_knowledge_links` branch (only that branch; `can_read_audit_entry` + `entity_type` CHECK + trigger survived) → `include_subtree`/`link_mode` edits stopped being audited. Fixed by an idempotent reconcile migration `20260729110215_proj77_gamma_reconcile_tracked_audit_columns` (anchor-replace re-add, no-op if present; sorts last so fresh-replay ends correct). Post-fix smoke 7/7 (G6 audit restored). **Automated:** full vitest **2538/2538**; skills unit/route **75/75** (incl. 18 new knowledge-link route tests); **Playwright `tests/PROJ-77-gamma-skill-knowledge-links.spec.ts` 4/4 chromium** (all 4 routes auth-gated). Findings: **0 Critical/High/Medium**. No new dependency.

## Deployment

**Slice γ — Deployed 2026-07-29 · Tag `v2.28.0-PROJ-77-gamma`** (squash-merge PR #277 → `main` `187ab51`). **PROJ-77 is now COMPLETE (α + β + γ all deployed).** Migrations `20260728150536` (skill_knowledge_links) + `20260729110215` (audit reconcile) in prod since `/backend`+`/qa`; deploy = code-merge + bookkeeping. Merged latest main (PROJ-141 audit-remediation + β-closure) conflict-free. Post-deploy prod smoke: GET `/api/skills/[id]/knowledge-links` + `.../[lid]` → 307 (auth-gate live). No new dependency/env.

**Open follow-ups (PROJ-Y candidates, unchanged):** expose HTTP status in `skills/api.ts` (409-by-message); `@hono/node-server` moderate advisory; rendered-Markdown preview / skill import (from α); the audit "Verlauf" tab (`AuditEntityType` widening, from PROJ-76).

**Slice β — Deployed 2026-07-28 · Tag `v2.27.0-PROJ-77-beta`** (squash-merge PR #269 → `main` `abbe613`). Migration `20260727160552` in prod since `/backend`; deploy = code-merge + bookkeeping. Post-deploy prod smoke: GET `/api/skills/[id]/examples` + `.../[eid]` → 307 (auth-gate live). No new dependency/env. γ (`skill_knowledge_links` → PROJ-79 DMS) remains the last slice.

**Slice α — Deployed 2026-07-27 · Tag `v2.24.0-PROJ-77-alpha`** (squash-merge PR #261 → `main` `b65a239`).

- Migration `20260724144648_proj77_alpha_editable_drafts` was applied to prod during `/backend`; this deploy is code-merge + bookkeeping.
- **Supply-chain blocker resolved first:** the `npm audit --omit=dev --audit-level=high` Required-Check was failing repo-wide on two newly-published HIGH CVEs in existing deps (postcss `8.5.15`, brace-expansion) — unrelated to α. Fixed in a separate CIA-reviewed PR #264 (`chore/supply-chain-audit`: postcss → `^8.5.23`, brace-expansion → `5.0.8` via non-breaking `npm audit fix`; `@hono/node-server` moderate deferred → PROJ-Y). α branch then updated with main → all Required-Checks green.
- Post-deploy prod smoke: `PATCH /api/skills/[id]/versions/[vid]` + `/stammdaten/skills` + `/skills` → **307** (auth-gate intact; new draft-edit route live).
- No new dependency (α); no new env/secret.

**Open follow-ups (PROJ-Y candidates):**
- Expose HTTP status in `src/lib/skills/api.ts` so the client stops detecting 409 by server-message fragment (QA Low finding).
- `@hono/node-server` moderate advisory (needs a breaking MCP-SDK bump).
- **β (skill_examples) and γ (skill_knowledge_links → PROJ-79 DMS)** remain to be built as separate slices.
