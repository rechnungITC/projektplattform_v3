import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  createChunks,
  DEFAULT_COOKIE_OPTIONS,
  stringToBase64URL,
} from "@supabase/ssr"
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js"
import type { FullConfig } from "@playwright/test"

import {
  E2E_ASSISTANT_PROJECT_ID,
  E2E_CHAT_PROJECT_ID,
  E2E_CHAT_PROJECT_NAME,
  E2E_CHAT_TENANT_DOMAIN,
  E2E_CHAT_TENANT_ID,
  E2E_CHAT_TENANT_NAME,
  E2E_CONSTRUCTION_ACTIVE_MODULES,
  E2E_CONSTRUCTION_LEAD_DISPLAY_NAME,
  E2E_CONSTRUCTION_LEAD_EMAIL,
  E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH,
  E2E_CONSTRUCTION_LEAD_USER_ID,
  E2E_CONSTRUCTION_PASSWORD,
  E2E_CONSTRUCTION_PROJECT_ID,
  E2E_CONSTRUCTION_PROJECT_NAME,
  E2E_CONSTRUCTION_PROJECT_TRADE_ID,
  E2E_CONSTRUCTION_SECTION_CHILD_ID,
  E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
  E2E_CONSTRUCTION_SECTION_ROOT_ID,
  E2E_CONSTRUCTION_SECTION_ROOT_LABEL,
  E2E_CONSTRUCTION_TENANT_DOMAIN,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_TENANT_NAME,
  E2E_CONSTRUCTION_TRADE_ID,
  E2E_CONSTRUCTION_TRADE_KEY,
  E2E_CONSTRUCTION_TRADE_LABEL,
  E2E_CONSTRUCTION_VIEWER_DISPLAY_NAME,
  E2E_CONSTRUCTION_VIEWER_EMAIL,
  E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH,
  E2E_CONSTRUCTION_VIEWER_USER_ID,
  E2E_ASSISTANT_PROJECT_NAME,
  E2E_ASSISTANT_TENANT_DOMAIN,
  E2E_ASSISTANT_TENANT_ID,
  E2E_ASSISTANT_TENANT_NAME,
  E2E_PROJECT_ID,
  E2E_PROJECT_NAME,
  E2E_STORAGE_STATE_PATH,
  E2E_TENANT_DOMAIN,
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_TEST_EMAIL,
  E2E_TEST_PASSWORD,
  E2E_USER_ID,
  E2E_VISUAL_ACTIVE_MODULES,
  E2E_VISUAL_PROJECT_ID,
  E2E_VISUAL_PROJECT_NAME,
  E2E_VISUAL_STORAGE_STATE_PATH,
  E2E_VISUAL_TENANT_DOMAIN,
  E2E_VISUAL_TENANT_ID,
  E2E_VISUAL_TENANT_NAME,
  E2E_VISUAL_TEST_EMAIL,
  E2E_VISUAL_TEST_PASSWORD,
  E2E_VISUAL_USER_DISPLAY_NAME,
  E2E_VISUAL_USER_ID,
} from "./constants"

/**
 * PROJ-143 — the fixture ids must be RFC-4122 conformant.
 *
 * This is deliberately a HARD failure, unlike the fail-open paths below: a
 * missing env var only costs you the auth-fixture tests, but a malformed id
 * costs days. It does not fail at setup — it fails much later, as a 400 from
 * an API route (zod 4's `z.string().uuid()` enforces version + variant) or as
 * a silent client-side form-validation error. That exact bug was worked
 * around locally three times (PROJ-70 F-3, PROJ-89 F-3, PROJ-Y-78f) before
 * anyone named the root cause. `tests/**` is excluded from vitest and owned
 * by Playwright, so this guard lives here rather than in a unit test.
 */
const RFC_4122_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function assertConformantFixtureIds(): void {
  const offenders = Object.entries({
    E2E_USER_ID,
    E2E_TENANT_ID,
    E2E_PROJECT_ID,
    // PROJ-Y-144d — the assistant tenant/project ids reach the same zod
    // boundary (the confirm route validates the draft id, the runtime the
    // project id), so they belong in the same guard.
    E2E_ASSISTANT_TENANT_ID,
    E2E_ASSISTANT_PROJECT_ID,
    // PROJ-Y-143l — the visual lane's own identity reaches the same zod
    // boundary (the project id travels through `/projects/[id]` route params
    // and every project-scoped API call the room makes).
    E2E_VISUAL_USER_ID,
    E2E_VISUAL_TENANT_ID,
    E2E_VISUAL_PROJECT_ID,
    // PROJ-45-β `/qa` — the construction lane. Every one of these crosses the
    // same zod boundary: the project id travels through `/projects/[id]` route
    // params, and the trade and section ids are validated by
    // `createDefectSchema` before `create_construction_defect` ever sees them.
    E2E_CONSTRUCTION_TENANT_ID,
    E2E_CONSTRUCTION_PROJECT_ID,
    E2E_CONSTRUCTION_LEAD_USER_ID,
    E2E_CONSTRUCTION_VIEWER_USER_ID,
    E2E_CONSTRUCTION_TRADE_ID,
    E2E_CONSTRUCTION_PROJECT_TRADE_ID,
    E2E_CONSTRUCTION_SECTION_ROOT_ID,
    E2E_CONSTRUCTION_SECTION_CHILD_ID,
    // PROJ-Y-151b — the chat lane. The project id travels through
    // `/projects/[id]/ki-chat` and every chat API call the page makes.
    E2E_CHAT_TENANT_ID,
    E2E_CHAT_PROJECT_ID,
  }).filter(([, id]) => !RFC_4122_V4.test(id))

  if (offenders.length > 0) {
    throw new Error(
      `[PROJ-143 globalSetup] non-RFC-4122 fixture id(s): ` +
        offenders.map(([name, id]) => `${name}="${id}"`).join(", ") +
        `. The app validates ids with zod 4, which enforces the version (4) ` +
        `and variant (8/9/a/b) nibbles — such an id is rejected at the API ` +
        `boundary, not here. Fix tests/fixtures/constants.ts.`,
    )
  }
}

type PlaywrightStorageCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
}

/**
 * Tiny inline .env.local loader — Playwright's globalSetup runs in
 * plain Node, outside Next.js' env-loading. We avoid adding `dotenv`
 * as a dependency for a 10-line read.
 */
async function loadEnvLocal(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env.local")
  let content: string
  try {
    content = await readFile(envPath, "utf8")
  } catch {
    return // file missing in CI is fine — env vars come from secrets
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(trimmed)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue // never override pre-set env (CI wins)
    let value = rawValue
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

/**
 * PROJ-29 Block C — Playwright globalSetup.
 *
 * Runs once before the entire test run. Idempotent on every run:
 *   1. Reads SUPABASE_URL + SERVICE_ROLE_KEY from env (fails loud if
 *      either is missing).
 *   2. Upserts the [E2E] test tenant + test user + admin membership.
 *   3. Signs the user in to obtain access/refresh tokens.
 *   4. Persists Playwright storageState (Supabase auth tokens encoded
 *      into SSR cookies and localStorage on the test origin) at
 *      `tests/fixtures/.auth/storage-state.json`. Gitignored.
 *
 * The fixture (`auth-fixture.ts`) loads this storage state to bypass
 * the login flow per test. Existing 38 unauth E2E tests are unaffected
 * because they don't import the fixture.
 */
async function writeEmptyStorageState(
  reason: string,
  relativePath: string = E2E_STORAGE_STATE_PATH,
): Promise<void> {
  const storagePath = resolve(process.cwd(), relativePath)
  await mkdir(dirname(storagePath), { recursive: true })
  await writeFile(
    storagePath,
    JSON.stringify({ cookies: [], origins: [] }, null, 2),
    "utf8",
  )
  console.warn(
    `[PROJ-29 globalSetup] auth provisioning skipped (${reason}). ` +
      `Existing unauth E2E tests will run. Auth-fixture-using tests ` +
      `will fail at test time until SUPABASE_SERVICE_ROLE_KEY in ` +
      `.env.local is valid. Empty storage state at ${storagePath}.`,
  )
}

function buildSupabaseAuthCookies(
  storageKey: string,
  storageValue: string,
  baseURL: string,
): PlaywrightStorageCookie[] {
  const parsedBaseURL = new URL(baseURL)
  const encodedValue = `base64-${stringToBase64URL(storageValue)}`
  const expires =
    Math.floor(Date.now() / 1000) +
    (DEFAULT_COOKIE_OPTIONS.maxAge ?? 400 * 24 * 60 * 60)

  return createChunks(storageKey, encodedValue).map(({ name, value }) => ({
    name,
    value,
    domain: parsedBaseURL.hostname,
    path: DEFAULT_COOKIE_OPTIONS.path ?? "/",
    expires,
    httpOnly: DEFAULT_COOKIE_OPTIONS.httpOnly ?? false,
    secure: parsedBaseURL.protocol === "https:",
    sameSite: "Lax",
  }))
}

async function globalSetup(config: FullConfig): Promise<void> {
  assertConformantFixtureIds()
  await loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !serviceKey || !anonKey) {
    await writeEmptyStorageState(
      "missing env vars (need NEXT_PUBLIC_SUPABASE_URL, " +
        "SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    )
    return
  }

  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }

  const admin = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })

  // 1) Idempotent test user: try create; if already exists, accept.
  const { error: createUserError } = await admin.auth.admin.createUser({
    id: E2E_USER_ID,
    email: E2E_TEST_EMAIL,
    password: E2E_TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "[E2E] Test User" },
  })
  if (
    createUserError &&
    !/already (been )?registered|exists|duplicate/i.test(
      createUserError.message,
    )
  ) {
    await writeEmptyStorageState(
      `auth.admin.createUser failed: ${createUserError.message}`,
    )
    return
  }

  // 1.5) Profile row — tenants.created_by FK references profiles(id),
  //      not auth.users(id), and there is no auto-create trigger.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: E2E_USER_ID,
        email: E2E_TEST_EMAIL,
        display_name: "[E2E] Test User",
      },
      { onConflict: "id" },
    )
  if (profileError) {
    await writeEmptyStorageState(
      `profiles upsert failed: ${profileError.message}`,
    )
    return
  }

  // 2) Idempotent test tenant — clearly E2E-marked.
  const { error: tenantError } = await admin
    .from("tenants")
    .upsert(
      {
        id: E2E_TENANT_ID,
        name: E2E_TENANT_NAME,
        domain: E2E_TENANT_DOMAIN,
        created_by: E2E_USER_ID,
        language: "de",
        branding: {},
        // PROJ-Y-143o/PROJ-Y-130h: das Ausnahmeflag wird NICHT aus dem `[E2E]`-Praefix
        // abgeleitet — ein neuer Fixture-Mandant erbt es nicht und schreibt sonst dauerhaft
        // Testrauschen in den append-only Audit-Trail. Setzen darf es seit PROJ-Y-146c nur
        // die Service-Role; global-setup ist genau dieser Pfad.
        audit_lifecycle_exempt: true,
      },
      { onConflict: "id" }
    )
  if (tenantError) {
    await writeEmptyStorageState(
      `tenants upsert failed: ${tenantError.message}`,
    )
    return
  }

  // 3) Idempotent admin membership — upsert on the (tenant_id, user_id)
  //    unique constraint so a stale row from a previous partial run
  //    doesn't block the rerun.
  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .upsert(
      {
        tenant_id: E2E_TENANT_ID,
        user_id: E2E_USER_ID,
        role: "admin",
      },
      { onConflict: "tenant_id,user_id" },
    )
  if (membershipError) {
    await writeEmptyStorageState(
      `tenant_memberships insert failed: ${membershipError.message}`,
    )
    return
  }

  // 3.5) PROJ-51-ε.4 — Idempotent seed project for Project-Room visual
  //      regression. Pinned UUID so /projects/<E2E_PROJECT_ID>/* renders
  //      a stable URL across runs. project_type "general" intentionally
  //      avoids method-specific trigger spawn (no auto-phases / sprints
  //      / WBS rows that would change between runs). Failure is non-
  //      fatal: auth still works, only ε.4 snapshots will skip.
  const { error: projectError } = await admin
    .from("projects")
    .upsert(
      {
        id: E2E_PROJECT_ID,
        tenant_id: E2E_TENANT_ID,
        name: E2E_PROJECT_NAME,
        project_type: "general",
        responsible_user_id: E2E_USER_ID,
        created_by: E2E_USER_ID,
      },
      { onConflict: "id" },
    )
  if (projectError) {
    console.warn(
      `[PROJ-29 globalSetup] seed project upsert failed (ε.4 snapshots ` +
        `will skip): ${projectError.message}`,
    )
  }

  // 3.6) PROJ-Y-144d — a second tenant with the ASSISTANT MODULE ON, plus a
  //      scrum project, so the PROJ-144 chain (dictate → review → confirm →
  //      work item) can be driven in a real browser.
  //
  //      Kept apart from E2E_TENANT_ID on purpose: `AssistantLauncher` lives
  //      in the app shell, so an active module puts a `fixed` button on every
  //      signed-in page — precisely what the authenticated visual-regression
  //      spec captures `fullPage`. Two tenants, two concerns.
  //
  //      `active_modules` is written EXPLICITLY. Both gates fail open on a
  //      missing settings row (`isModuleActive` returns true for null,
  //      `requireModuleActive` returns null), so the flow would "work" with no
  //      row at all — but a fixture whose whole purpose is "assistant is on"
  //      must not rest on a fail-open. The table default does NOT contain
  //      "assistant", so an implicit row would switch it off.
  //      Failure is non-fatal: only the PROJ-Y-144d chain spec skips.
  // `PromiseLike`, not `Promise`: a Supabase query builder is thenable but has
  // no `catch`/`finally`, so annotating it as a Promise is a type error (and
  // `await` works on either).
  const assistantSeedSteps: {
    label: string
    run: () => PromiseLike<{ error: { message: string } | null }>
  }[] = [
    {
      label: "tenant",
      run: () =>
        admin.from("tenants").upsert(
          {
            id: E2E_ASSISTANT_TENANT_ID,
            name: E2E_ASSISTANT_TENANT_NAME,
            domain: E2E_ASSISTANT_TENANT_DOMAIN,
            created_by: E2E_USER_ID,
            language: "de",
            branding: {},
            audit_lifecycle_exempt: true,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "membership",
      run: () =>
        admin.from("tenant_memberships").upsert(
          {
            tenant_id: E2E_ASSISTANT_TENANT_ID,
            user_id: E2E_USER_ID,
            // Admin: `isProjectEditAllowed` grants edit on tenant-admin alone,
            // so the chain needs no project_memberships row — which also keeps
            // `enforce_last_lead()` out of the cleanup path.
            role: "admin",
          },
          { onConflict: "tenant_id,user_id" },
        ),
    },
    {
      label: "settings",
      run: () =>
        admin.from("tenant_settings").upsert(
          {
            tenant_id: E2E_ASSISTANT_TENANT_ID,
            active_modules: [
              "risks",
              "decisions",
              "ai_proposals",
              "audit_reports",
              "assistant",
            ],
          },
          { onConflict: "tenant_id" },
        ),
    },
    {
      label: "project",
      run: () =>
        admin.from("projects").upsert(
          {
            id: E2E_ASSISTANT_PROJECT_ID,
            tenant_id: E2E_ASSISTANT_TENANT_ID,
            name: E2E_ASSISTANT_PROJECT_NAME,
            project_type: "software",
            // Scrum so "Neue Story" resolves to `story` and the method rule is
            // genuinely exercised. `projects_method_immutable` blocks changing
            // this later, so it must be right at insert time.
            project_method: "scrum",
            responsible_user_id: E2E_USER_ID,
            created_by: E2E_USER_ID,
          },
          { onConflict: "id" },
        ),
    },
  ]

  for (const step of assistantSeedSteps) {
    const { error } = await step.run()
    if (error) {
      console.warn(
        `[PROJ-Y-144d globalSetup] assistant ${step.label} seed failed ` +
          `(assistant chain spec will skip): ${error.message}`,
      )
      break
    }
  }

  // PROJ-Y-151b — the chat lane. Same shape as the assistant lane above: own
  // tenant, shared user, active tenant pinned by cookie in `auth-fixture.ts`.
  // See `E2E_CHAT_TENANT_ID` in constants.ts for why it is not the assistant
  // tenant and not the shared one — and why NO AI provider is seeded here.
  const chatSeedSteps: {
    label: string
    run: () => PromiseLike<{ error: { message: string } | null }>
  }[] = [
    {
      label: "tenant",
      run: () =>
        admin.from("tenants").upsert(
          {
            id: E2E_CHAT_TENANT_ID,
            name: E2E_CHAT_TENANT_NAME,
            domain: E2E_CHAT_TENANT_DOMAIN,
            created_by: E2E_USER_ID,
            language: "de",
            branding: {},
            // Before seeding, not after: audit rows are append-only since
            // PROJ-130-α and outlive their tenant (PROJ-Y-146b).
            audit_lifecycle_exempt: true,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "membership",
      run: () =>
        admin.from("tenant_memberships").upsert(
          { tenant_id: E2E_CHAT_TENANT_ID, user_id: E2E_USER_ID, role: "admin" },
          { onConflict: "tenant_id,user_id" },
        ),
    },
    {
      label: "settings",
      run: () =>
        admin.from("tenant_settings").upsert(
          {
            tenant_id: E2E_CHAT_TENANT_ID,
            // Written explicitly, not left to the table default: both gates
            // (`requireModuleActive` and the nav registry) fail OPEN when the
            // settings row is missing, so a fixture whose whole point is
            // "ai_chat is on" must not rest on a fail-open (PROJ-Y-144d).
            active_modules: ["ai_chat", "risks", "decisions"],
          },
          { onConflict: "tenant_id" },
        ),
    },
    {
      label: "project",
      run: () =>
        admin.from("projects").upsert(
          {
            id: E2E_CHAT_PROJECT_ID,
            tenant_id: E2E_CHAT_TENANT_ID,
            name: E2E_CHAT_PROJECT_NAME,
            description:
              "Einführung eines ERP-Systems auf Basis von MS Dynamics.",
            project_type: "erp",
            project_method: "waterfall",
            responsible_user_id: E2E_USER_ID,
            created_by: E2E_USER_ID,
          },
          { onConflict: "id" },
        ),
    },
  ]

  for (const step of chatSeedSteps) {
    const { error } = await step.run()
    if (error) {
      console.warn(
        `[PROJ-Y-151b globalSetup] chat ${step.label} seed failed ` +
          `(chat chain spec will skip): ${error.message}`,
      )
      break
    }
  }

  // 4) Sign in to obtain access/refresh tokens, then write a
  //    Playwright storage state that injects them into the test
  //    origin's SSR cookies and localStorage in the shape Supabase expects.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
  const supabaseCookies = await signInAndPersist({
    url,
    anonKey,
    baseURL,
    email: E2E_TEST_EMAIL,
    password: E2E_TEST_PASSWORD,
    activeTenantId: E2E_TENANT_ID,
    relativePath: E2E_STORAGE_STATE_PATH,
    label: "PROJ-29",
  })
  if (!supabaseCookies) return

  // 5) PROJ-Y-143l — the visual lane, provisioned and signed in separately.
  //    Fail-open: only the authenticated visual specs skip if this fails.
  await provisionVisualLane(admin, { url, anonKey, baseURL })

  // 6) PROJ-45-β `/qa` — the construction lane (own tenant, three actors).
  //    Fail-open like the two lanes above: only the construction chain spec
  //    skips if this fails.
  await provisionConstructionLane(admin, { url, anonKey, baseURL })

  await maybeWarmCompileDeepLinkRoutes(config, baseURL, supabaseCookies)
}

/**
 * Signs one identity in and writes its Playwright storage state.
 *
 * Extracted in PROJ-Y-143l because there are now two independent lanes. It
 * returns the auth cookies (warm-compile needs them) or null after having
 * written an empty state, which is what `hasAuthStorageState()` reads to make
 * the dependent specs skip cleanly instead of crashing.
 */
async function signInAndPersist(args: {
  url: string
  anonKey: string
  baseURL: string
  email: string
  password: string
  activeTenantId: string
  relativePath: string
  label: string
}): Promise<PlaywrightStorageCookie[] | null> {
  const { url, anonKey, baseURL, email, password, activeTenantId } = args
  const baseOrigin = new URL(baseURL).origin

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!tokenRes.ok) {
    await writeEmptyStorageState(
      `sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`,
      args.relativePath,
    )
    return null
  }
  const session = (await tokenRes.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at: number
    user: { id: string; email: string }
  }

  const projectRef = new URL(url).hostname.split(".")[0]
  const supabaseStorageKey = `sb-${projectRef}-auth-token`
  const supabaseStorageValue = JSON.stringify(session)
  const supabaseCookies = buildSupabaseAuthCookies(
    supabaseStorageKey,
    supabaseStorageValue,
    baseURL,
  )

  // PROJ-Y-143f — pin the active tenant.
  //
  // `use-auth.tsx` resolves it from the `active_tenant_id` cookie and falls
  // back to `memberships[0]` when the cookie is absent. That fallback made
  // the whole authenticated suite depend on *membership order*: on
  // 2026-08-12 a parallel slice added the shared user to a second tenant
  // ("[E2E] Assistant Test"), the fallback picked it, and because the tenant
  // name renders in the sidebar footer, **all seven** visual baselines went
  // red at once — for a reason that had nothing to do with the change under
  // test. Writing the cookie makes the choice explicit and immune to any
  // future membership a foreign spec creates.
  //
  // PROJ-Y-143l keeps writing it for the visual lane too, even though that
  // user has exactly one membership: the pin must not depend on the invariant
  // it is there to survive.
  const activeTenantCookie = {
    name: "active_tenant_id",
    value: activeTenantId,
    domain: new URL(baseURL).hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: baseOrigin.startsWith("https://"),
    sameSite: "Lax" as const,
  }

  const storageState = {
    cookies: [...supabaseCookies, activeTenantCookie],
    origins: [
      {
        origin: baseOrigin,
        localStorage: [
          { name: supabaseStorageKey, value: supabaseStorageValue },
        ],
      },
    ],
  }

  const storagePath = resolve(process.cwd(), args.relativePath)
  await mkdir(dirname(storagePath), { recursive: true })
  await writeFile(storagePath, JSON.stringify(storageState, null, 2), "utf8")
  console.info(`[${args.label} globalSetup] ready — storage state at ${storagePath}`)
  return supabaseCookies
}

/**
 * PROJ-Y-143l — provision the identity that owns the authenticated
 * visual-regression baselines: own auth user, own profile, own tenant, own
 * `tenant_settings` row, exactly ONE membership, own seed project.
 *
 * "Exactly one membership" is the whole point. `tenant-switcher.tsx` renders a
 * plain label below two memberships and a dropdown button from two upwards, in
 * the sidebar footer of every signed-in page — so a foreign slice enrolling
 * the *shared* user elsewhere used to move all seven baselines at once
 * (PROJ-Y-143f, F-1). Nothing here is shared with `E2E_USER_ID`, so no other
 * slice's account bookkeeping can reach these images.
 *
 * `active_modules` is written explicitly rather than left to the table
 * default: four of the seven baselines depict states that depend on it, most
 * visibly `stammdaten-resources.png`, which shows PROJ-Y-143f's
 * `ModuleUnavailableNotice` precisely because `resources` is off.
 *
 * Fail-open, like the assistant lane: a failure here writes an empty visual
 * storage state, the visual specs skip, and the rest of the suite is
 * unaffected.
 */
async function provisionVisualLane(
  admin: SupabaseClient,
  env: { url: string; anonKey: string; baseURL: string },
): Promise<void> {
  const { error: createUserError } = await admin.auth.admin.createUser({
    id: E2E_VISUAL_USER_ID,
    email: E2E_VISUAL_TEST_EMAIL,
    password: E2E_VISUAL_TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: E2E_VISUAL_USER_DISPLAY_NAME },
  })
  if (
    createUserError &&
    !/already (been )?registered|exists|duplicate/i.test(createUserError.message)
  ) {
    await writeEmptyStorageState(
      `visual auth.admin.createUser failed: ${createUserError.message}`,
      E2E_VISUAL_STORAGE_STATE_PATH,
    )
    return
  }

  // `PromiseLike`, not `Promise`: a Supabase query builder is thenable but has
  // no `catch`/`finally` (PROJ-Y-144d, F-9).
  const steps: {
    label: string
    run: () => PromiseLike<{ error: { message: string } | null }>
  }[] = [
    {
      label: "profile",
      run: () =>
        admin.from("profiles").upsert(
          {
            id: E2E_VISUAL_USER_ID,
            email: E2E_VISUAL_TEST_EMAIL,
            display_name: E2E_VISUAL_USER_DISPLAY_NAME,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "tenant",
      run: () =>
        admin.from("tenants").upsert(
          {
            id: E2E_VISUAL_TENANT_ID,
            name: E2E_VISUAL_TENANT_NAME,
            domain: E2E_VISUAL_TENANT_DOMAIN,
            created_by: E2E_VISUAL_USER_ID,
            language: "de",
            branding: {},
            audit_lifecycle_exempt: true,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "settings",
      run: () =>
        admin.from("tenant_settings").upsert(
          {
            tenant_id: E2E_VISUAL_TENANT_ID,
            active_modules: [...E2E_VISUAL_ACTIVE_MODULES],
          },
          { onConflict: "tenant_id" },
        ),
    },
    {
      label: "membership",
      run: () =>
        admin.from("tenant_memberships").upsert(
          {
            tenant_id: E2E_VISUAL_TENANT_ID,
            user_id: E2E_VISUAL_USER_ID,
            // Admin: /settings/tenant and the admin-only Stammdaten cards are
            // part of the captured surface.
            role: "admin",
          },
          { onConflict: "tenant_id,user_id" },
        ),
    },
    {
      label: "project",
      run: () =>
        admin.from("projects").upsert(
          {
            id: E2E_VISUAL_PROJECT_ID,
            tenant_id: E2E_VISUAL_TENANT_ID,
            name: E2E_VISUAL_PROJECT_NAME,
            // "general" keeps the seed minimal — no trigger-spawned phases,
            // sprints or WBS rows that would change between runs.
            project_type: "general",
            responsible_user_id: E2E_VISUAL_USER_ID,
            created_by: E2E_VISUAL_USER_ID,
          },
          { onConflict: "id" },
        ),
    },
  ]

  for (const step of steps) {
    const { error } = await step.run()
    if (error) {
      await writeEmptyStorageState(
        `visual ${step.label} seed failed: ${error.message}`,
        E2E_VISUAL_STORAGE_STATE_PATH,
      )
      return
    }
  }

  await signInAndPersist({
    url: env.url,
    anonKey: env.anonKey,
    baseURL: env.baseURL,
    email: E2E_VISUAL_TEST_EMAIL,
    password: E2E_VISUAL_TEST_PASSWORD,
    activeTenantId: E2E_VISUAL_TENANT_ID,
    relativePath: E2E_VISUAL_STORAGE_STATE_PATH,
    label: "PROJ-Y-143l",
  })
}

/**
 * PROJ-45-β `/qa` — provision the construction lane: own tenant with the
 * `construction` module ON, a `project_type = "construction"` project, a trade
 * (a defect cannot exist without one) and a two-level section tree.
 *
 * THREE actors, because the chain the slice has to prove needs three distinct
 * role holders (see `constants.ts`):
 *   - `E2E_CONSTRUCTION_VIEWER_USER_ID` — project `viewer`, may only CREATE
 *     (L15, the single place the house rule is relaxed);
 *   - `E2E_CONSTRUCTION_LEAD_USER_ID` — project `lead`, reports done;
 *   - `E2E_USER_ID` — tenant `admin`, approves. Reusing the shared identity
 *     keeps this to two extra sign-ins, and `is_project_member` counts a
 *     tenant admin as a member, so it needs no project_memberships row —
 *     which also keeps `enforce_last_lead()` out of the teardown path.
 *
 * Both new users are tenant `member`, NOT `admin`, on purpose: in production
 * every tenant member happens to be admin, and `is_tenant_admin` short-circuits
 * the role check inside all three write RPCs. An actor seeded as admin would
 * sail through the very gates this lane exists to prove closed — the same
 * false-green the pentest header warns about.
 */
async function provisionConstructionLane(
  admin: SupabaseClient,
  env: { url: string; anonKey: string; baseURL: string },
): Promise<void> {
  const bail = async (why: string) => {
    // Fail-open, but LOUD (PROJ-Y-143o: a teardown/seed that cannot say it
    // failed turns every later error into a mystery). Both storage states are
    // emptied so `hasAuthStorageState` makes the chain spec skip cleanly
    // instead of running against a half-seeded tenant and "passing".
    console.warn(`[PROJ-45-β globalSetup] construction lane skipped: ${why}`)
    await writeEmptyStorageState(why, E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH)
    await writeEmptyStorageState(why, E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH)
  }

  const actors = [
    {
      id: E2E_CONSTRUCTION_LEAD_USER_ID,
      email: E2E_CONSTRUCTION_LEAD_EMAIL,
      name: E2E_CONSTRUCTION_LEAD_DISPLAY_NAME,
    },
    {
      id: E2E_CONSTRUCTION_VIEWER_USER_ID,
      email: E2E_CONSTRUCTION_VIEWER_EMAIL,
      name: E2E_CONSTRUCTION_VIEWER_DISPLAY_NAME,
    },
  ]

  for (const actor of actors) {
    const { error } = await admin.auth.admin.createUser({
      id: actor.id,
      email: actor.email,
      password: E2E_CONSTRUCTION_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: actor.name },
    })
    if (
      error &&
      !/already (been )?registered|exists|duplicate/i.test(error.message)
    ) {
      await bail(`createUser ${actor.email} failed: ${error.message}`)
      return
    }
  }

  // `PromiseLike`, not `Promise`: a Supabase query builder is thenable but has
  // no `catch`/`finally` (PROJ-Y-144d, F-9).
  const steps: {
    label: string
    run: () => PromiseLike<{ error: { message: string } | null }>
  }[] = [
    {
      label: "profiles",
      run: () =>
        admin.from("profiles").upsert(
          actors.map((a) => ({
            id: a.id,
            email: a.email,
            display_name: a.name,
          })),
          { onConflict: "id" },
        ),
    },
    {
      label: "tenant",
      run: () =>
        admin.from("tenants").upsert(
          {
            id: E2E_CONSTRUCTION_TENANT_ID,
            name: E2E_CONSTRUCTION_TENANT_NAME,
            domain: E2E_CONSTRUCTION_TENANT_DOMAIN,
            created_by: E2E_USER_ID,
            language: "de",
            branding: {},
            // PROJ-Y-130h/143o: NOT derived from the `[E2E]` name prefix. A new
            // fixture tenant does not inherit it, and `audit_log_entries` is
            // append-only since PROJ-130-α — unflagged test noise would settle
            // in the compliance artefact permanently and outlive the tenant.
            audit_lifecycle_exempt: true,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "settings",
      run: () =>
        admin.from("tenant_settings").upsert(
          {
            tenant_id: E2E_CONSTRUCTION_TENANT_ID,
            active_modules: [...E2E_CONSTRUCTION_ACTIVE_MODULES],
          },
          { onConflict: "tenant_id" },
        ),
    },
    {
      label: "memberships",
      run: () =>
        admin.from("tenant_memberships").upsert(
          [
            // The tenant needs at least one admin (`enforce_admin_invariant`),
            // and this seat is also the approver — the second person of the
            // four-eyes gate.
            {
              tenant_id: E2E_CONSTRUCTION_TENANT_ID,
              user_id: E2E_USER_ID,
              role: "admin",
            },
            {
              tenant_id: E2E_CONSTRUCTION_TENANT_ID,
              user_id: E2E_CONSTRUCTION_LEAD_USER_ID,
              role: "member",
            },
            {
              tenant_id: E2E_CONSTRUCTION_TENANT_ID,
              user_id: E2E_CONSTRUCTION_VIEWER_USER_ID,
              role: "member",
            },
          ],
          { onConflict: "tenant_id,user_id" },
        ),
    },
    {
      label: "project",
      run: () =>
        admin.from("projects").upsert(
          {
            id: E2E_CONSTRUCTION_PROJECT_ID,
            tenant_id: E2E_CONSTRUCTION_TENANT_ID,
            name: E2E_CONSTRUCTION_PROJECT_NAME,
            // MUST be "construction": `filterSectionsByProjectType` removes the
            // three construction nav sections for every other type, so the
            // Mängel tab would simply not exist. No `project_method` — the
            // register is method-agnostic and a method spawns phases/sprints
            // this lane has no use for.
            project_type: "construction",
            // `bootstrap_project_lead` gives `created_by` the project `lead`
            // role, which is exactly the seat that reports done.
            created_by: E2E_CONSTRUCTION_LEAD_USER_ID,
            responsible_user_id: E2E_CONSTRUCTION_LEAD_USER_ID,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "project_memberships",
      run: () =>
        admin.from("project_memberships").upsert(
          [
            // `created_by` is NOT NULL here (unlike most tables, where it is
            // nullable) — leaving it out fails the whole seed.
            {
              project_id: E2E_CONSTRUCTION_PROJECT_ID,
              user_id: E2E_CONSTRUCTION_LEAD_USER_ID,
              role: "lead",
              created_by: E2E_CONSTRUCTION_LEAD_USER_ID,
            },
            {
              project_id: E2E_CONSTRUCTION_PROJECT_ID,
              user_id: E2E_CONSTRUCTION_VIEWER_USER_ID,
              role: "viewer",
              created_by: E2E_CONSTRUCTION_LEAD_USER_ID,
            },
          ],
          { onConflict: "project_id,user_id" },
        ),
    },
    {
      label: "trade_catalog",
      run: () =>
        admin.from("construction_trades").upsert(
          {
            id: E2E_CONSTRUCTION_TRADE_ID,
            tenant_id: E2E_CONSTRUCTION_TENANT_ID,
            key: E2E_CONSTRUCTION_TRADE_KEY,
            label: E2E_CONSTRUCTION_TRADE_LABEL,
            is_active: true,
            created_by: E2E_USER_ID,
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "project_trade",
      run: () =>
        admin.from("project_construction_trades").upsert(
          {
            id: E2E_CONSTRUCTION_PROJECT_TRADE_ID,
            tenant_id: E2E_CONSTRUCTION_TENANT_ID,
            project_id: E2E_CONSTRUCTION_PROJECT_ID,
            trade_id: E2E_CONSTRUCTION_TRADE_ID,
            responsible_user_id: E2E_CONSTRUCTION_LEAD_USER_ID,
            // Deliberately NO `vendor_id`: `create_construction_defect`
            // prefills the Nachunternehmer from the trade (B-β3), and a
            // prefilled value would mask whether the UI actually set it.
            rag_status: "gruen",
          },
          { onConflict: "id" },
        ),
    },
    {
      label: "sections",
      run: () =>
        admin.from("construction_sections").upsert(
          [
            {
              id: E2E_CONSTRUCTION_SECTION_ROOT_ID,
              tenant_id: E2E_CONSTRUCTION_TENANT_ID,
              project_id: E2E_CONSTRUCTION_PROJECT_ID,
              parent_id: null,
              label: E2E_CONSTRUCTION_SECTION_ROOT_LABEL,
              sort_order: 0,
              created_by: E2E_USER_ID,
            },
            {
              id: E2E_CONSTRUCTION_SECTION_CHILD_ID,
              tenant_id: E2E_CONSTRUCTION_TENANT_ID,
              project_id: E2E_CONSTRUCTION_PROJECT_ID,
              parent_id: E2E_CONSTRUCTION_SECTION_ROOT_ID,
              label: E2E_CONSTRUCTION_SECTION_CHILD_LABEL,
              sort_order: 0,
              created_by: E2E_USER_ID,
            },
          ],
          { onConflict: "id" },
        ),
    },
  ]

  for (const step of steps) {
    const { error } = await step.run()
    if (error) {
      await bail(`${step.label} seed failed: ${error.message}`)
      return
    }
  }

  for (const [actor, path] of [
    [actors[0], E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH],
    [actors[1], E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH],
  ] as const) {
    await signInAndPersist({
      url: env.url,
      anonKey: env.anonKey,
      baseURL: env.baseURL,
      email: actor.email,
      password: E2E_CONSTRUCTION_PASSWORD,
      activeTenantId: E2E_CONSTRUCTION_TENANT_ID,
      relativePath: path,
      label: "PROJ-45-β",
    })
  }
}

/**
 * PROJ-138 Block A — decide whether the warm-compile pass should run at all.
 * Returns a human-readable skip reason, or null when warming should proceed.
 *
 * Warm-compile (PROJ-67 AC-9) exists ONLY to avoid parallel first-compile
 * contention between workers. Two cases make it pointless or unwanted:
 *   - `PW_SKIP_WARM_COMPILE=1`: explicit developer override (wins everywhere,
 *     including CI).
 *   - serial runs (`workers === 1`): there is no parallel contention to warm
 *     against, so the up-front cost buys nothing. CI keeps the historical
 *     full path unless the env override above is set.
 */
function warmCompileSkipReason(config: FullConfig): string | null {
  if (process.env.PW_SKIP_WARM_COMPILE === "1") {
    return "PW_SKIP_WARM_COMPILE=1"
  }
  if (!process.env.CI && config.workers === 1) {
    return "workers=1 (serial run — no parallel contention to warm against)"
  }
  return null
}

async function maybeWarmCompileDeepLinkRoutes(
  config: FullConfig,
  baseURL: string,
  authCookies: PlaywrightStorageCookie[],
): Promise<void> {
  const skip = warmCompileSkipReason(config)
  if (skip) {
    console.info(`[PROJ-138 warm-compile] skipped — ${skip}`)
    return
  }
  await warmCompileDeepLinkRoutes(baseURL, authCookies)
}

/**
 * PROJ-67 AC-9 (F9, from PROJ-70-ε QA F-4): warm-compile the heavy
 * deep-link routes once before parallel workers start. The Next.js dev
 * server compiles routes on first hit; when several workers hit
 * uncompiled graph/wizard routes simultaneously, the first-compile
 * contention causes sporadic navigation timeouts.
 *
 * PROJ-138 hardens this against two failure modes that otherwise kill the
 * whole run before a single test executes:
 *   - Block B preflight wedge-probe: a hard-killed Playwright webServer can
 *     leave a deadlocked Turbopack compile worker (route hangs forever at
 *     ~0% CPU). Probe one heavy route first; if it times out, warn with the
 *     remedy and skip the rest.
 *   - Per-route timeout (default 30s, was 120s) + a total wall-clock budget
 *     (default 90s) + fail-fast after 2 consecutive timeouts. Skipped routes
 *     are named in the log (no silent cap). All env-overridable.
 *
 * Warming is always fail-open — never a test gate.
 */
async function warmCompileDeepLinkRoutes(
  baseURL: string,
  authCookies: PlaywrightStorageCookie[],
): Promise<void> {
  try {
    await fetch(baseURL, { signal: AbortSignal.timeout(3_000) })
  } catch {
    console.info(
      "[PROJ-138 warm-compile] dev server not reachable yet — skipping",
    )
    return
  }

  const cookieHeader = authCookies
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ")
  const routeTimeoutMs =
    Number(process.env.PW_WARM_COMPILE_ROUTE_TIMEOUT_MS) || 30_000
  const budgetMs = Number(process.env.PW_WARM_COMPILE_BUDGET_MS) || 90_000

  const routes = [
    "/login",
    "/projects",
    "/projects/new/wizard",
    `/projects/${E2E_PROJECT_ID}`,
    `/projects/${E2E_PROJECT_ID}/graph`,
    `/projects/${E2E_PROJECT_ID}/backlog`,
  ]

  const warmOne = async (
    route: string,
  ): Promise<{ ok: boolean; ms: number; status?: number }> => {
    const start = Date.now()
    try {
      const res = await fetch(`${baseURL}${route}`, {
        headers: { cookie: cookieHeader },
        redirect: "manual",
        signal: AbortSignal.timeout(routeTimeoutMs),
      })
      return { ok: true, ms: Date.now() - start, status: res.status }
    } catch {
      return { ok: false, ms: Date.now() - start }
    }
  }

  // Block B — preflight wedge probe on one heavy route.
  const probeRoute = "/projects"
  const probe = await warmOne(probeRoute)
  if (!probe.ok) {
    console.warn(
      `[PROJ-138 warm-compile] preflight ${probeRoute} timed out after ${probe.ms}ms. ` +
        "The dev server looks WEDGED — a deadlocked Turbopack compile worker " +
        "(symptom: '○ Compiling ...' never completes, CPU idle, route hangs forever). " +
        "Remedy: stop the run, then `npm run test:e2e:fresh` (or manually " +
        "`pkill -9 -f next-server && rm -rf .next/dev && npm run dev`). " +
        "Skipping the rest of warm-compile (fail-open).",
    )
    return
  }
  console.info(
    `[PROJ-138 warm-compile] ${probeRoute} → ${probe.status} in ${probe.ms}ms`,
  )

  const startedAt = Date.now()
  const remaining = routes.filter((r) => r !== probeRoute)
  const skipped: string[] = []
  let consecutiveTimeouts = 0

  for (let i = 0; i < remaining.length; i++) {
    if (Date.now() - startedAt > budgetMs) {
      skipped.push(...remaining.slice(i))
      break
    }
    const route = remaining[i]
    const r = await warmOne(route)
    if (r.ok) {
      consecutiveTimeouts = 0
      console.info(
        `[PROJ-138 warm-compile] ${route} → ${r.status} in ${r.ms}ms`,
      )
    } else {
      consecutiveTimeouts++
      console.warn(
        `[PROJ-138 warm-compile] ${route} timed out after ${r.ms}ms — continuing`,
      )
      if (consecutiveTimeouts >= 2) {
        skipped.push(...remaining.slice(i + 1))
        console.warn(
          "[PROJ-138 warm-compile] 2 consecutive route timeouts — assuming a " +
            "wedged/overloaded dev server; skipping the rest (fail-open).",
        )
        break
      }
    }
  }

  if (skipped.length > 0) {
    console.warn(
      `[PROJ-138 warm-compile] skipped ${skipped.length} route(s) to stay within ` +
        `the ${budgetMs}ms budget: ${skipped.join(", ")}. Downstream navigations ` +
        "to these routes may hit a cold first-compile.",
    )
  }
  console.info(
    `[PROJ-138 warm-compile] done in ${Date.now() - startedAt}ms ` +
      `(${remaining.length - skipped.length}/${remaining.length} routes warmed after probe)`,
  )
}

export default globalSetup
