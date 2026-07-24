# Decision Record — Skill Allowed-Actions (mandate allow-list)

**V3-original (no V2 heritage)** · Date: 2026-07-24 · Concerns: PROJ-77-α (Skill-Customizing), enforced by PROJ-82 / PROJ-83

**Input:** PROJ-77 refined requirements (2026-07-24) · CIA architecture review (2026-07-24, GO).
**Status:** Accepted.

---

## Context

A skill (PROJ-76) defines agent behaviour. PROJ-82 (skill-driven AI proposals) and PROJ-83 (task-driven content generation) will let a skill's agent perform mutating actions (create proposals, generate documents). Without an explicit mandate, a mis-authored or over-broad skill could take actions outside its intended scope. PROJ-77-α introduces a declared **allow-list** of the actions a skill may perform. Enforcement, however, belongs where the actions actually execute (PROJ-82/83) — not in PROJ-77.

## Decision

**A skill version carries an optional `allowed_actions` list; PROJ-77 stores + validates it, PROJ-82/83 enforce it fail-closed.**

- `allowed_actions` is an optional key in the skill version's behaviour metadata (extends the PROJ-76 `.strict()` frontmatter schema). Because it lives in the version content — immutable once published — a skill's mandate is **versioned and auditable**.
- Values are validated against a **fixed V1 enum**, single-sourced in `src/lib/skills/allowed-actions.ts`: `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `generate_document`, `summarize_document`, `read_only`. Unknown value → 422 at save/publish.
- **Enforcement contract (owned by PROJ-82/83, not PROJ-77):** before performing an action, the endpoint reads the active version's `allowed_actions` and, if the action is not listed, rejects with **403 + an append-only audit `skill.action_denied`** entry (`action_name` + reason).
- **Fail-closed default (locked here):** an empty or absent `allowed_actions` ⇒ **no mutating action permitted**. `read_only` present is an explicit "no mutations" marker. Downstream MUST NOT interpret absence as fail-open.

## Consequences

- **Positive:** mandate is declarative, versioned, auditable; no dead enforcement code in PROJ-77 (the contract is documented, built where actions exist); fail-closed default prevents an accidental privilege hole downstream.
- **Deferred:** the 403 + `skill.action_denied` enforcement + audit event land in PROJ-82/83 (they add the entity/event when they build the action surfaces).
- **Out of scope:** per-action rate limits / quotas (allow-list only); the enum is fixed in V1 — new action kinds extend it in code alongside the feature that introduces them.

See also: [skills-data-model.md](skills-data-model.md), [skill-versioning.md](skill-versioning.md).
