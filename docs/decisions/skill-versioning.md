# Decision Record — Skill Versioning & Activation Semantics

**V3-original (no V2 heritage)** · Date: 2026-07-23 · Concerns: PROJ-76 (Skill-Framework Foundation)

**Input:** PROJ-76 spec (SK-02/03/04) · existing PROJ-20 `decisions` immutability precedent · project state-machine-RPC convention.
**Status:** Accepted.

---

## Context

Admins must iterate on a skill without losing prior content (SK-02), roll back quickly (SK-03), and stage changes before they go live to PMs (SK-04). This needs an immutable version history with a single live version at a time — but the repo has no "current-version pointer + activate/rollback" precedent. The closest reusable pattern is PROJ-20 `decisions` (immutable body + supersedes chain enforced by a BEFORE-UPDATE trigger), and the platform-wide convention that any status transition goes through a `SECURITY DEFINER` RPC rather than a direct `UPDATE`.

## Decision

**Immutable version rows + a single active version, with all transitions behind SECURITY DEFINER RPCs.**

- `skill_versions` rows are **content-immutable**: once written, `markdown_content`, `frontmatter`, and `version_number` never change. A BEFORE-UPDATE trigger rejects content mutation (mirrors `enforce_decision_immutability`); only `status` may change, and only via the controlled path.
- **At most one `active` version per skill**, enforced at the database level by a partial-unique guarantee (`status = 'active'` per `skill_id`), belt-and-suspenders with the `skills.current_version_id` pointer maintained by the activation RPC.
- **Activate(version)** — `SECURITY DEFINER`, admin re-checked internally, no actor parameter (`auth.uid()`, impersonation-safe): sets target `active`, demotes the prior active to `archived`, repoints `current_version_id`, atomically.
- **Rollback(version)** — creates a **new** version (`number = max + 1`) with content copied from the chosen archived version, then activates it. No historical row is ever mutated (satisfies AC line 60 + edge case line 77).
- **Create-skill** seeds an initial `draft` v1. **Create-draft-version**, **PATCH metadata**, and **toggle skill active/inactive** are ordinary admin writes (no state-machine risk), guarded by RLS.
- **Staging semantics:** activating a version on an inactive skill flags the version live but the skill stays hidden from PMs until the admin toggles the skill active — the two switches are independent (satisfies edge case line 76).

## Consequences

- **Positive:** Full audit-able history; fast recovery; no destructive edits; consistent with the platform's proven immutability + RPC-transition patterns; RLS + RPC hardening (internal admin re-check, `auth.uid()`) match existing security rules.
- **Audit wiring (critical):** both `skills` and `skill_versions` opt into PROJ-10 field-level audit; the audit helper functions (`_tracked_audit_columns`, `record_audit_changes`, `can_read_audit_entry`, the `entity_type` CHECK) are recreated from their **current live definitions** in the same migration, preserving all sibling entity branches, and the `authenticated` EXECUTE grant on `can_read_audit_entry` is re-granted afterward (recreation silently drops it and breaks the History tab). Base off the most recent recreation (PROJ-117 migration).
- **Negative / accepted:** rollback grows the version count (new row per rollback) rather than re-pointing — accepted for a clean immutable chain.
- **Deferred:** hard-delete of a skill (V1 = deactivate only); referential integrity with PROJ-78 assignments must be designed before delete is added.

See also: [skills-data-model.md](skills-data-model.md).
