# Dashboard Design Templates

Visual reference HTML for V3 dashboards. Each file is a self-contained, browser-openable mockup using the shared dark-teal design system (see [`../design-system.md`](../design-system.md)).

## When to use which template

| Template | Use for | Spec link |
|---|---|---|
| [`scrum-dashboard.html`](scrum-dashboard.html) | Scrum project rooms — bento KPIs (Health, Budget, Velocity), radar chart for dimensional balance, burn-rate trend | PROJ-7 (Project Room) when the active method is Scrum |
| [`pmi-dashboard.html`](pmi-dashboard.html) | PMI / Waterfall / classic project rooms — left column with project-status cards, KPI grid, area chart for resource workload, right column with critical blockers + upcoming milestones | PROJ-7 when method is PMI / Waterfall / PRINCE2 |
| [`budget-controlling.html`](budget-controlling.html) | Budget / controlling views — KPI summary (Total Budget, Burn Rate, Remaining), trajectory chart (Planned/Actual/Forecast), threshold-deviation alert table | PROJ-15+ (financial controlling) and any project budget tab |
| [`project-dependencies.html`](project-dependencies.html) | Dependency graphs / critical-path visualization — node graph with critical path highlight, blocked nodes, side panel with selected-node details | PROJ-7 dependency tab, future PROJ-X (integrations / cross-project) |
| [`stakeholder-matrix.html`](stakeholder-matrix.html) | Stakeholder Influence/Interest matrix — quadrant scatter plot with sentiment-colored dots, key-players list with power bars | PROJ-8 (Stakeholders) main page |
| [`stakeholder-persona.html`](stakeholder-persona.html) | Single-stakeholder profile — radar of skill/personality dimensions, last-meeting recap, AI advisor chat panel | PROJ-8 stakeholder detail page |
| [`work-package-evaluation.html`](work-package-evaluation.html) | Work package / task evaluation — KPI summary (Total/Critical/Completion/Days), execution timeline matrix (planned vs actual bars), Insight Engine sidebar, task detail card | PROJ-9 (Work Items / Backlog) and PROJ-19 (Phases & Milestones) execution views |

## How to use these in implementation

1. **Read the relevant template** when designing a feature page — open the HTML in a browser to see the visual.
2. **Reuse the design tokens** from [`../design-system.md`](../design-system.md) — these are the canonical colors, spacing, and typography for V3 dashboards. They differ from the shadcn defaults currently used by PROJ-1 / PROJ-2 (which can be migrated later).
3. **Build with shadcn/ui primitives** — these mockups use raw Tailwind for compactness. In production code, prefer shadcn `Card`, `Badge`, `Table`, `DropdownMenu`, `Dialog`, etc. — the design system maps cleanly onto shadcn's CSS-variable theming.
4. **Don't copy the embedded Tailwind config** — that's only for the standalone-HTML preview. Apply the tokens via `tailwind.config.ts` (or inline via `--*` CSS variables in `globals.css`) instead.

## Migration path

Today, PROJ-1 and PROJ-2 UIs use shadcn defaults (mostly `bg-background`, `text-foreground` with the standard light/dark theme). When PROJ-7 (Project Room), PROJ-8 (Stakeholders), and PROJ-9 (Work Items) are built, they will be the **first features** using the new dark-teal design tokens. Once those land, a follow-up may apply the same theme retroactively to PROJ-1 / PROJ-2 settings + auth pages.

Until then: the templates are *prescriptive* for new dashboard work, not *retroactive* for existing pages.
