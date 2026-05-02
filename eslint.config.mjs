// Flat-config replacement for the deprecated `.eslintrc.json`. ESLint v9 +
// Next.js 16 (which removed `next lint`) require this format.
//
// `eslint-config-next/core-web-vitals` already exports a flat-config array,
// so we spread it directly without `FlatCompat`.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

const config = [
  ...nextCoreWebVitals,
  {
    ignores: [
      ".next/",
      "node_modules/",
      "out/",
      "build/",
      "coverage/",
      "playwright-report/",
      ".vercel/",
    ],
  },
  {
    // PROJ-29 Block A — shadcn-generated primitives.
    //
    // `src/components/ui/sidebar.tsx` is a shadcn copy-paste primitive whose
    // `SidebarMenuSkeleton` uses `Math.random()` inside a `useMemo` to vary
    // the skeleton bar width on every mount. The new React 19
    // `react-hooks/purity` rule rightly flags this as a non-pure render
    // expression — but rewriting shadcn's primitive is out of scope for a
    // hygiene slice. Override the rule on this single file only.
    files: ["src/components/ui/sidebar.tsx"],
    rules: {
      "react-hooks/purity": "off",
    },
  },
  {
    // PROJ-29 Block C — Playwright fixture `use(...)` parameter.
    //
    // Playwright's fixture API destructures a `use` parameter:
    //   test.extend({ myFixture: async ({ browser }, use) => { await use(...) } })
    // The new React 19 `react-hooks/rules-of-hooks` rule mis-detects
    // this as React's `use()` hook because the inner function is not
    // named like a custom hook (uppercase / `use*`). It is not a React
    // component or hook — it's a Node test fixture. Override on the
    // single file that uses this pattern.
    files: ["tests/fixtures/auth-fixture.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // PROJ-29 Block A — auth-flow `window.location.href` assignment.
    //
    // The new React 19 `react-hooks/immutability` rule mis-reads
    // `window.location.href = "/"` as a write to an immutable value. This
    // assignment IS the documented project policy — see
    // `.claude/rules/frontend.md` "Auth Best Practices (Supabase)": use
    // `window.location.href` for post-login redirect (not router.push) so
    // the AppShell re-mounts with a fresh Supabase session. The same
    // pattern lives in the four auth flows below.
    files: [
      "src/app/(auth)/login/login-form.tsx",
      "src/app/(auth)/reset-password/reset-password-form.tsx",
      "src/app/(auth)/signup/signup-form.tsx",
      "src/app/onboarding/onboarding-client.tsx",
    ],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  {
    // PROJ-29 Block A — promise-cancellation `let cancelled` pattern.
    //
    // The new React 19 `react-hooks/refs` rule prefers `useRef` over a
    // function-scoped `let cancelled = false` inside a `useEffect`. The
    // ref alternative would lose per-effect-instance scoping (a previous
    // effect's pending promise could resolve against a freshly-reset ref
    // and pass the `if (cancelled) return` guard incorrectly). The local
    // `let` binding is the textbook React pattern documented at
    // https://react.dev/reference/react/useEffect#fetching-data-with-effects.
    files: [
      "src/hooks/use-resources.ts",
      "src/hooks/use-stakeholder-rollup.ts",
      "src/hooks/use-vendors.ts",
      "src/hooks/use-work-items.ts",
    ],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  {
    // PROJ-29 Block A — dialog-reset and effect-driven data-loading patterns.
    //
    // The new React 19 `react-hooks/set-state-in-effect` rule flags two
    // legitimate patterns that dominate this codebase:
    //
    //   1. Dialog state-reset on prop change. Pattern:
    //        useEffect(() => { if (open) setName(initial?.name ?? "") },
    //                  [open, initial])
    //      The canonical lint-compliant alternative is parent-side `key`
    //      remount — invasive, touches every dialog call site, no runtime
    //      benefit. Postponed to a dedicated dialog-architecture spec if
    //      the team ever wants to standardize on key-based reset.
    //
    //   2. Effect-driven initial data load. Pattern:
    //        useEffect(() => { void loadX().then(setX) }, [deps])
    //      The lint-compliant alternative is server-side initial state via
    //      RSC props — a real architectural improvement, but out of scope
    //      for a hygiene slice (would touch tab-client / page-client data
    //      flow across ~14 components).
    //
    // Until those patterns are migrated wholesale, narrow this rule off
    // for the specific files where it currently fires. The list is the
    // exact set produced by `npm run lint` on PROJ-29 commit; new files
    // adding the pattern will surface as fresh lint errors and force a
    // conscious decision rather than silent drift.
    files: [
      "src/app/(app)/projects/drafts/drafts-list-client.tsx",
      "src/components/audit/history-tab.tsx",
      "src/components/budget/budget-category-dialog.tsx",
      "src/components/budget/budget-item-dialog.tsx",
      "src/components/budget/budget-posting-dialog.tsx",
      "src/components/budget/tenant-fx-rates-page-client.tsx",
      "src/components/budget/vendor-invoices-tab.tsx",
      "src/components/connectors/connectors-page-client.tsx",
      "src/components/master-data/project-types-page-client.tsx",
      "src/components/phases/delete-phase-dialog.tsx",
      "src/components/phases/reorder-phases-dialog.tsx",
      "src/components/project-room/method-header.tsx",
      "src/components/projects/ai-proposals/ai-proposals-tab-client.tsx",
      "src/components/projects/decisions/decisions-tab-client.tsx",
      "src/components/projects/hard-delete-confirm-dialog.tsx",
      "src/components/projects/open-items/convert-to-decision-dialog.tsx",
      "src/components/projects/open-items/open-items-panel.tsx",
      "src/components/projects/risks/risk-tab-client.tsx",
      "src/components/projects/stakeholders/stakeholder-tab-client.tsx",
      "src/components/resources/availability-list.tsx",
      "src/components/resources/utilization-heatmap.tsx",
      "src/components/sprints/sprint-state-dialog.tsx",
      "src/components/vendors/project-vendor-tab-client.tsx",
      "src/components/vendors/vendors-page-client.tsx",
      "src/components/work-items/change-kind-dialog.tsx",
      "src/components/work-items/change-parent-dialog.tsx",
      "src/components/work-items/change-sprint-dialog.tsx",
      "src/components/work-items/change-status-dialog.tsx",
      "src/components/work-items/delete-work-item-dialog.tsx",
      "src/components/work-items/new-work-item-dialog.tsx",
      "src/components/work-items/work-item-allocations.tsx",
      "src/lib/work-items/method-context.ts",
      // PROJ-21: snapshot UI uses the same dialog-reset + effect-driven
      // data-load patterns documented above.
      "src/components/reports/ki-narrative-modal.tsx",
      "src/hooks/use-snapshots.ts",
      // PROJ-31: approval-management surfaces use the same effect-driven
      // initial data-load pattern as the rest of the project-room.
      "src/app/(app)/approvals/approvals-list-client.tsx",
      "src/components/projects/decisions/approval/decision-approval-sheet.tsx",
      // PROJ-33-β: stakeholder-type-catalog admin UI uses the same dialog-
      // reset on prop change + effect-driven initial-load patterns.
      "src/components/master-data/stakeholder-type-form-dialog.tsx",
      "src/components/master-data/stakeholder-types-page-client.tsx",
      // PROJ-33-γ: profile-tab + edit-sheet (effect-driven initial-load +
      // dialog-reset patterns identical to existing rule)
      "src/components/stakeholders/profile/profile-tab.tsx",
      "src/components/stakeholders/profile/profile-edit-sheet.tsx",
      // PROJ-24-ε: cost-stack frontend dialogs + backlog cost-totals fetch.
      "src/components/cost/tenant-role-rates-page-client.tsx",
      "src/components/work-items/work-item-cost-section.tsx",
      "src/components/work-items/backlog-list.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // PROJ-21 — tenant-branding logo in snapshot pages.
    //
    // The frozen snapshot HTML is rendered server-side and then
    // captured by headless Puppeteer for the PDF. Next/Image is lazy
    // (intersection-observer driven) and would not have completed
    // loading by the time Puppeteer finishes the print snapshot,
    // resulting in missing logos. Use a plain `<img>` so the source
    // resolves before the print frame finalizes.
    files: ["src/components/reports/snapshot-header.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    // PROJ-29 Block A — react-hook-form + react-day-picker interop.
    //
    // The new React 19 `react-hooks/incompatible-library` rule cannot statically
    // analyse the helpers returned by `useForm()` (form.watch, form.handleSubmit)
    // or the calendar widget that consumes them. Each violation in the files
    // below traces back to that 3rd-party hook surface — not to our own code.
    //
    // Rather than scatter 11 per-line eslint-disable comments through the
    // form components, we narrow the rule off for these specific files. The
    // override is intentionally tight: only files that use react-hook-form
    // primitives directly are listed.
    files: [
      "src/components/milestones/milestone-status-dialog.tsx",
      "src/components/phases/edit-phase-dialog.tsx",
      "src/components/phases/new-phase-dialog.tsx",
      "src/components/phases/phase-status-transition-dialog.tsx",
      "src/components/projects/ai-proposals/suggestion-edit-form.tsx",
      "src/components/projects/edit-project-master-data-dialog.tsx",
      "src/components/projects/risks/risk-form.tsx",
      "src/components/settings/tenant/ai-provider-section.tsx",
      "src/components/settings/tenant/privacy-section.tsx",
      "src/components/sprints/edit-sprint-dialog.tsx",
      "src/components/sprints/new-sprint-dialog.tsx",
    ],
    rules: {
      "react-hooks/incompatible-library": "off",
    },
  },
]

export default config
