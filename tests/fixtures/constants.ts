/**
 * PROJ-29 Block C — shared E2E test-tenant identifiers.
 *
 * Hardcoded UUIDs so the migration, the global-setup script, and any
 * test-specific data fixtures all agree on the same rows. They stay
 * obviously synthetic (`e2e…` prefix) and will not collide with real
 * production tenants/users.
 *
 * PROJ-143 — these MUST be RFC-4122 conformant. The original ids
 * (`00000000-0000-0000-0000-000000000e2e` / `…e20` / `…e21`) carried a
 * zero version and zero variant nibble, so they are not valid UUIDs. The
 * app validates with zod 4, whose `z.string().uuid()` enforces both — so
 * every request body or form field carrying one of these ids was rejected
 * with a 400 or a client-side validation error. Consequences seen in the
 * wild, worked around locally three times before the root cause was named:
 *
 *   - PROJ-70 F-3 / PROJ-89 F-3: the wizard-draft CREATE route rejects the
 *     tenant id, so drafts had to be seeded service-role.
 *   - PROJ-Y-78f: `responsible_user_id` is validated with `z.string()
 *     .uuid()`, so the E2E user could not get past step 1 of the wizard —
 *     the whole flow was untestable end-to-end.
 *
 * Real Supabase auth ids are v4, so this only ever affected the fixture.
 * Keep any replacement RFC-4122 conformant (version nibble 4, variant
 * nibble 8/9/a/b) — `assertConformantFixtureIds()` in `global-setup.ts`
 * hard-fails otherwise.
 *
 * (PROJ-Y-144d corrected this note: it used to point at a `constants.test.ts`
 * that does not exist. It could not exist either — `tests/**` is excluded from
 * vitest, which is why PROJ-143 put the guard in global-setup. Add new ids to
 * that guard's list, not to an imaginary unit test.)
 */

export const E2E_USER_ID = "e2e00000-0000-4e2e-8e2e-000000000001"
export const E2E_TENANT_ID = "e2e00000-0000-4e2e-8e2e-000000000002"
/**
 * Distinct from the pre-PROJ-143 address on purpose. `global-setup` treats
 * "already registered" as success and then signs in BY EMAIL — reusing the
 * old address would silently authenticate the old, non-conformant user and
 * make the migration a no-op.
 */
export const E2E_TEST_EMAIL = "e2e-rfc4122@projektplattform-v3.test"
export const E2E_TEST_PASSWORD = "Test-Password-PROJ29!" // local-only, never deployed
/** Unchanged: PROJ-51 visual-regression snapshots render this string. */
export const E2E_TENANT_NAME = "[E2E] Projektplattform Test"
/**
 * `tenants.domain` is UNIQUE and the pre-PROJ-143 tenant still holds
 * `e2e.projektplattform-v3.test`, so the new row needs its own.
 */
export const E2E_TENANT_DOMAIN = "e2e-rfc4122.projektplattform-v3.test"

/**
 * PROJ-51-ε.4 — fixed-UUID seed project for Project-Room visual
 * regression. Pinned so snapshots reference a stable URL across runs
 * (otherwise dynamic UUIDs blow up every diff). `project_type` =
 * "general" keeps the seed minimal — no trigger-spawned phases or
 * sprints that would change between runs.
 */
export const E2E_PROJECT_ID = "e2e00000-0000-4e2e-8e2e-000000000003"
export const E2E_PROJECT_NAME = "[E2E] Visual-Regression Project"

/**
 * PROJ-Y-144d — a SECOND test tenant, with the assistant module switched on.
 *
 * Why a separate tenant instead of enabling the module on `E2E_TENANT_ID`:
 * `AssistantLauncher` is mounted in `src/components/app/app-shell.tsx`, so an
 * active assistant module puts a `fixed` button on every signed-in page — and
 * `PROJ-51-visual-regression-authenticated.spec.ts` photographs exactly that
 * shell `fullPage`. Enabling it on the shared tenant would have altered those
 * baselines (and toggling it inside a spec would race the visual specs, since
 * Playwright parallelises files). Two tenants keep the two concerns apart:
 * the visual specs stay on a tenant where the assistant is off and the
 * launcher does not render.
 *
 * The separation only holds because the active tenant is pinned explicitly via
 * the `active_tenant_id` cookie in `auth-fixture.ts`. Do NOT rely on the
 * server's fallback (`resolveActiveTenantId` → earliest membership): with two
 * memberships created in the same second on a fresh environment, that ordering
 * is a coin flip.
 */
export const E2E_ASSISTANT_TENANT_ID = "e2e00000-0000-4e2e-8e2e-000000000004"
export const E2E_ASSISTANT_TENANT_NAME = "[E2E] Assistant Test"
export const E2E_ASSISTANT_TENANT_DOMAIN =
  "e2e-assistant.projektplattform-v3.test"

/**
 * Scrum on purpose: the method drives the work-item kind (`story`), so the
 * PROJ-144 mapping is actually exercised. `E2E_PROJECT_ID` carries
 * `project_method = null`, where every kind is allowed and the mapping is a
 * no-op — a chain test there would have proven nothing about the method rule.
 */
export const E2E_ASSISTANT_PROJECT_ID = "e2e00000-0000-4e2e-8e2e-000000000005"
export const E2E_ASSISTANT_PROJECT_NAME = "[E2E] Assistant Scrum Project"

/**
 * PROJ-Y-151b — a lane for the project-scoped AI chat (PROJ-151).
 *
 * Own tenant, same shared user, active tenant pinned by cookie — the light
 * variant of the PROJ-Y-144d pattern (no second account needed, because this
 * lane photographs nothing).
 *
 * Why not simply switch `ai_chat` on in the assistant tenant: PROJ-Y-144d
 * writes that tenant's `active_modules` explicitly and states its purpose is
 * "the assistant is on". Mixing an unrelated module into it would weaken
 * exactly that statement. And not on `E2E_TENANT_ID` either — `ai_chat` adds a
 * project-room tab, and the visual specs photograph the shell `fullPage`.
 *
 * NO AI provider is configured here, deliberately. A permanent fixture holding
 * a copy of the owner's key would call a paid provider on every E2E run. The
 * real provider round-trip is proven separately and on demand by
 * `scripts/verify-prod-chat-roundtrip.mjs`; what this lane proves is the
 * authenticated path through the UI — and, with the stub answering, that an
 * empty answer is EXPLAINED rather than shown as a silent blank (AC-151H.4).
 */
export const E2E_CHAT_TENANT_ID = "e2e00000-0000-4e2e-8e2e-000000000010"
export const E2E_CHAT_TENANT_NAME = "[E2E] KI-Chat Test"
export const E2E_CHAT_TENANT_DOMAIN = "e2e-chat.projektplattform-v3.test"
export const E2E_CHAT_PROJECT_ID = "e2e00000-0000-4e2e-8e2e-000000000011"
export const E2E_CHAT_PROJECT_NAME = "[E2E] KI-Chat Projekt"

/**
 * PROJ-Y-143l — a THIRD identity, owned exclusively by the authenticated
 * visual-regression spec. Own user, own tenant, own project.
 *
 * Why an own *user*: `E2E_USER_ID` is shared by every slice, so its account
 * state is shared mutable state. On 2026-08-12 a parallel slice enrolled it in
 * a second tenant for its own purposes and `tenant-switcher.tsx:34` flipped
 * from a plain label to a dropdown button — in the sidebar footer of every
 * signed-in page. All seven baselines went red at once, ~1,038 px each, for a
 * reason unrelated to any of them (PROJ-Y-143f, F-1). That fix pinned the
 * active tenant and masked the control, which removes *that* symptom; the
 * cause — a shared account — stayed.
 *
 * Why an own *tenant* and not just an own user on the shared one: the
 * baselines photograph tenant-level state directly.
 *   - `settings-tenant.png` renders name, domain, language and branding;
 *   - `stammdaten-resources.png` renders whichever state `active_modules`
 *     produces (PROJ-Y-143f's `ModuleUnavailableNotice` when `resources` is
 *     off);
 *   - branding (`logo_url` / `accent_color`) reaches every page.
 * PROJ-Y-143f itself toggled modules on the shared tenant to verify its
 * AC-Y143f.4 — a correct thing to do that would move these baselines under a
 * shared tenant. Sharing the tenant would therefore re-open the same coupling
 * one axis over.
 *
 * The identity is deliberately *not* named like the shared one. Two rows
 * called "[E2E] Test User" would be indistinguishable in the database, and
 * distinct names make a mistaken cross-use visible in the baseline itself:
 * point the visual spec at the shared fixture and the greeting and the
 * workspace label differ, so the suite goes red instead of quietly drifting.
 */
export const E2E_VISUAL_USER_ID = "e2e00000-0000-4e2e-8e2e-000000000006"
export const E2E_VISUAL_TENANT_ID = "e2e00000-0000-4e2e-8e2e-000000000007"
export const E2E_VISUAL_PROJECT_ID = "e2e00000-0000-4e2e-8e2e-000000000008"

/**
 * Own address and own domain, both for the same reason PROJ-143 needed them:
 * `global-setup` treats "already registered" as success and then signs in *by
 * email*, and `tenants.domain` is UNIQUE. Reusing either value would make the
 * seed a silent no-op that authenticates somebody else's identity.
 */
export const E2E_VISUAL_TEST_EMAIL = "e2e-visual@projektplattform-v3.test"
export const E2E_VISUAL_TEST_PASSWORD = "Test-Password-PROJ29!" // local-only
export const E2E_VISUAL_USER_DISPLAY_NAME = "[E2E] Visual Test User"
export const E2E_VISUAL_TENANT_NAME = "[E2E] Visual-Regression Workspace"
export const E2E_VISUAL_TENANT_DOMAIN = "e2e-visual.projektplattform-v3.test"
export const E2E_VISUAL_PROJECT_NAME = "[E2E] Visual-Regression Project"

/**
 * Written EXPLICITLY, never left to the table default (PROJ-Y-144d's lesson,
 * in the opposite direction): here the fixture's purpose is that certain
 * modules are *off*, and a default that later gains a module would silently
 * change what four of the seven baselines depict. Pinning it also makes the
 * set an asserted invariant — `PROJ-Y-143l-visual-lane-isolation.spec.ts`
 * compares the live row against this constant.
 *
 * The value matches what the shared `[E2E]` tenant carried when the current
 * baselines were taken, so any pixel difference after the migration is
 * attributable to the identity strings alone, not to module state.
 */
export const E2E_VISUAL_ACTIVE_MODULES = [
  "risks",
  "decisions",
  "ai_proposals",
  "audit_reports",
] as const

/**
 * Persisted Playwright storageState. Gitignored. Regenerated by
 * `npm run test:e2e:setup` (or implicitly on the first test run via
 * `globalSetup`).
 */
export const E2E_STORAGE_STATE_PATH = "tests/fixtures/.auth/storage-state.json"
/** PROJ-Y-143l — separate sign-in, therefore a separate storage state. */
export const E2E_VISUAL_STORAGE_STATE_PATH =
  "tests/fixtures/.auth/visual-storage-state.json"

/**
 * PROJ-45-β (`/qa`) — a FOURTH lane: the construction lane.
 *
 * Why an own tenant, not a module toggled on a shared one: the Mängel surface
 * is gated twice (`requiresProjectType: "construction"` AND
 * `requiresModule: "construction"`), so reaching it needs both a construction
 * project and the module switched on. Switching `construction` on in
 * `E2E_TENANT_ID` is exactly the move PROJ-Y-143f/143l taught us not to make:
 * tenant-level state is photographed by the authenticated visual baselines,
 * and `/frontend` β verified those nine images are currently green *because*
 * `construction` is absent from `E2E_VISUAL_ACTIVE_MODULES`. A toggle would
 * either move them or race them (Playwright parallelises files).
 *
 * Why THREE actors: the chain PROJ-45-β actually has to prove is
 * `Erfassen als Betrachter → Fertigmelden → Abnahme durch eine ZWEITE Person`,
 * and the roles make three identities unavoidable:
 *   - the *Betrachter* may create (L15) but may not report done or approve;
 *   - reporting done needs `is_tenant_admin OR is_project_lead` (B-β2);
 *   - approving needs the same role AND a different person than the reporter
 *     (AC-45β.10 four-eyes, enforced on `reported_done_by` in the RPC).
 * So: viewer creates, lead reports done, tenant admin approves. Collapsing any
 * two of them would make the run prove less than the AC set demands.
 *
 * The admin seat is `E2E_USER_ID`, whose storage state already exists — the
 * lane therefore adds two sign-ins, not three. Enrolling the shared user in a
 * further tenant is safe *since* PROJ-Y-143l gave the visual lane its own
 * user; before that it would have flipped the workspace switcher in every
 * baseline (PROJ-Y-143f, F-1).
 */
export const E2E_CONSTRUCTION_TENANT_ID = "e2e00000-0000-4e2e-8e2e-000000000009"
export const E2E_CONSTRUCTION_TENANT_NAME = "[E2E] Bau Test"
export const E2E_CONSTRUCTION_TENANT_DOMAIN =
  "e2e-bau.projektplattform-v3.test"

/**
 * `project_type` MUST be "construction": `filterSectionsByProjectType` drops
 * the three construction nav sections for any other type, so the Mängel tab
 * would not exist. Deliberately no `project_method` — the defect register is
 * method-agnostic and a method would spawn trigger-side phases/sprints this
 * lane has no use for.
 */
export const E2E_CONSTRUCTION_PROJECT_ID =
  "e2e00000-0000-4e2e-8e2e-00000000000a"
export const E2E_CONSTRUCTION_PROJECT_NAME = "[E2E] Bau-Projekt Mängel"

/** Reports the defect done — project `lead`, tenant `member` (NOT admin). */
export const E2E_CONSTRUCTION_LEAD_USER_ID =
  "e2e00000-0000-4e2e-8e2e-00000000000b"
export const E2E_CONSTRUCTION_LEAD_EMAIL =
  "e2e-bau-lead@projektplattform-v3.test"
export const E2E_CONSTRUCTION_LEAD_DISPLAY_NAME = "[E2E] Bauleitung Eins"

/**
 * Creates the defect — project `viewer`, tenant `member`. Tenant `member`
 * matters: in production every tenant member happens to be `admin`, and
 * `is_tenant_admin` short-circuits the role check inside every write RPC, so
 * an actor seeded as admin would pass gates this run is meant to prove closed.
 */
export const E2E_CONSTRUCTION_VIEWER_USER_ID =
  "e2e00000-0000-4e2e-8e2e-00000000000c"
export const E2E_CONSTRUCTION_VIEWER_EMAIL =
  "e2e-bau-viewer@projektplattform-v3.test"
export const E2E_CONSTRUCTION_VIEWER_DISPLAY_NAME = "[E2E] Bau Betrachter"

export const E2E_CONSTRUCTION_PASSWORD = "Test-Password-PROJ29!" // local-only

/**
 * A defect REQUIRES a trade (L13, `p_trade_id` is rejected as null), and the
 * trade must be assigned to *this* project and active — so the lane seeds the
 * tenant catalog row and the project assignment with pinned ids.
 */
export const E2E_CONSTRUCTION_TRADE_ID = "e2e00000-0000-4e2e-8e2e-00000000000d"
export const E2E_CONSTRUCTION_TRADE_KEY = "e2e_dach"
export const E2E_CONSTRUCTION_TRADE_LABEL = "[E2E] Dachabdichtung"
export const E2E_CONSTRUCTION_PROJECT_TRADE_ID =
  "e2e00000-0000-4e2e-8e2e-00000000000e"

/**
 * Two sections, parent and child. The location is optional (L13), so the walk
 * would run without them — they exist so the set-then-clear proof for
 * `section_id` (B-β5 / the PROJ-122 defect class) has something to select.
 */
export const E2E_CONSTRUCTION_SECTION_ROOT_ID =
  "e2e00000-0000-4e2e-8e2e-00000000000f"
export const E2E_CONSTRUCTION_SECTION_ROOT_LABEL = "[E2E] Bauabschnitt Nord"
export const E2E_CONSTRUCTION_SECTION_CHILD_ID =
  "e2e00000-0000-4e2e-8e2e-000000000010"
export const E2E_CONSTRUCTION_SECTION_CHILD_LABEL = "[E2E] Nord · 1. OG"

/**
 * Written explicitly, never left to the table default (PROJ-Y-143l's rule):
 * this fixture's entire purpose is that `construction` is ON, and a fixture
 * whose purpose is "the module is on" must not rest on a fail-open. Both
 * module gates fall OPEN when the `tenant_settings` row is missing, so an
 * implicit seed would make the gate tests pass for the wrong reason.
 * `vendor` is included so the Nachunternehmer picker has a populated source
 * rather than the deliberate "module off" empty state.
 */
export const E2E_CONSTRUCTION_ACTIVE_MODULES = [
  "risks",
  "decisions",
  "construction",
  "vendor",
] as const

export const E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH =
  "tests/fixtures/.auth/construction-lead-storage-state.json"
export const E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH =
  "tests/fixtures/.auth/construction-viewer-storage-state.json"
