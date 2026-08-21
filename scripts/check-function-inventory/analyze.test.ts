import { describe, expect, it } from "vitest"

import {
  analyzeInventory,
  extractCreatedFunctions,
  hasFailures,
  parseInventory,
  INVENTORY_EXCEPTIONS,
  type InventoryException,
} from "./analyze"

describe("parseInventory", () => {
  it("übergeht Kommentare und Leerzeilen und normalisiert auf Kleinschreibung", () => {
    expect(
      parseInventory("# Kopf\n\n  Foo_Bar  \n# noch ein Kommentar\nbaz\n")
    ).toEqual(["baz", "foo_bar"])
  })

  it("entdoppelt", () => {
    expect(parseInventory("a\na\nb")).toEqual(["a", "b"])
  })
})

describe("extractCreatedFunctions", () => {
  it("erkennt die im Repo üblichen Schreibweisen", () => {
    const sql = `
      create function public.eins() returns void as $$ begin end $$;
      create or replace function zwei() returns trigger as $$ begin end $$;
      CREATE OR REPLACE FUNCTION public . drei () returns void as $$ $$;
    `
    expect(extractCreatedFunctions(sql)).toEqual(["drei", "eins", "zwei"])
  })

  it("liest nur `create function`, nicht `revoke`/`pg_get_functiondef`", () => {
    // Genau daran hängt die Einordnung von `enforce_last_lead`: sie kommt in den
    // Migrationen ausschliesslich in diesen beiden Formen vor.
    const sql = `
      revoke execute on function public.enforce_last_lead() from anon;
      select pg_get_functiondef('public.enforce_last_lead()'::regprocedure);
    `
    expect(extractCreatedFunctions(sql)).toEqual([])
  })
})

describe("analyzeInventory", () => {
  const legacy = (name: string): InventoryException => ({
    name,
    reason: "Testgrund",
    kind: "legacy",
  })

  it("meldet eine Funktion, die in Prod existiert und die niemand anlegt", () => {
    // Der PROJ-Y-148c-Fall, wörtlich: `hard_delete_project` lief fünf Tage in Prod,
    // ohne dass eine Migrationsdatei sie anlegte.
    const r = analyzeInventory(
      ["is_tenant_member", "hard_delete_project"],
      ["is_tenant_member"],
      []
    )
    expect(r.unexplained).toEqual(["hard_delete_project"])
    expect(hasFailures(r)).toBe(true)
  })

  it("schweigt, wenn dieselbe Funktion dokumentiert ist", () => {
    const r = analyzeInventory(
      ["is_tenant_member", "hard_delete_project"],
      ["is_tenant_member"],
      [legacy("hard_delete_project")]
    )
    expect(r.unexplained).toEqual([])
    expect(hasFailures(r)).toBe(false)
  })

  it("meldet eine Ausnahme, deren Funktion nicht mehr in Prod ist", () => {
    const r = analyzeInventory(["a"], ["a"], [legacy("weg")])
    expect(r.staleExceptions).toEqual(["weg"])
    expect(hasFailures(r)).toBe(true)
  })

  it("räumt sich selbst auf: eine Ausnahme, die das Repo inzwischen anlegt, ist veraltet", () => {
    // Das ist der Lebenszyklus eines `pending_merge`-Eintrags. Ohne diese Prüfung
    // bliebe er liegen und würde später einen echten Fund gleichen Namens decken.
    const r = analyzeInventory(
      ["neu"],
      ["neu"],
      [{ name: "neu", reason: "Slice noch nicht gemergt", kind: "pending_merge" }]
    )
    expect(r.staleExceptions).toEqual(["neu"])
    expect(hasFailures(r)).toBe(true)
  })

  it("wertet `nur im Repo` nicht als Fehler", () => {
    // Eine gemergte, aber noch nicht angewendete Migration — und eine bewusst
    // gedroppte Funktion — landen beide hier.
    const r = analyzeInventory(["a"], ["a", "gedroppt"], [])
    expect(r.repoOnly).toEqual(["gedroppt"])
    expect(hasFailures(r)).toBe(false)
  })

  it("ist gegen Groß-/Kleinschreibung robust", () => {
    const r = analyzeInventory(["Foo"], ["FOO"], [])
    expect(r.unexplained).toEqual([])
  })
})

describe("INVENTORY_EXCEPTIONS", () => {
  it("begründet jeden Eintrag", () => {
    // Eine Ausnahme ohne Begründung ist eine stille Abweichung — genau das, was
    // dieser Wächter verhindern soll.
    for (const e of INVENTORY_EXCEPTIONS) {
      expect(e.name.trim()).not.toBe("")
      expect(e.reason.trim().length).toBeGreaterThan(40)
      expect(["legacy", "pending_merge"]).toContain(e.kind)
    }
  })

  it("führt keinen Eintrag doppelt", () => {
    const names = INVENTORY_EXCEPTIONS.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("friert die heute akzeptierten Abweichungen ein", () => {
    // Ein neuer Eintrag ist eine bewusste Entscheidung und soll im Diff auffallen.
    expect(INVENTORY_EXCEPTIONS.map((e) => [e.name, e.kind])).toEqual([
      ["enforce_last_lead", "legacy"],
      ["enforce_project_membership_user_in_tenant", "legacy"],
      // PROJ-Y-114as `pending_merge`-Eintrag ist mit dessen Merge entfallen —
      // genau wie sein Kommentar es vorhergesagt hat. Kein Ersatz: die Liste
      // soll leer laufen, nicht gepflegt werden.
    ])
  })
})
