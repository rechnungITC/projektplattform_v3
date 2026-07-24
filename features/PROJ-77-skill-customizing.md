# PROJ-77: Skill-Customizing

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-07-24

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
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
