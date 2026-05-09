---
paths:
  - "features/**"
  - "docs/design/**"
  - "src/app/**"
  - "src/components/**"
---

# Designer Rules

## Purpose

The Designer role defines product UX before frontend implementation. It turns requirements into a modern, implementable project-management interface.

## Mandatory Context

Before producing a design:

1. Read `features/INDEX.md`.
2. Read the target feature spec.
3. Read relevant dashboard templates in `docs/design/dashboards/`.
4. Read `docs/design/design-system.md`.
5. Inspect existing UI components and routes that the design will affect.

## Modern Project-Management Baseline

Use these patterns as the product benchmark:

- **Jira:** backlog, board, list, timeline, dependency mapping, reports, capacity, contextual insights.
- **ClickUp:** many interchangeable views, hierarchy, dashboards, workload, docs/chat/task context, quick create, saved perspectives.
- **monday.com:** visual dashboards, portfolio rollups, workload, Gantt, baseline, critical path, project intake and approvals.

Do not copy branding or visuals from these tools. Extract workflow patterns and adapt them to the local V3 design system.

## Required UX Decisions

Every design for a data-heavy feature must specify:

- Default view and why it is default.
- Secondary views: list/table, board, timeline/Gantt, calendar, workload, dashboard.
- Filters, grouping, sorting, and saved views.
- Search behavior and empty search results.
- Inline edit opportunities.
- Bulk actions.
- Quick-create entry points.
- Drill-down behavior: drawer, modal, page, or side panel.
- Dashboard/rollup metrics.
- Permissions and disabled states.
- Mobile and tablet layout.
- Loading, empty, error, offline, and stale-data states.
- Keyboard navigation and accessibility behavior.

## Product Surface Rules

- Dashboard pages should show actionable work, not placeholder welcome cards.
- Project rooms should separate **Summary** from **Workbench**.
- Boards should show contextual metrics and WIP signals, not only columns.
- Lists/tables should support fast scanning and inline updates where safe.
- Timeline/Gantt views should expose dependencies, critical path, baseline variance, and slipped dates.
- Workload views should show capacity as green/yellow/red bands and support reassignment decisions.
- Risk and budget views should surface exceptions first.
- Global navigation should support "My Work" or Inbox-style daily execution.

## Visual Design Rules

- Follow the V3 Material-3-inspired dark-teal token system where dashboard surfaces are involved.
- Use shadcn/ui primitives as the implementation target.
- Prefer dense, calm, operational layouts.
- Avoid decorative cards, oversized hero layouts, and marketing-style pages for internal tools.
- Use icons for actions where familiar and pair with labels only when clarity requires it.
- Preserve responsive behavior at 375px, 768px, and 1440px.

## Output Quality

Design output must be implementable. Avoid vague recommendations like "make it modern".

Use concrete details:

- Component names or proposed component names.
- Route/page placement.
- Data shown in each region.
- Interaction rules.
- Edge states.
- Acceptance criteria for the frontend handoff.

## Scope Discipline

If the current feature does not include backend support for a design idea, mark it as:

- **Now:** implementable with current APIs/data.
- **Next:** requires small API or state addition.
- **Later:** product roadmap item.

Never hide backend or data-model requirements inside a frontend-only recommendation.
