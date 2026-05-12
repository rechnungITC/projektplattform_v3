# PROJ-45: Construction Extension

## Status

Planned

## Summary

Add construction-project specialization on top of the shared project core: trades, construction sections, inspections/acceptances, defects, daily progress signals, and construction-aware schedule views. The extension must not redefine core projects, phases, work items, risks, or dependencies.

## Source Requirements

- `docs/architecture/target-picture.md`
- `docs/projektplattform_skills/home/ubuntu/skills_markdown/bauleitung/`
- `docs/PRD.md`

## Dependencies

- Requires: PROJ-6 project type and method catalog
- Requires: PROJ-9 work item metamodel
- Requires: PROJ-19 schedule backbone
- Requires: PROJ-25 Gantt foundation
- Influences: PROJ-21 output variants

## User Stories

### ST-01 Trades and Sections
As a construction project lead, I want trades and construction sections represented explicitly so that work can be planned in the language of the site.

Acceptance criteria:
- [ ] Trades are tenant-configurable but project-assignable.
- [ ] Sections can group phases, work packages, defects, and inspections.
- [ ] Core work items remain unchanged and reference extension records.

### ST-02 Inspections and Acceptances
As a construction project lead, I want inspections and acceptances tracked with status, due date, responsible role, and evidence links.

Acceptance criteria:
- [ ] Acceptance records can reference work items, milestones, or sections.
- [ ] Missing or failed acceptances can create risks/open items.
- [ ] Acceptance state is auditable.

### ST-03 Defect Tracking
As a site manager, I want defects linked to trade, section, responsible vendor, and resolution deadline.

Acceptance criteria:
- [ ] Defects are tenant/project-scoped.
- [ ] Defects can become work items or risks through reviewable proposals.
- [ ] Defect status changes are visible in project health.

### ST-04 Construction Schedule Signals
As a project lead, I want construction-specific schedule signals such as section progress and trade blockers to be visible in Gantt and reports.

Acceptance criteria:
- [ ] Construction signals read from core schedule and extension tables.
- [ ] Gantt remains usable without construction extension enabled.
- [ ] Reports can include construction-specific sections when module is active.

## Out of Scope

- Full BIM integration.
- Legal VOB automation beyond compliance tags.
- Mobile offline site diary.

## Technical Requirements

- Extension tables must reference core objects rather than alter their semantics.
- Module visibility must follow tenant settings.
- All extension data must be tenant-scoped with RLS.

## V2 Reference Material

- `docs/projektplattform_skills/home/ubuntu/skills_markdown/bauleitung/`
- `docs/decisions/v3-code-extension-pattern.md`

