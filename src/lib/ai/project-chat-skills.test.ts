import { describe, expect, it, vi } from "vitest"

import { loadProjectChatSkills } from "./project-chat-skills"

/**
 * PROJ-Y-151b — der Skill-Kontext war in Produktion STILL wirkungslos.
 *
 * `skill_versions` und `skills` sind ueber ZWEI Fremdschluessel verbunden, die
 * zweite Abfrage bettete `skills(name)` ein, PostgREST konnte das nicht
 * aufloesen — und weil `error` nicht geprueft wurde, kam eine leere Liste
 * heraus statt eines Fehlers. Gefunden hat das erst der echte Anbieter-
 * Durchlauf gegen die deployte Anwendung, nicht die gemockten Route-Tests.
 *
 * Diese Tests halten beide Haelften fest: keine mehrdeutige Einbettung mehr,
 * und ein Datenbankfehler fuehrt nicht mehr lautlos zu "keine Skills".
 */

type Row = Record<string, unknown>

function clientReturning(
  links: { data: Row[] | null; error: { message: string } | null },
  versions: { data: Row[] | null; error: { message: string } | null },
  spy?: { selects: string[] },
) {
  let call = 0
  const build = (result: unknown) => {
    const chain: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in"]) {
      chain[m] = (arg: unknown) => {
        if (m === "select") spy?.selects.push(String(arg))
        return chain
      }
    }
    // Die Kette ist thenable — genauso konsumiert es der Produktivcode.
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve(result)
    return chain
  }
  return {
    from: () => build(call++ === 0 ? links : versions),
  } as never
}

describe("loadProjectChatSkills", () => {
  it("bettet `skills` NICHT in die skill_versions-Abfrage ein", async () => {
    const spy = { selects: [] as string[] }
    await loadProjectChatSkills(
      clientReturning(
        { data: [{ skill_id: "s1", skills: { name: "A", is_active: true } }], error: null },
        { data: [{ skill_id: "s1", markdown_content: "tu dies" }], error: null },
        spy,
      ),
      "t1",
      "p1",
    )
    // Genau die Form, die in Produktion scheiterte. Waere sie wieder da,
    // liefe der Chat erneut still ohne Skills.
    expect(spy.selects[1]).not.toContain("skills(")
    expect(spy.selects[1]).toContain("markdown_content")
  })

  it("nimmt den Namen aus der ersten Abfrage", async () => {
    const skills = await loadProjectChatSkills(
      clientReturning(
        { data: [{ skill_id: "s1", skills: { name: "Bau-Skill", is_active: true } }], error: null },
        { data: [{ skill_id: "s1", markdown_content: "tu dies" }], error: null },
      ),
      "t1",
      "p1",
    )
    expect(skills).toEqual([{ name: "Bau-Skill", instructions: "tu dies" }])
  })

  it("meldet einen Datenbankfehler, statt ihn als 'keine Skills' auszugeben", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const skills = await loadProjectChatSkills(
      clientReturning(
        { data: [{ skill_id: "s1", skills: { name: "A", is_active: true } }], error: null },
        { data: null, error: { message: "more than one relationship was found" } },
      ),
      "t1",
      "p1",
    )
    expect(skills).toEqual([])
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("more than one relationship was found"),
    )
    err.mockRestore()
  })

  it("laesst inaktive Skills aus", async () => {
    const skills = await loadProjectChatSkills(
      clientReturning(
        { data: [{ skill_id: "s1", skills: { name: "A", is_active: false } }], error: null },
        { data: [{ skill_id: "s1", markdown_content: "tu dies" }], error: null },
      ),
      "t1",
      "p1",
    )
    expect(skills).toEqual([])
  })
})
