/**
 * PROJ-Y-143n — the `organization` module switch, at the HTTP boundary.
 *
 * This surface had **no** Playwright spec at all and one route unit test, which
 * is part of why a half-effective switch survived three months: PROJ-62 shipped
 * the toggle (registered in the migration, backfilled into every tenant, in the
 * bootstrap default list) and its own QA booked the missing enforcement as debt
 * — then only the PROJ-63 CSV-import routes ever got the gate. So
 * `/stammdaten/organisation` worked while `/stammdaten/organisation/import`
 * answered 404 and rendered it as a red fault box, in four of six tenants.
 *
 * Two layers here, and neither mutates shared state:
 *
 *  1. Without a session every route and page must be unreachable — the baseline
 *     the twelve newly gated handlers must not have weakened.
 *  2. With a session in a tenant whose `organization` module is off, the module
 *     gate must be visible as PROJ-Y-143f's *third* state: not a red error, not
 *     "nothing here", but "not active for this workspace".
 *
 * The depth proof for the gate itself is in the route unit tests (28 cases
 * across the eight files, red-green verified: reverting the gate turns 25 of
 * them red while the unchanged-behaviour cases stay green). The both-switch-
 * positions run is a documented one-off experiment, deliberately not a
 * committed test: flipping a shared fixture tenant's modules inside the suite
 * would race the specs it shares that tenant with — the coupling PROJ-Y-143l
 * spent a slice removing.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { expect, test } from "@playwright/test"

import {
  hasAuthStorageState,
  test as authTest,
} from "./fixtures/auth-fixture"
import { E2E_TENANT_ID } from "./fixtures/constants"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

/** Every handler this slice gated, plus the two pages in front of them. */
const GATED_ROUTES: ReadonlyArray<{
  label: string
  method: "get" | "post" | "patch" | "delete"
  path: string
  data?: unknown
}> = [
  { label: "units list", method: "get", path: "/api/organization-units" },
  {
    label: "units create",
    method: "post",
    path: "/api/organization-units",
    data: { name: "143n", type: "team" },
  },
  {
    label: "unit update",
    method: "patch",
    path: `/api/organization-units/${DUMMY}`,
    data: { expected_updated_at: "2026-08-19T00:00:00Z", name: "143n" },
  },
  {
    label: "unit delete",
    method: "delete",
    path: `/api/organization-units/${DUMMY}`,
  },
  {
    label: "unit move",
    method: "post",
    path: `/api/organization-units/${DUMMY}/move`,
    data: { new_parent_id: null, expected_updated_at: "2026-08-19T00:00:00Z" },
  },
  { label: "units tree", method: "get", path: "/api/organization-units/tree" },
  {
    label: "units combobox",
    method: "get",
    path: "/api/organization-units/combobox?q=a",
  },
  { label: "locations list", method: "get", path: "/api/locations" },
  {
    label: "locations create",
    method: "post",
    path: "/api/locations",
    data: { name: "143n" },
  },
  {
    label: "location update",
    method: "patch",
    path: `/api/locations/${DUMMY}`,
    data: { expected_updated_at: "2026-08-19T00:00:00Z", name: "143n" },
  },
  { label: "location delete", method: "delete", path: `/api/locations/${DUMMY}` },
  { label: "landscape", method: "get", path: "/api/organization-landscape" },
]

test.describe("PROJ-Y-143n / auth gate", () => {
  for (const route of GATED_ROUTES) {
    test(`${route.label} (${route.method.toUpperCase()}) needs a session`, async ({
      request,
    }) => {
      const res = await request[route.method](route.path, {
        ...(route.data === undefined ? {} : { data: route.data }),
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect(GATE, `${route.label} answered ${res.status()}`).toContain(
        res.status(),
      )
    })
  }

  for (const path of [
    "/stammdaten/organisation",
    "/stammdaten/organisation/import",
  ]) {
    test(`${path} is unreachable without a session`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" })
      expect(page.url()).toContain("/login")
      expect(res?.status()).toBeLessThan(500)
    })
  }
})

/**
 * The UI half of the fix. Both pages are asserted in the same run because the
 * bug was precisely that they disagreed: same module, same tenant, one working
 * surface and one red error box.
 */
authTest.describe("PROJ-Y-143n / module off is a state, not a fault", () => {
  let admin: SupabaseClient | null = null

  authTest.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return
    const { default: WebSocketImpl } = (await import("ws")) as {
      default: typeof WebSocket
    }
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocketImpl },
    })
  })

  authTest.beforeEach(async () => {
    authTest.skip(
      !hasAuthStorageState(),
      "Needs SUPABASE_SERVICE_ROLE_KEY — see tests/fixtures/README.md.",
    )
    authTest.skip(
      admin === null,
      "Needs SUPABASE_SERVICE_ROLE_KEY for the precondition read.",
    )

    // Asserted, not assumed: without this the cases below would still pass on a
    // tenant that has the module ON — they would just be checking that a
    // working page is not an error page, which proves nothing about the gate.
    const { data, error } = await admin!
      .from("tenant_settings")
      .select("active_modules")
      .eq("tenant_id", E2E_TENANT_ID)
      .maybeSingle()
    expect(error, "settings lookup failed").toBeNull()
    const modules = (data?.active_modules ?? []) as string[]
    expect(
      modules,
      "This spec depends on the shared E2E tenant having `organization` OFF. " +
        "If that changed deliberately, move these cases to a tenant that has " +
        "it off — do not delete them: they are the regression guard for the " +
        "red error box PROJ-Y-143n removed.",
    ).not.toContain("organization")
  })

  authTest(
    "the organization page states the module, instead of showing an error",
    async ({ authenticatedPage: page }) => {
      await page.goto("/stammdaten/organisation", {
        waitUntil: "domcontentloaded",
      })

      await expect(
        page.getByText("Das Modul „Organisation“ ist für diesen Workspace nicht aktiv."),
      ).toBeVisible()

      // The two states it must NOT be (PROJ-Y-143f / PROJ-64 AC-9): the red
      // fault box, and any claim that the structure is simply empty.
      await expect(
        page.getByText("Daten konnten nicht geladen werden"),
      ).toHaveCount(0)
      await expect(page.getByText("Resource not found.")).toHaveCount(0)

      // Actions that could only produce a 403 are not offered.
      await expect(
        page.getByRole("link", { name: /CSV Import/i }),
      ).toHaveCount(0)
      await expect(page.getByRole("tab", { name: "Tree-View" })).toHaveCount(0)
    },
  )

  authTest(
    "the CSV-import page no longer renders its 404 as a red fault",
    async ({ authenticatedPage: page }) => {
      // This is the defect the slice was opened for. The gate here is three
      // months old and correct; the rendering was not.
      await page.goto("/stammdaten/organisation/import", {
        waitUntil: "domcontentloaded",
      })

      await expect(
        page.getByText("Das Modul „Organisation“ ist für diesen Workspace nicht aktiv."),
      ).toBeVisible()
      await expect(page.getByText("Resource not found.")).toHaveCount(0)
      await expect(page.getByRole("tab", { name: "Upload" })).toHaveCount(0)
    },
  )

  authTest(
    "the API answers 404 on reads and 403 on writes, with a session",
    async ({ authenticatedPage: page }) => {
      // Through the page's own context, so the session cookie applies. The
      // navigation is required, not cosmetic: `fetch` on `about:blank` has no
      // origin to resolve a relative path against.
      await page.goto("/stammdaten/organisation", {
        waitUntil: "domcontentloaded",
      })
      const statuses = await page.evaluate(async () => {
        const get = async (path: string) => (await fetch(path)).status
        const post = async (path: string, body: unknown) =>
          (
            await fetch(path, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            })
          ).status
        return {
          units: await get("/api/organization-units"),
          tree: await get("/api/organization-units/tree"),
          combobox: await get("/api/organization-units/combobox?q=a"),
          locations: await get("/api/locations"),
          landscape: await get("/api/organization-landscape"),
          createUnit: await post("/api/organization-units", {
            name: "143n",
            type: "team",
          }),
          createLocation: await post("/api/locations", { name: "143n" }),
        }
      })

      expect(statuses).toEqual({
        units: 404,
        tree: 404,
        combobox: 404,
        locations: 404,
        landscape: 404,
        createUnit: 403,
        createLocation: 403,
      })
    },
  )
})
