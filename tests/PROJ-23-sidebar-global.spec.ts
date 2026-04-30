import { expect, test } from "@playwright/test"

// PROJ-23 — Globale Sidebar-Navigation
//
// Frontend-only Slice. The auth-gate + visual smoke checks below verify
// the layout renders for unauthenticated users and the login surface is
// reachable without the new shell. Authenticated UI exercising (sidebar
// toggle, hotkeys, project-sidebar) requires a logged-in fixture and is
// covered manually for the MVP — once a Playwright test-user is wired
// in, those flows become automated.

test.describe("PROJ-23 / public route surface", () => {
  test("login page renders without the AppShell (no sidebar leak)", async ({
    request,
  }) => {
    const res = await request.get("/login", { failOnStatusCode: false })
    expect(res.status()).toBe(200)
    const html = await res.text()
    // GlobalSidebar must NOT render outside the (app) group. shadcn-Sidebar
    // injects a `data-sidebar="sidebar"` attribute on its root element.
    expect(html).not.toContain('data-sidebar="sidebar"')
    // Login form should still render (sanity).
    expect(html.toLowerCase()).toMatch(/log\s*in|anmelden/i)
  })

  test("authenticated routes redirect to /login (auth-gate works)", async ({
    request,
  }) => {
    for (const path of ["/", "/projects", "/stammdaten", "/reports", "/settings/profile"]) {
      const res = await request.get(path, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect([307, 401]).toContain(res.status())
    }
  })

  test("project-uuid path requires auth (expected redirect)", async ({ request }) => {
    const res = await request.get(
      "/projects/00000000-0000-0000-0000-000000000000/budget",
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect([307, 401]).toContain(res.status())
  })

  test("non-uuid project sub-routes still go through auth gate", async ({
    request,
  }) => {
    // /projects/new/wizard and /projects/drafts are valid paths — they
    // should NOT crash the AppShell's project-sidebar logic.
    for (const path of ["/projects/new/wizard", "/projects/drafts"]) {
      const res = await request.get(path, {
        failOnStatusCode: false,
        maxRedirects: 0,
      })
      expect([307, 401]).toContain(res.status())
    }
  })
})
