/**
 * PROJ-Y-146a — proves that the Snapshot-PDF path runs INSIDE the deployed
 * Vercel serverless function after the `puppeteer-core` 24 → 25 major bump.
 *
 * PROJ-146 verified the library and the production Chromium binary locally
 * (17/17, `npm run verify:pdf-render`). What it could NOT show is that the
 * shipped function actually executes the render — that is this script.
 *
 * Design constraints, deliberate:
 *   - Runs against the REAL production URL, so the shipped bundle answers.
 *   - Seeds its OWN throwaway tenant with `output_rendering` active instead of
 *     flipping the module on a shared E2E tenant. Same reasoning as
 *     PROJ-Y-144d (tests/fixtures/constants.ts:62): shared fixture state races
 *     concurrently running specs.
 *   - Never touches customer data. The production tenant already holds 10
 *     snapshots; a verification must not add an 11th to it.
 *   - Cleanup runs in `finally`, so a failure still tears down what it can, and
 *     the result is verified by counting rows rather than assumed (see note 2 —
 *     two rows cannot be removed through this client).
 *
 * THIS WRITES TO PRODUCTION. It seeds and removes a throwaway tenant and creates
 * one snapshot, so it is gated behind an explicit opt-in and has no npm alias —
 * nobody should trip over it while running the test suite.
 *
 *   PROD_WRITE_ACK=1 npx tsx scripts/verify-prod-snapshot-render.mts
 *
 * Two consequences you should know before running it (both measured, see the
 * PROJ-146 spec):
 *   1. It leaves ~8 PERMANENT rows in `audit_log_entries`. The trail is
 *      append-only since PROJ-130-α and its tenant FK was decoupled, so the rows
 *      outlive the tenant. Set `tenants.audit_lifecycle_exempt = true` BEFORE
 *      seeding to suppress the create/delete half (PROJ-Y-130h) — the flag is
 *      NOT derived from the `[E2E]` name prefix.
 *   2. It cannot finish its own teardown: `enforce_admin_invariant` fires BEFORE
 *      DELETE on a tenant's last admin, and because the `tenant_memberships`
 *      tenant FK cascades, that also blocks deleting the tenant itself. The
 *      script reports the two surviving rows and prints the SQL that clears them.
 */
import { readFile } from "node:fs/promises"

import { createChunks, stringToBase64URL } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.SNAPSHOT_PROBE_BASE ?? "https://projektplattform-v3.vercel.app"

// Throwaway fixture ids — RFC-4122 conformant (PROJ-143: version nibble 4,
// variant nibble 8; a non-conformant id is rejected by `z.string().uuid()`
// at the API boundary and the failure looks like a product bug).
const TENANT_ID = "e2e00000-0000-4e2e-8e2e-00000000146a"
const PROJECT_ID = "e2e00000-0000-4e2e-8e2e-00000000146b"
const TENANT_NAME = "[E2E] PROJ-Y-146a Render Probe"
const TENANT_DOMAIN = "proj-y-146a-render-probe.e2e.local"
const E2E_TEST_EMAIL = "e2e-rfc4122@projektplattform-v3.test"
const E2E_TEST_PASSWORD = "Test-Password-PROJ29!"

const ok: string[] = []
const fail: string[] = []
function check(name: string, cond: boolean, detail = "") {
  ;(cond ? ok : fail).push(name)
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function loadEnv() {
  const raw = await readFile(".env.local", "utf8")
  for (const line of raw.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

await loadEnv()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
if (!url || !serviceKey || !anonKey) throw new Error("missing Supabase env")

if (process.env.PROD_WRITE_ACK !== "1") {
  console.error(
    "Refusing to run: this probe WRITES TO PRODUCTION (seeds a throwaway tenant,\n" +
      "creates one snapshot, leaves permanent audit rows). Re-run with PROD_WRITE_ACK=1\n" +
      "once you have read the header of this file.",
  )
  process.exit(2)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
let snapshotId: string | null = null
let storageKey: string | null = null

try {
  // ---- 1. seed an isolated tenant that has the module on -------------------
  const userId = (
    await admin.from("profiles").select("id").eq("email", E2E_TEST_EMAIL).single()
  ).data?.id as string
  check("E2E identity resolved", !!userId, userId)

  // Surface seed failures loudly. A silently failed seed would later look like a
  // product defect ("module gate rejected us") instead of a harness problem.
  const seed = async (label: string, p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p
    if (error) throw new Error(`seed step "${label}" failed: ${JSON.stringify(error)}`)
  }

  await seed(
    "tenants",
    admin.from("tenants").upsert({
      id: TENANT_ID,
      name: TENANT_NAME,
      domain: TENANT_DOMAIN,
    }),
  )
  // Keep test noise out of the append-only trail (PROJ-Y-130h). Must happen
  // BEFORE the remaining seed steps, because the create-rows are written by the
  // lifecycle trigger as they are inserted. The flag is only permitted for
  // test-marked tenants, which the `[E2E]` name prefix satisfies.
  await seed(
    "audit_lifecycle_exempt",
    admin
      .from("tenants")
      .update({ audit_lifecycle_exempt: true })
      .eq("id", TENANT_ID),
  )

  // The module gate is the whole reason this tenant exists. `requireModuleActive`
  // fails OPEN when the settings row is missing, so writing it explicitly is what
  // makes the proof meaningful rather than accidental (PROJ-Y-144d lesson).
  await seed(
    "tenant_settings",
    admin.from("tenant_settings").upsert({
      tenant_id: TENANT_ID,
      active_modules: ["output_rendering"],
    }),
  )
  // onConflict must name the (tenant_id, user_id) unique index — the table's PK
  // is a surrogate `id`, so the default conflict target would not match.
  await seed(
    "tenant_memberships",
    admin
      .from("tenant_memberships")
      .upsert(
        { tenant_id: TENANT_ID, user_id: userId, role: "admin" },
        { onConflict: "tenant_id,user_id" },
      ),
  )
  // The column is `lifecycle_status` (CHECK draft|active|paused|completed|canceled),
  // not `status` — verified against the live constraint, not assumed.
  await seed(
    "projects",
    admin.from("projects").upsert({
      id: PROJECT_ID,
      tenant_id: TENANT_ID,
      name: "[E2E] PROJ-Y-146a Snapshot Probe",
      responsible_user_id: userId,
      created_by: userId,
      lifecycle_status: "active",
    }),
  )
  const gate = await admin
    .from("tenant_settings")
    .select("active_modules")
    .eq("tenant_id", TENANT_ID)
    .single()
  check(
    "isolated tenant seeded with output_rendering active",
    (gate.data?.active_modules as string[] | null)?.includes("output_rendering") === true,
    JSON.stringify(gate.data?.active_modules),
  )

  // ---- 2. real production session ------------------------------------------
  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email: E2E_TEST_EMAIL, password: E2E_TEST_PASSWORD }),
  })
  const session = await tokenRes.json()
  check("signed in against production Supabase", tokenRes.ok && !!session.access_token)

  const projectRef = new URL(url).hostname.split(".")[0]
  const cookiePairs = createChunks(
    `sb-${projectRef}-auth-token`,
    `base64-${stringToBase64URL(JSON.stringify(session))}`,
  ).map((c) => `${c.name}=${c.value}`)
  cookiePairs.push(`active_tenant_id=${TENANT_ID}`)
  const cookie = cookiePairs.join("; ")

  // ---- 3. the actual proof: POST to the DEPLOYED function -------------------
  console.log(`\n→ POST ${BASE}/api/projects/${PROJECT_ID}/snapshots\n`)
  const started = Date.now()
  const res = await fetch(`${BASE}/api/projects/${PROJECT_ID}/snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ kind: "status_report" }),
  })
  const elapsed = Date.now() - started
  const payload = await res.json().catch(() => ({}) as Record<string, unknown>)
  check("deployed function accepted the request", res.status === 200, `HTTP ${res.status} in ${elapsed} ms`)
  if (res.status !== 200) console.log("   body:", JSON.stringify(payload).slice(0, 400))

  const snap = (payload as { snapshot?: Record<string, unknown> }).snapshot
  snapshotId = (snap?.id as string) ?? null
  check("snapshot row created", !!snapshotId, snapshotId ?? "—")

  // This is the load-bearing assertion. `pdf_status` is set to 'failed' by the
  // route's catch-block when the render throws, so 'available' can only mean the
  // shipped function launched Chromium, fetched the print page over HTTP and
  // produced a PDF.
  check(
    "PDF rendered INSIDE the deployed function (pdf_status='available')",
    snap?.pdf_status === "available",
    String(snap?.pdf_status),
  )
  storageKey = (snap?.pdf_storage_key as string) ?? null
  check("storage key returned", !!storageKey, storageKey ?? "—")

  // ---- 4. the artifact really exists and is a PDF --------------------------
  if (storageKey) {
    const dl = await admin.storage.from("reports").download(storageKey)
    const bytes = dl.data ? new Uint8Array(await dl.data.arrayBuffer()) : null
    check("PDF object present in the reports bucket", !!bytes, dl.error?.message ?? `${bytes?.length} bytes`)
    if (bytes) {
      check(
        "artifact is a real PDF (%PDF- magic)",
        Buffer.from(bytes).subarray(0, 5).toString("latin1") === "%PDF-",
        `${bytes.length} bytes`,
      )
      check("PDF is non-trivial (> 1 KB)", bytes.length > 1024, `${bytes.length} bytes`)
    }
  }

  // ---- 5. DB agrees with the response (no optimistic reporting) ------------
  if (snapshotId) {
    const row = await admin
      .from("report_snapshots")
      .select("pdf_status, pdf_storage_key, tenant_id")
      .eq("id", snapshotId)
      .single()
    check(
      "database confirms pdf_status='available'",
      row.data?.pdf_status === "available",
      String(row.data?.pdf_status),
    )
    check(
      "snapshot is scoped to the throwaway tenant, not the customer tenant",
      row.data?.tenant_id === TENANT_ID,
    )
  }
} finally {
  // ---- 6. cleanup, verified rather than assumed ---------------------------
  console.log("\n--- cleanup ---")
  if (storageKey) {
    const rm = await admin.storage.from("reports").remove([storageKey])
    console.log(`storage object removed: ${!rm.error}`)
  }
  await admin.from("report_snapshots").delete().eq("tenant_id", TENANT_ID)
  await admin.from("projects").delete().eq("id", PROJECT_ID) // before membership: enforce_last_lead()
  await admin.from("tenant_memberships").delete().eq("tenant_id", TENANT_ID)
  await admin.from("tenant_settings").delete().eq("tenant_id", TENANT_ID)
  await admin.from("tenants").delete().eq("id", TENANT_ID)

  const residue: Record<string, number> & { tenant_memberships: number; tenants: number } = {
    tenant_memberships: 0,
    tenants: 0,
  }
  for (const [label, q] of [
    ["report_snapshots", admin.from("report_snapshots").select("id").eq("tenant_id", TENANT_ID)],
    ["projects", admin.from("projects").select("id").eq("tenant_id", TENANT_ID)],
    ["tenant_memberships", admin.from("tenant_memberships").select("user_id").eq("tenant_id", TENANT_ID)],
    ["tenant_settings", admin.from("tenant_settings").select("tenant_id").eq("tenant_id", TENANT_ID)],
    ["tenants", admin.from("tenants").select("id").eq("id", TENANT_ID)],
  ] as const) {
    residue[label] = ((await q).data ?? []).length
  }
  let leftover = 0
  for (const [k, v] of Object.entries(residue)) {
    if (v > 0) leftover += v
    console.log(`  ${k}: ${v}`)
  }
  const stillThere = storageKey
    ? ((await admin.storage.from("reports").list(`${TENANT_ID}/${PROJECT_ID}`)).data ?? []).length
    : 0
  console.log(`  storage objects: ${stillThere}`)

  // The snapshot, project, settings and storage object are fully removable. The
  // membership + tenant are NOT, via this client: `enforce_admin_invariant` fires
  // BEFORE DELETE on the last admin, and the membership→tenant FK cascade means the
  // tenant delete trips the same trigger. supabase-js cannot set
  // `session_replication_role`, so the last two rows need one SQL statement.
  const blockedByInvariant = residue.tenant_memberships + residue.tenants
  const removable = leftover - blockedByInvariant

  check(
    "everything removable was removed (snapshot, project, settings, storage object)",
    removable === 0 && stillThere === 0,
    `${removable} rows, ${stillThere} objects`,
  )
  if (blockedByInvariant > 0) {
    console.log(
      "\n  NOTE: membership + tenant survive by design (enforce_admin_invariant).\n" +
        "  Finish teardown with:\n\n" +
        "    begin;\n" +
        "    set local session_replication_role = replica;\n" +
        `    delete from tenant_memberships where tenant_id='${TENANT_ID}';\n` +
        `    delete from tenants where id='${TENANT_ID}';\n` +
        "    commit;\n",
    )
  }
}

console.log(`\nRESULT: ${ok.length} passed, ${fail.length} failed`)
process.exit(fail.length ? 1 : 0)
