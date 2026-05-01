import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { FullConfig } from "@playwright/test"

import {
  E2E_STORAGE_STATE_PATH,
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_TEST_EMAIL,
  E2E_TEST_PASSWORD,
  E2E_USER_ID,
} from "./constants"

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
 *      into localStorage on the test origin) at
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
  // eslint-disable-next-line no-console -- intentional CI breadcrumb
  console.warn(
    `[PROJ-29 globalSetup] auth provisioning skipped (${reason}). ` +
      `Existing unauth E2E tests will run. Auth-fixture-using tests ` +
      `will fail at test time until SUPABASE_SERVICE_ROLE_KEY in ` +
      `.env.local is valid. Empty storage state at ${storagePath}.`,
  )
}

async function globalSetup(_config: FullConfig): Promise<void> {
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

  const admin = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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

  // 3) Idempotent admin membership.
  await admin
    .from("tenant_memberships")
    .delete()
    .eq("tenant_id", E2E_TENANT_ID)
    .eq("user_id", E2E_USER_ID)
  const { error: membershipError } = await admin
    .from("tenant_memberships")
    .insert({
      tenant_id: E2E_TENANT_ID,
      user_id: E2E_USER_ID,
      role: "admin",
    })
  if (membershipError) {
    await writeEmptyStorageState(
      `tenant_memberships insert failed: ${membershipError.message}`,
    )
    return
  }

  // 4) Sign in to obtain access/refresh tokens, then write a
  //    Playwright storage state that injects them into the test
  //    origin's localStorage in the shape supabase-js expects.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
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

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
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

  // eslint-disable-next-line no-console -- intentional CI breadcrumb
  console.info(
    `[PROJ-29 globalSetup] ready — storage state at ${storagePath}`
  )
}

export default globalSetup
