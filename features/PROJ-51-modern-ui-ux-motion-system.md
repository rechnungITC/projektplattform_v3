# PROJ-51: Modern UI/UX & Motion System

## Status

Planned

## Summary

Define and implement a modern, consistent UI/UX refresh for the platform without introducing a second design system. The feature standardizes motion, interaction states, layout density, accessibility, and visual polish on top of the existing Next 16 / React 19 / Tailwind / Radix / shadcn stack.

The goal is not decorative animation. Motion must improve orientation, feedback, perceived performance, and confidence in data-heavy project workflows.

The refresh must also support tenant or customer corporate styling for selected UI elements. Corporate colors, subtle shadows, and hover effects should be configurable through controlled tokens and variants, not through one-off inline styles.

## Source Requirements

- Current stack: Next.js 16, React 19, Tailwind CSS, Radix UI, shadcn-style local components, Sonner
- Tailwind animation and reduced-motion utilities: https://tailwindcss.com/docs/animation/
- Motion for React: https://motion.dev/docs/react
- View Transition API: https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- shadcn/ui component catalog: https://ui.shadcn.com/docs/components
- Existing design target: `docs/design/design-system.md`
- Existing navigation and project-room surfaces: PROJ-23, PROJ-28, PROJ-36, PROJ-25b
- Existing tenant branding surface: PROJ-17

## Dependencies

- Requires: PROJ-4 platform shell and RBAC navigation
- Requires: PROJ-17 tenant branding and administration foundation
- Requires: PROJ-23 global sidebar navigation
- Requires: PROJ-28 method-aware project-room navigation
- Requires: PROJ-29 lint and baseline hygiene
- Requires: PROJ-42 schema-drift guard for data-surface safety
- Influences: PROJ-25 / PROJ-25b drag-and-drop UX
- Influences: PROJ-36 WBS tree and waterfall planning UX
- Influences: PROJ-37 assistant overlay UX
- Influences: all future module UIs

## User Stories

### ST-01 UI Inventory and Design Debt Map

As a product owner, I want a UI inventory of current shell, project room, forms, tables, dialogs, drawers, empty states, and data-dense views so that the refresh targets the highest-friction surfaces first.

Acceptance criteria:
- [ ] Inventory covers global shell, project list, project detail, planning/Gantt, backlog/tree, decisions/open items, stakeholders, budget, tenant settings, and assistant entry points.
- [ ] Each surface is categorized as `keep`, `token-only refresh`, `component refresh`, or `workflow redesign`.
- [ ] Findings include screenshots or Playwright references for desktop and mobile breakpoints.
- [ ] Existing dark-teal design-system document is checked against actual Tailwind/shadcn tokens.
- [ ] No implementation starts before the inventory identifies the first 3 high-value target surfaces.

### ST-02 Interaction and Motion Token Layer

As a frontend engineer, I want shared interaction and motion tokens so that hover, press, focus, loading, enter/exit, and drag states feel consistent across the app.

Acceptance criteria:
- [ ] Global CSS/Tailwind tokens define duration, easing, focus ring, elevation, border, and reduced-motion behavior.
- [ ] `motion-safe` and `motion-reduce` variants are used for non-essential animation.
- [ ] Components have stable dimensions so hover/loading states do not shift layout.
- [ ] Buttons, menu items, tabs, command entries, list rows, and cards share consistent hover/active/focus behavior.
- [ ] Token changes are documented in `docs/design/design-system.md`.

### ST-03 shadcn/Radix Component Refresh

As a user, I want forms, dialogs, drawers, tables, tabs, toasts, and command/search surfaces to look and behave consistently so that repeated workflows are predictable.

Acceptance criteria:
- [ ] Existing local shadcn/Radix primitives remain the base; no parallel component library is introduced.
- [ ] Component variants are reviewed for size, density, disabled states, destructive actions, loading states, and validation states.
- [ ] Sonner toast patterns distinguish success, warning, destructive failure, and background retry.
- [ ] Dialogs and drawers keep focus management and keyboard escape behavior from Radix.
- [ ] Form validation messages are concise and do not reflow large sections unexpectedly.

### ST-04 Motion for Complex UI States

As a project manager, I want complex UI state changes to animate clearly so that I can understand what moved, opened, closed, or changed without losing context.

Acceptance criteria:
- [ ] A motion layer is evaluated and, if accepted, added deliberately as `motion` / Motion for React.
- [ ] Motion is used only where CSS transitions are insufficient: presence animations, layout transitions, drag feedback, expandable panels, assistant overlay, or list reorder feedback.
- [ ] Bundle impact is measured before and after adding the dependency.
- [ ] Reduced-motion users get instant or simplified transitions.
- [ ] Data-table and dense planning views avoid ornamental or long-running animations.

### ST-05 View Transitions for Navigation

As a user navigating between project-room sections, I want route changes to preserve orientation so that I understand where I am in the product hierarchy.

Acceptance criteria:
- [ ] View Transition API is assessed for Next App Router compatibility and browser support.
- [ ] Prototype covers at least one low-risk transition, e.g. project list to project detail or project-room tab switch.
- [ ] Unsupported browsers fall back to normal navigation without broken rendering.
- [ ] Transitions do not delay data loading, auth checks, or module gating.
- [ ] Page transitions respect reduced-motion preferences.

### ST-06 Data-Dense Workflow UX Polish

As a power user, I want project-management screens to remain dense but easier to scan so that frequent work does not feel like a marketing page.

Acceptance criteria:
- [ ] Tables, trees, Gantt/planning, backlog, and settings pages prioritize scanability over oversized hero layouts.
- [ ] Row hover, selection, inline loading, empty states, and error states are consistent.
- [ ] Critical actions use clear icon+label affordances and confirm flows where destructive.
- [ ] New visual treatment does not hide important status, priority, method, dependency, or responsibility signals.
- [ ] Mobile breakpoints preserve key actions without overlapping text or controls.

### ST-07 Accessibility and Reduced Motion QA

As a tenant admin, I want the refreshed UI to remain accessible so that motion and polish do not reduce usability or compliance.

Acceptance criteria:
- [ ] Keyboard navigation is verified for refreshed components.
- [ ] Focus-visible states are clear in light and dark themes.
- [ ] `prefers-reduced-motion` is tested manually and with automated checks where possible.
- [ ] Color contrast for text, badges, alerts, and focus rings meets WCAG AA.
- [ ] Playwright visual checks cover at least desktop and mobile for refreshed high-value surfaces.

### ST-08 Corporate Element Styling

As a tenant admin, I want selected UI elements to use corporate colors, subtle shadows, and polished hover effects so that the platform can reflect a customer's brand without breaking usability or consistency.

Acceptance criteria:
- [ ] Tenant/admin branding can define at least primary accent color, secondary accent color, focus color, and optional neutral surface tint.
- [ ] Corporate colors are applied through CSS variables or Tailwind theme tokens, not inline per-screen overrides.
- [ ] Supported targets are explicitly scoped: buttons, badges, active navigation items, focus rings, selected rows, lightweight callouts, and key dashboard accents.
- [ ] Button variants support subtle shadow, hover lift, pressed state, disabled state, loading state, and focus-visible state.
- [ ] Hover effects are restrained and do not shift layout or obscure labels/icons.
- [ ] Brand colors are validated for contrast; unsafe combinations fall back to accessible defaults or show an admin warning.
- [ ] Dark mode and light mode tokens can differ where needed.
- [ ] Tenant branding never changes destructive action semantics; destructive buttons keep a distinct warning/destructive treatment.

## Technical Requirements

- Use the existing Tailwind/shadcn/Radix foundation.
- Prefer CSS transitions for simple hover/focus/loading feedback.
- Corporate styling must be token-driven and tenant-scoped; do not hardcode customer-specific colors in shared components.
- Button hover/shadow variants must be centralized in the button/component variant layer.
- Add Motion for React only after the dependency and bundle-size decision is documented.
- Do not use animation to mask slow data operations; loading and retry states must remain explicit.
- Keep animation durations short and interruptible.
- Avoid global page-animation wrappers that interfere with auth redirects, server components, or route-level loading states.
- Every refreshed workflow must keep existing permission, module-gating, and data-integrity behavior unchanged.

## Out of Scope

- Rebranding or new logo work.
- Replacing shadcn/Radix with another component framework.
- Marketing landing page redesign.
- Charting library replacement.
- Full mobile-native app shell.
- Rewriting Gantt or DnD core logic; PROJ-25 and PROJ-25b own behavior.

## Edge Cases

- **Reduced motion enabled** -> all non-essential transitions are disabled or simplified.
- **Low-end device** -> animation must not drop interaction responsiveness in data-dense screens.
- **Long labels / German compound words** -> controls must wrap or constrain text without overlap.
- **Corporate color fails contrast** -> accessible fallback is used and the admin sees a warning.
- **Heavy shadows in dense tables** -> downgrade to border/background state so scanning remains fast.
- **Module disabled** -> refreshed navigation still hides or blocks gated areas.
- **Slow API response** -> loading state is explicit; animation never implies success before persistence completes.
- **Concurrent updates** -> motion must not make stale data appear confirmed.

## Suggested Delivery Slices

1. **51-alpha: Audit + tokens**
   - UI inventory, design-debt map, token plan, reduced-motion policy.
   - Started: `docs/design/PROJ-51-alpha-ui-audit-tokens.md`

2. **51-beta: Core component refresh**
   - Button, form, dialog, drawer, tabs, toast, table/list row, empty/error/loading states.
   - Corporate-color token plumbing and safe button hover/shadow variants.
   - Started with tenant accent token bridge, central Button/Badge interaction variants, sidebar active/hover treatment, and admin preview/contrast feedback.

3. **51-gamma: Motion layer**
   - Motion dependency decision, presence/layout animation primitives, assistant overlay and drawer/list transitions.

4. **51-delta: Navigation transitions**
   - View Transition API prototype and guarded rollout for selected route changes.

5. **51-epsilon: QA hardening**
   - Playwright visual checks, keyboard pass, reduced-motion pass, contrast review.
