# PROJ-46: Software Project Extension

## Status

Planned

## Summary

Deepen software-project support beyond generic Scrum objects: releases, technical dependencies, test and acceptance traceability, and delivery-readiness views. This builds on PROJ-9, PROJ-26, and PROJ-28 without turning the shared core into a Jira clone.

## Source Requirements

- `docs/architecture/target-picture.md`
- `docs/projektplattform_skills/home/ubuntu/skills_markdown/software/`
- `docs/PRD.md`

## Dependencies

- Requires: PROJ-6 method catalog
- Requires: PROJ-9 work item metamodel
- Requires: PROJ-26 method gating
- Requires: PROJ-28 method-aware navigation
- Influences: PROJ-47/50 Jira connector features

## User Stories

### ST-01 Releases
As a software project lead, I want releases as first-class planning containers so that delivery scope and dates are visible above sprint level.

Acceptance criteria:
- [ ] Releases are project-scoped and tenant-scoped.
- [ ] Work items can be assigned to a release.
- [ ] Release status and target date are visible in software method navigation.

### ST-02 Technical Dependencies
As a delivery lead, I want technical dependencies to be distinguished from business dependencies so that architecture blockers are visible.

Acceptance criteria:
- [ ] Dependencies can carry type and technical rationale.
- [ ] Cross-project technical dependencies can reference PROJ-27 links.
- [ ] Critical dependencies are reportable.

### ST-03 Test and Acceptance Traceability
As a test manager, I want tests and acceptance checks linked to requirements/stories so that release readiness can be evaluated.

Acceptance criteria:
- [ ] Test cases can reference work items and releases.
- [ ] Failed tests can create bugs or open items via review.
- [ ] Release readiness includes unresolved critical bugs and missing acceptance checks.

### ST-04 Jira Compatibility
As an integration owner, I want software extension fields to map cleanly to Jira export/sync so that teams can connect without duplicate modeling.

Acceptance criteria:
- [ ] Release, dependency, and test fields have stable mapping names.
- [ ] Jira connector specs can consume the mapping without schema ambiguity.

## Out of Scope

- Replacing Jira as an issue tracker.
- CI/CD pipeline execution.
- Source-code scanning.

## Technical Requirements

- Use extension tables or typed metadata instead of redefining `work_items`.
- Keep method gating strict: software-only surfaces must not appear in non-software methods unless explicitly configured.
- All new data must be tenant-scoped and RLS-protected.

## V2 Reference Material

- `docs/projektplattform_skills/home/ubuntu/skills_markdown/software/`
- `docs/decisions/work-item-metamodel.md`
- `docs/decisions/method-object-mapping.md`

