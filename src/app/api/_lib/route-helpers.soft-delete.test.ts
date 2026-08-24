import { describe, expect, it, vi } from "vitest"

import { requireProjectAccess } from "./route-helpers"

/**
 * PROJ-Y-45m — der Papierkorb wird an EINER Stelle durchgesetzt.
 *
 * Gemessen (2026-08-21, gegen Prod): 11 von 11 projektbezogenen
 * Auswertungsfunktionen filtern `projects.is_deleted` NICHT, und keine der vier
 * Bau-RLS-Policies tut es. Die einzige Durchsetzungsstelle ist der Filter
 * `.eq("is_deleted", false)` in `requireProjectAccess`. Begründung und die
 * verworfene Alternative: `docs/decisions/soft-delete-enforcement-scope.md`.
 *
 * Eine produktweite Zusage mit genau einer Durchsetzungsstelle und ohne Test ist
 * genau die Konstellation, in der sie unbemerkt verschwindet. Deshalb ZWEI
 * Hälften, die sich nicht gegenseitig ersetzen:
 *
 *   1. Verhalten — ein Papierkorb-Projekt ergibt 404, nicht 403 und nicht 500.
 *   2. Struktur   — der Filter wird nachweislich angewandt. Ohne diese Hälfte
 *      bliebe der Test grün, wenn `.eq("is_deleted", false)` gelöscht wird:
 *      der Attrappe ist es gleich, wonach gefragt wurde.
 */

/** Attrappe, die jeden `.eq(...)`-Aufruf mitschreibt. */
function projectsStub(row: unknown) {
  const eqCalls: [string, unknown][] = []
  const chain = {
    eqCalls,
    select: () => chain,
    eq(column: string, value: unknown) {
      eqCalls.push([column, value])
      return chain
    },
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return chain
}

function clientFor(row: unknown) {
  const projects = projectsStub(row)
  const client = {
    from: vi.fn((table: string) => {
      if (table === "projects") return projects
      throw new Error(
        `Unerwartete Tabelle "${table}" — für ein Papierkorb-Projekt darf ` +
          "requireProjectAccess gar nicht bis zur Rollenauflösung kommen."
      )
    }),
  }
  return { client, projects }
}

const PROJECT = "11111111-1111-4111-8111-111111111111"
const USER = "22222222-2222-4222-8222-222222222222"

describe("requireProjectAccess — Papierkorb (PROJ-Y-45m)", () => {
  it("wendet den is_deleted-Filter wirklich an (die strukturelle Hälfte)", async () => {
    const { client, projects } = clientFor(null)

    await requireProjectAccess(
      client as never,
      PROJECT,
      USER,
      "view"
    )

    expect(projects.eqCalls).toContainEqual(["is_deleted", false])
    // Und der Filter sitzt auf DER Abfrage, die das Projekt auflöst — nicht
    // irgendwo sonst.
    expect(projects.eqCalls).toContainEqual(["id", PROJECT])
  })

  it.each(["view", "edit", "manage_members"] as const)(
    "antwortet für ein Papierkorb-Projekt mit 404 statt 403/500 (%s)",
    async (action) => {
      const { client } = clientFor(null)

      const result = await requireProjectAccess(
        client as never,
        PROJECT,
        USER,
        action
      )

      expect(result.project).toBeUndefined()
      expect(result.error?.status).toBe(404)
      // 404 und nicht 403: die Existenz eines Projekts, das der Aufrufer nicht
      // sehen darf, wird nicht verraten — dieselbe Antwort wie für ein Projekt
      // eines fremden Mandanten.
      const body = await result.error!.json()
      expect(body.error.code).toBe("not_found")
    }
  )

  it("lässt ein lebendes Projekt durch (Gegenprobe, sonst prüft der Test nur 404)", async () => {
    const { client } = clientFor({ id: PROJECT, tenant_id: "t" })

    const result = await requireProjectAccess(
      client as never,
      PROJECT,
      USER,
      "view"
    )

    expect(result.error).toBeUndefined()
    expect(result.project?.id).toBe(PROJECT)
  })
})
