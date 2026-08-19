/**
 * PROJ-Y-143n — regression cover for the one gate that already worked.
 *
 * The five CSV-import routes were the *only* organization routes enforcing the
 * `organization` module before this slice. Nothing here was changed, which is
 * precisely why it needs a test: the slice's whole point is that the switch now
 * behaves the same on both halves of the surface, and "the half that already
 * worked still works" was previously untested (this directory had no tests at
 * all).
 *
 * All five routes share `requireOrganizationImportAdmin`, so the gate is tested
 * once at the helper — plus a structural check below that no route has quietly
 * grown its own path around it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createModuleGateHarness,
  withoutOrganization,
} from "@/test/module-gate-harness"

const harness = createModuleGateHarness()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => harness.client),
}))

import { requireOrganizationImportAdmin } from "./_helpers"

beforeEach(() => harness.reset())

async function statusOf(intent: "read" | "write"): Promise<number | "ok"> {
  const result = await requireOrganizationImportAdmin(intent)
  return "error" in result ? result.error.status : "ok"
}

describe("requireOrganizationImportAdmin", () => {
  it("still answers 404 on a read with the module off", async () => {
    harness.activeModules = withoutOrganization()
    expect(await statusOf("read")).toBe(404)
  })

  it("still answers 403 on a write with the module off", async () => {
    harness.activeModules = withoutOrganization()
    expect(await statusOf("write")).toBe(403)
  })

  it("still lets a tenant admin through with the module on", async () => {
    expect(await statusOf("write")).toBe("ok")
  })

  it("still refuses a non-admin with the module on", async () => {
    harness.role = "member"
    expect(await statusOf("write")).toBe(403)
  })

  it("still gates the module before the admin role", async () => {
    // Unchanged order, asserted so the two halves of the surface cannot drift:
    // the core routes gained the gate in this same position.
    harness.activeModules = withoutOrganization()
    harness.role = "member"
    expect(await statusOf("read")).toBe(404)
  })

  it("still answers 401 unauthenticated and 403 without a tenant", async () => {
    harness.userId = null
    expect(await statusOf("read")).toBe(401)
    harness.reset()
    harness.activeTenantId = null
    expect(await statusOf("read")).toBe(403)
  })
})

describe("the five CSV-import routes", () => {
  it("all reach the gate through the shared helper", async () => {
    const routes = [
      ["route.ts", '"read"'],
      ["upload/route.ts", '"write"'],
      ["[id]/preview/route.ts", '"read"'],
      ["[id]/commit/route.ts", '"write"'],
      ["[id]/rollback/route.ts", '"write"'],
    ] as const

    for (const [file, intent] of routes) {
      const source = readFileSync(
        join(process.cwd(), "src/app/api/organization-imports", file),
        "utf8",
      )
      expect(source, file).toContain(`requireOrganizationImportAdmin(${intent})`)
    }
  })
})
