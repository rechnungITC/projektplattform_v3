# PROJ-44: Context Ingestion Pipeline

## Status

Planned

## Summary

Create the intake layer for documents, emails, meeting notes, and other project context sources. PROJ-12 already owns AI routing and privacy paths; this feature owns the structured source model, normalization pipeline, source traceability, and reviewable extraction queue.

## Source Requirements

- `docs/architecture/target-picture.md`
- `docs/decisions/metadata-model-context-sources.md`
- `docs/PRD.md`
- `docs/VISION.md`

## Dependencies

- Requires: PROJ-1 tenant isolation
- Requires: PROJ-10 audit
- Requires: PROJ-12 data privacy and AI proposal rules
- Influences: PROJ-30 narrative generation
- Influences: PROJ-34 communication tracking
- Influences: PROJ-39 assistant action packs

## User Stories

### ST-01 Context Source Registry
As a project lead, I want documents, emails, and meeting notes to be registered as context sources so that every derived proposal has a source anchor.

Acceptance criteria:
- [ ] Context sources are tenant-scoped and project-scoped.
- [ ] Source type, title, author/sender, received date, and origin metadata are stored.
- [ ] Each source has a privacy classification status.

### ST-02 Normalization Queue
As the system, I want source content normalized into sections and metadata so that downstream AI and rule logic can process it consistently.

Acceptance criteria:
- [ ] Large inputs are split into stable sections.
- [ ] Section hashes allow idempotent reprocessing.
- [ ] Failed normalization is visible and retryable.

### ST-03 Extraction Proposals
As a project lead, I want extracted tasks, risks, decisions, dependencies, and open items to appear as reviewable proposals.

Acceptance criteria:
- [ ] Extracted items are never written directly into core tables.
- [ ] Each proposal links back to source and section.
- [ ] Accepted/rejected/modified states are auditable.

### ST-04 Privacy Defense
As a tenant admin, I want Class-3 data to be blocked from external providers before extraction so that sensitive context cannot leak.

Acceptance criteria:
- [ ] Class-3 sections route only to local/allowed providers.
- [ ] If no safe provider exists, extraction is skipped with a visible reason.
- [ ] Logs never include raw sensitive content.

## Out of Scope

- Provider-specific inbox sync. Use connector follow-up specs.
- OCR and antivirus scanning. Storage hardening should be a separate infrastructure slice.
- Autonomous mutation of project data.

## Technical Requirements

- New tables must include `tenant_id` and RLS.
- Store raw content only if retention and privacy policy allow it; otherwise store metadata and section references.
- Proposal output must align with PROJ-12 `ki_runs` and audit conventions.

## V2 Reference Material

- `docs/decisions/metadata-model-context-sources.md`
- `docs/decisions/v3-ai-proposal-architecture.md`
- `docs/architecture/target-picture.md`

