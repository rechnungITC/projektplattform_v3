/**
 * PROJ-Y-143l — the visual lane's isolation, asserted instead of assumed.
 *
 * The authenticated visual baselines photograph account and tenant state: the
 * workspace label in the sidebar footer, the profile e-mail on /settings, name
 * and domain and branding on /settings/tenant, and whichever state
 * `active_modules` makes /stammdaten/resources render. While that state
 * belonged to the *shared* `E2E_USER_ID`, any slice was one membership away
 * from moving all seven images — which is exactly what happened on 2026-08-12
 * (PROJ-Y-143f, F-1: `tenant-switcher.tsx` flips from a label to a dropdown
 * button at the second membership).
 *
 * PROJ-Y-143l gave the lane its own user, tenant and project. This file is the
 * guard that the separation still holds. It is deliberately **read-only**: a
 * test that mutated the shared account to prove the point would itself be the
 * shared-mutable-state problem, and would race the very specs it checks. The
 * mutating proof was run once as a documented experiment (see the spec file);
 * what belongs in the suite is the invariant.
 *
 * The failure mode this catches is silent: a foreign membership does not break
 * anything, it just changes what the baselines depict — and the person who
 * added it has no reason to look at screenshots. Here it fails with a sentence
 * instead.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { expect, test } from "@playwright/test"

import {
  E2E_ASSISTANT_TENANT_ID,
  E2E_TENANT_ID,
  E2E_USER_ID,
  E2E_VISUAL_ACTIVE_MODULES,
  E2E_VISUAL_PROJECT_ID,
  E2E_VISUAL_TENANT_ID,
  E2E_VISUAL_TENANT_NAME,
  E2E_VISUAL_USER_DISPLAY_NAME,
  E2E_VISUAL_USER_ID,
} from "./fixtures/constants"

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

test.describe("PROJ-Y-143l — visual lane isolation", () => {
  let admin: SupabaseClient | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
  })

  test.beforeEach(() => {
    test.skip(
      admin === null,
      "Needs SUPABASE_SERVICE_ROLE_KEY — see tests/fixtures/README.md.",
    )
  })

  /**
   * The load-bearing one. Exactly one membership is what keeps
   * `tenant-switcher.tsx` on its label branch; the second row is what turned
   * all seven baselines red in PROJ-Y-143f.
   */
  test("the visual user belongs to exactly one tenant — its own", async () => {
    const { data, error } = await admin!
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", E2E_VISUAL_USER_ID)

    expect(error, "membership lookup failed").toBeNull()
    expect(
      data,
      "the visual user gained a foreign membership — `tenant-switcher.tsx` " +
        "now renders a dropdown button instead of a label on every signed-in " +
        "page, so all seven authenticated baselines depict something else. " +
        "Use your own fixture identity rather than this one.",
    ).toHaveLength(1)
    expect(data![0].tenant_id).toBe(E2E_VISUAL_TENANT_ID)
    // Admin: /settings/tenant and the admin-only Stammdaten cards are part of
    // the captured surface, so a downgraded role would silently shrink two
    // baselines rather than fail anything.
    expect(data![0].role).toBe("admin")
  })

  /** Nobody else may live in the visual tenant either — same coupling, mirrored. */
  test("no foreign member has joined the visual tenant", async () => {
    const { data, error } = await admin!
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", E2E_VISUAL_TENANT_ID)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].user_id).toBe(E2E_VISUAL_USER_ID)
  })

  /**
   * `active_modules` decides what two of the seven baselines depict:
   * `stammdaten-resources.png` shows PROJ-Y-143f's `ModuleUnavailableNotice`
   * precisely because `resources` is off, and `settings-tenant.png` renders
   * every toggle. Measured, not assumed — switching `resources` on for this
   * tenant turns exactly those two red.
   *
   * Be clear about what this case does and does not prove. `global-setup`
   * upserts the set on every run, so an out-of-band change is *repaired*
   * before any test looks at it: this asserts that the seed took effect, not
   * that nobody drifted. The real guard against drift is the pair of images
   * above, which encode the module set pixel by pixel.
   */
  test("the visual tenant still carries the pinned module set", async () => {
    const { data, error } = await admin!
      .from("tenant_settings")
      .select("active_modules")
      .eq("tenant_id", E2E_VISUAL_TENANT_ID)
      .single()

    expect(error).toBeNull()
    expect([...(data!.active_modules as string[])].sort()).toEqual(
      [...E2E_VISUAL_ACTIVE_MODULES].sort(),
    )
  })

  /**
   * Identity strings that render inside the captures: the workspace label, the
   * dashboard greeting and the profile fields. Renaming either row moves an
   * image, so name the change here rather than in a pixel diff.
   */
  test("the rendered identity strings are unchanged", async () => {
    const { data: tenant } = await admin!
      .from("tenants")
      .select("name, branding")
      .eq("id", E2E_VISUAL_TENANT_ID)
      .single()
    expect(tenant!.name).toBe(E2E_VISUAL_TENANT_NAME)
    // Branding reaches every page (logo + accent colour); empty is what the
    // baselines were taken with.
    expect(tenant!.branding).toEqual({})

    const { data: profile } = await admin!
      .from("profiles")
      .select("display_name")
      .eq("id", E2E_VISUAL_USER_ID)
      .single()
    expect(profile!.display_name).toBe(E2E_VISUAL_USER_DISPLAY_NAME)
  })

  /**
   * The separation only means something if the two lanes really are disjoint.
   * The shared user must not reach the visual tenant, and the visual user must
   * not appear in the shared or assistant tenants.
   */
  test("the shared and visual lanes do not overlap", async () => {
    const { data } = await admin!
      .from("tenant_memberships")
      .select("tenant_id, user_id")
      .in("tenant_id", [
        E2E_TENANT_ID,
        E2E_ASSISTANT_TENANT_ID,
        E2E_VISUAL_TENANT_ID,
      ])
      .in("user_id", [E2E_USER_ID, E2E_VISUAL_USER_ID])

    const crossings = (data ?? []).filter(
      (row) =>
        (row.tenant_id === E2E_VISUAL_TENANT_ID &&
          row.user_id !== E2E_VISUAL_USER_ID) ||
        (row.tenant_id !== E2E_VISUAL_TENANT_ID &&
          row.user_id === E2E_VISUAL_USER_ID),
    )
    expect(crossings, "the two E2E lanes have started to overlap").toEqual([])
  })

  /**
   * The project-room baseline reads this row. It lives in the visual tenant so
   * that the projects list and the room are not fed by whatever other specs
   * create; a moved or missing row would make the room test skip (its own
   * `test.skip` on a >=400 response) rather than fail, which is the quiet
   * direction.
   */
  test("the seed project belongs to the visual tenant", async () => {
    const { data, error } = await admin!
      .from("projects")
      .select("tenant_id, is_deleted")
      .eq("id", E2E_VISUAL_PROJECT_ID)
      .single()

    expect(error).toBeNull()
    expect(data!.tenant_id).toBe(E2E_VISUAL_TENANT_ID)
    expect(data!.is_deleted).toBe(false)
  })
})
