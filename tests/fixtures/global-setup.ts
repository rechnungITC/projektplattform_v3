import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  createChunks,
  DEFAULT_COOKIE_OPTIONS,
  stringToBase64URL,
} from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { FullConfig } from "@playwright/test"

import {
  E2E_PROJECT_ID,
  E2E_PROJECT_NAME,
  E2E_STORAGE_STATE_PATH,
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_TEST_EMAIL,
  E2E_TEST_PASSWORD,
  E2E_USER_ID,
} from "./constants"

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
async function writeEmptyStorageState(reason: string): Promise<void> {
  const storagePath = resolve(process.cwd(), E2E_STORAGE_STATE_PATH)
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
        domain: "e2e.projektplattform-v3.test",
        created_by: E2E_USER_ID,
        language: "de",
        branding: {},
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

  // 4) Sign in to obtain access/refresh tokens, then write a
  //    Playwright storage state that injects them into the test
  //    origin's SSR cookies and localStorage in the shape Supabase expects.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
  const baseOrigin = new URL(baseURL).origin
  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: E2E_TEST_EMAIL,
      password: E2E_TEST_PASSWORD,
    }),
  })
  if (!tokenRes.ok) {
    await writeEmptyStorageState(
      `sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`,
    )
    return
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

  const storageState = {
    cookies: supabaseCookies,
    origins: [
      {
        origin: baseOrigin,
        localStorage: [
          {
            name: supabaseStorageKey,
            value: supabaseStorageValue,
          },
        ],
      },
    ],
  }

  const storagePath = resolve(process.cwd(), E2E_STORAGE_STATE_PATH)
  await mkdir(dirname(storagePath), { recursive: true })
  await writeFile(storagePath, JSON.stringify(storageState, null, 2), "utf8")

  console.info(
    `[PROJ-29 globalSetup] ready — storage state at ${storagePath}`
  )

  await maybeWarmCompileDeepLinkRoutes(config, baseURL, supabaseCookies)
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
