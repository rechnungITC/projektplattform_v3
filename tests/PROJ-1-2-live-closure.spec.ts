/**
 * PROJ-1/2 live closure smokes.
 *
 * Covers the deferred closure notes in features/OPEN-DEFERRED-STATUS.md:
 * - PROJ-1: browser-test the Domain Claim UI.
 * - PROJ-1: verify invite and role-management routes with live
 *   service-role-backed Supabase calls and a second user.
 * - PROJ-2: verify the hard-delete route against a live seeded project.
 *
 * Chromium-only because the authenticated storage-state fixture is already
 * scoped that way in other live smoke specs.
 */

import { randomUUID } from "node:crypto"

import type { APIResponse } from "@playwright/test"
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import {
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_USER_ID,
} from "./fixtures/constants"

const E2E_DOMAIN = "e2e.projektplattform-v3.test"

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

async function requireAdminClient(): Promise<SupabaseClient> {
  const admin = await createAdminClient()
  if (!admin) {
    test.skip(true, "service-role env not available")
    throw new Error("unreachable")
  }
  return admin
}

async function expectStatus(
  response: APIResponse,
  expectedStatus: number,
): Promise<string> {
  const body = await response.text()
  expect(response.status(), body).toBe(expectedStatus)
  return body
}

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    })
    if (error) throw new Error(`listUsers failed: ${error.message}`)

    const match =
      data.users.find(
        (user) => user.email?.toLowerCase() === email.toLowerCase(),
      ) ?? null
    if (match) return match
    if (data.users.length < 100) return null
  }
  return null
}

async function findUserByEmailEventually(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const user = await findUserByEmail(admin, email)
    if (user) return user
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function deleteAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<void> {
  const user = await findUserByEmail(admin, email)
  if (!user) return
  await admin.auth.admin.deleteUser(user.id)
}

test.describe.serial("PROJ-1/2 live closure", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "live authenticated smokes are pinned to desktop chromium",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  test("PROJ-1 domain claim form submits through the browser", async ({
    authenticatedPage,
  }) => {
    const admin = await requireAdminClient()

    const { error: resetError } = await admin
      .from("tenants")
      .update({
        name: E2E_TENANT_NAME,
        domain: E2E_DOMAIN,
        language: "de",
        branding: {},
        holiday_region: null,
      })
      .eq("id", E2E_TENANT_ID)
    if (resetError) {
      throw new Error(`tenant reset failed: ${resetError.message}`)
    }

    await authenticatedPage.goto("/settings/tenant", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible({ timeout: 30_000 })

    const domainInput = authenticatedPage.getByLabel("E-Mail-Domain")
    await expect(domainInput).toBeVisible()
    await expect(domainInput).toHaveValue(E2E_DOMAIN)

    const responsePromise = authenticatedPage.waitForResponse((response) => {
      return (
        response.url().includes(`/api/tenants/${E2E_TENANT_ID}`) &&
        response.request().method() === "PATCH"
      )
    })

    await authenticatedPage
      .getByRole("button", { name: "Stammdaten speichern" })
      .click()

    const response = await responsePromise
    const bodyText = await expectStatus(response, 200)
    const body = JSON.parse(bodyText) as {
      tenant: { id: string; domain: string | null }
    }
    expect(body.tenant.id).toBe(E2E_TENANT_ID)
    expect(body.tenant.domain).toBe(E2E_DOMAIN)
  })

  test("PROJ-1 invite route creates an invited auth user with tenant metadata", async ({
    authenticatedPage,
  }) => {
    const admin = await requireAdminClient()
    const email = `p1invite${randomUUID().slice(0, 8)}@it-couch.de`

    try {
      const response = await authenticatedPage.request.post(
        `/api/tenants/${E2E_TENANT_ID}/invite`,
        {
          data: {
            email,
            role: "viewer",
          },
        },
      )
      await expectStatus(response, 200)

      const invitedUser = await findUserByEmailEventually(admin, email)
      expect(invitedUser, `invited user ${email} was not created`).not.toBeNull()
      expect(invitedUser?.user_metadata?.invited_to_tenant).toBe(E2E_TENANT_ID)
      expect(invitedUser?.user_metadata?.invited_role).toBe("viewer")
    } finally {
      await deleteAuthUserByEmail(admin, email)
    }
  })

  test("PROJ-1 role management changes and revokes a second live member", async ({
    authenticatedPage,
  }) => {
    const admin = await requireAdminClient()
    const userId = randomUUID()
    const email = `p1role${userId.slice(0, 8)}@it-couch.de`

    try {
      const { error: authError } = await admin.auth.admin.createUser({
        id: userId,
        email,
        password: `Test-${userId}!`,
        email_confirm: true,
        user_metadata: { display_name: "[E2E] PROJ-1 Role Smoke" },
      })
      if (authError) {
        throw new Error(`auth user seed failed: ${authError.message}`)
      }

      const { error: profileError } = await admin.from("profiles").upsert(
        {
          id: userId,
          email,
          display_name: "[E2E] PROJ-1 Role Smoke",
        },
        { onConflict: "id" },
      )
      if (profileError) {
        throw new Error(`profile seed failed: ${profileError.message}`)
      }

      const { error: membershipError } = await admin
        .from("tenant_memberships")
        .upsert(
          {
            tenant_id: E2E_TENANT_ID,
            user_id: userId,
            role: "member",
          },
          { onConflict: "tenant_id,user_id" },
        )
      if (membershipError) {
        throw new Error(`membership seed failed: ${membershipError.message}`)
      }

      const patchResponse = await authenticatedPage.request.patch(
        `/api/tenants/${E2E_TENANT_ID}/members/${userId}`,
        { data: { role: "viewer" } },
      )
      await expectStatus(patchResponse, 200)

      const { data: patchedMembership, error: patchedError } = await admin
        .from("tenant_memberships")
        .select("role")
        .eq("tenant_id", E2E_TENANT_ID)
        .eq("user_id", userId)
        .single()
      if (patchedError) {
        throw new Error(`membership read failed: ${patchedError.message}`)
      }
      expect((patchedMembership as { role: string }).role).toBe("viewer")

      const deleteResponse = await authenticatedPage.request.delete(
        `/api/tenants/${E2E_TENANT_ID}/members/${userId}`,
      )
      await expectStatus(deleteResponse, 200)

      const { data: deletedMembership, error: deletedError } = await admin
        .from("tenant_memberships")
        .select("id")
        .eq("tenant_id", E2E_TENANT_ID)
        .eq("user_id", userId)
        .maybeSingle()
      if (deletedError) {
        throw new Error(`membership delete check failed: ${deletedError.message}`)
      }
      expect(deletedMembership).toBeNull()
    } finally {
      await admin
        .from("tenant_memberships")
        .delete()
        .eq("tenant_id", E2E_TENANT_ID)
        .eq("user_id", userId)
      await admin.from("profiles").delete().eq("id", userId)
      await admin.auth.admin.deleteUser(userId)
    }
  })

  test("PROJ-2 hard-delete route removes a live seeded project", async ({
    authenticatedPage,
  }) => {
    const admin = await requireAdminClient()
    const projectId = randomUUID()

    try {
      const { error: projectError } = await admin.from("projects").insert({
        id: projectId,
        tenant_id: E2E_TENANT_ID,
        name: `[E2E] PROJ-2 Hard Delete ${projectId.slice(0, 8)}`,
        project_type: "general",
        responsible_user_id: E2E_USER_ID,
        created_by: E2E_USER_ID,
        is_deleted: true,
      })
      if (projectError) {
        throw new Error(`project seed failed: ${projectError.message}`)
      }

      const response = await authenticatedPage.request.delete(
        `/api/projects/${projectId}?hard=true`,
      )
      await expectStatus(response, 200)

      const { data: project, error: verifyError } = await admin
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle()
      if (verifyError) {
        throw new Error(`project delete check failed: ${verifyError.message}`)
      }
      expect(project).toBeNull()
    } finally {
      await admin.from("projects").delete().eq("id", projectId)
    }
  })
})
