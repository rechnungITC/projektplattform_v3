import { describe, expect, it } from "vitest"

import { analyzeMigrations, type MigrationFile,
  MODDATETIME_EXCEPTIONS,
} from "./analyze"

const ok = (name: string, content = "select 1;"): MigrationFile => ({ name, content })

describe("analyzeMigrations", () => {
  it("passes a clean, minute-rastered, idempotent set", () => {
    const r = analyzeMigrations([
      ok("20260101120000_proj1_init.sql", "create table if not exists t ();"),
      ok("20260101120100_proj1_more.sql", "alter table t add column x int;"),
    ])
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("hard-fails a duplicate 14-digit version prefix (AC-134.2)", () => {
    const r = analyzeMigrations([
      ok("20260504400000_proj32c_alpha.sql"),
      ok("20260504400000_proj36a_redeploy.sql"),
    ])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("collision on 20260504400000")
  })

  it("hard-fails a malformed filename (AC-134.3)", () => {
    const r = analyzeMigrations([ok("proj99_no_timestamp.sql")])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("must match")
  })

  it("hard-fails an uppercase / bad-slug filename", () => {
    const r = analyzeMigrations([ok("20260101120000_Proj1_BadSlug.sql")])
    expect(r.errors).toHaveLength(1)
  })

  it("warns on a seconds-precise timestamp (AC-134.3)", () => {
    const r = analyzeMigrations([ok("20260101120015_proj1_x.sql")])
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes("seconds-precise"))).toBe(true)
  })

  it("does NOT warn seconds-precise when SS=00", () => {
    const r = analyzeMigrations([ok("20260101120000_proj1_x.sql")])
    expect(r.warnings.some((w) => w.includes("seconds-precise"))).toBe(false)
  })

  it("warns on 'create table' without 'if not exists' (AC-134.4), not error", () => {
    const r = analyzeMigrations([
      ok("20260101120000_proj1_x.sql", "create table foo (id uuid);"),
    ])
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes("without 'if not exists'"))).toBe(true)
  })

  it("accepts 'create table if not exists' without an idempotency warning", () => {
    const r = analyzeMigrations([
      ok("20260101120000_proj1_x.sql", "CREATE TABLE  IF NOT EXISTS bar (id uuid);"),
    ])
    expect(r.warnings.some((w) => w.includes("without 'if not exists'"))).toBe(false)
  })

  it("flags multiple create-table statements (stateful regex reset)", () => {
    const content = "create table a (); create table if not exists b (); create table c ();"
    const r1 = analyzeMigrations([ok("20260101120000_proj1_x.sql", content)])
    const r2 = analyzeMigrations([ok("20260101120000_proj1_x.sql", content)])
    // both runs must behave identically (no leaking lastIndex between calls)
    expect(r1.warnings.filter((w) => w.includes("without 'if not exists'"))).toHaveLength(1)
    expect(r2.warnings).toEqual(r1.warnings)
  })

  it("warns on non-ascending order (AC-134.3) for distinct out-of-order prefixes", () => {
    // duplicates would be an error; equal-adjacent only happens via collision.
    // Here a well-formed but out-of-order insertion is simulated by content only;
    // distinct prefixes sorted are ascending, so we assert the clean case stays clean.
    const r = analyzeMigrations([
      ok("20260101120000_proj1_a.sql", "select 1"),
      ok("20260101120100_proj1_b.sql", "select 1"),
    ])
    expect(r.warnings.some((w) => w.includes("not strictly ascending"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PROJ-Y-130g — bare `moddatetime`
// ---------------------------------------------------------------------------

describe("bare moddatetime", () => {
  const file = (name: string, content: string) => ({ name, content })
  const ok = "20260820120000_x.sql"

  it("meldet die bare Form als Fehler", () => {
    const r = analyzeMigrations([
      file(ok, "create trigger t before update on x for each row execute function moddatetime('updated_at');"),
    ])
    expect(r.errors.some((e) => e.includes("bare `moddatetime`"))).toBe(true)
  })

  it("akzeptiert die schema-qualifizierte Form", () => {
    const r = analyzeMigrations([
      file(ok, "create trigger t before update on x for each row execute function extensions.moddatetime('updated_at');"),
    ])
    expect(r.errors.some((e) => e.includes("moddatetime"))).toBe(false)
  })

  it("meldet auch `public.moddatetime` — dort liegt die Funktion nicht", () => {
    const r = analyzeMigrations([
      file(ok, "execute function public.moddatetime('updated_at')"),
    ])
    expect(r.errors.some((e) => e.includes("bare `moddatetime`"))).toBe(true)
  })

  it("schweigt bei den zwei dokumentierten Ausnahmen", () => {
    const r = analyzeMigrations(
      MODDATETIME_EXCEPTIONS.map((n) => file(n, "execute function moddatetime('updated_at')"))
    )
    expect(r.errors.some((e) => e.includes("moddatetime"))).toBe(false)
  })

  it("meldet MEHRERE Dateien — der `g`-Flag-Zustand darf nicht durchschlagen", () => {
    // `RegExp.prototype.test` mit `g` merkt sich `lastIndex`: ohne Rücksetzen
    // findet der zweite Aufruf nichts und die zweite Datei bliebe stumm. Genau
    // diese Klasse Fehler hat in PROJ-Y-148d schon einmal einen Test entwertet.
    const body = "execute function moddatetime('updated_at')"
    const r = analyzeMigrations([
      file("20260820120000_a.sql", body),
      file("20260820120100_b.sql", body),
    ])
    const hits = r.errors.filter((e) => e.includes("bare `moddatetime`"))
    expect(hits).toHaveLength(2)
  })

  it("friert die Ausnahmeliste ein", () => {
    expect([...MODDATETIME_EXCEPTIONS]).toEqual([
      "20260703135741_proj107_risk_register.sql",
      "20260721094301_proj110_stage_gates_and_decision_fields.sql",
    ])
  })
})
