// @vitest-environment node
/**
 * PROJ-Y-130p — struktureller Wächter für die geteilte Bericht-Sicht.
 *
 * Die Sicht wird von ZWEI Flächen genutzt: der Administrations-Seite (innerhalb
 * der App-Hülle) und der Revisions-Sicht (außerhalb, PROJ-Y-130o). Außerhalb der
 * Hülle gibt es keinen AuthProvider — ein `useAuth()` in der Sicht würde dort zur
 * Laufzeit brechen, und zwar nur auf dieser einen Fläche. Ein Typfehler entsteht
 * dabei nicht, deshalb dieser Test.
 *
 * Zweite Zusicherung: beide Flächen nutzen wirklich die geteilte Sicht. Eine
 * zurückkopierte Zweitfassung würde driften — und dann zeigt eine Fläche Einträge,
 * die die andere verschweigt.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

const VIEW = "src/components/audit/audit-report-view.tsx"
const ADMIN_SURFACE = "src/app/(app)/reports/audit/audit-report-client.tsx"
const REVISION_SURFACE = "src/app/revision/revision-client.tsx"

describe("AuditReportView", () => {
  it("hängt nicht am Sitzungskontext (kein use-auth-Import)", () => {
    // Geprüft wird der IMPORT, nicht das Wort: die Sicht erklärt im Kommentar,
    // warum sie ohne `useAuth` arbeitet — eine Wortsuche würde daran anschlagen
    // und damit die Erklärung bestrafen statt den Fehler zu finden.
    expect(read(VIEW)).not.toMatch(/from\s+["']@\/hooks\/use-auth["']/)
  })

  it("nimmt den Mandanten als Prop", () => {
    expect(read(VIEW)).toMatch(/tenantId/)
  })

  it("wird von beiden Flächen genutzt statt kopiert", () => {
    for (const surface of [ADMIN_SURFACE, REVISION_SURFACE]) {
      expect(
        read(surface).includes("@/components/audit/audit-report-view"),
        `${surface} nutzt die geteilte Bericht-Sicht nicht`
      ).toBe(true)
    }
  })

  it("die Revisions-Sicht ruft weiterhin kein useAuth auf", () => {
    // Sie liegt außerhalb der App-Hülle; ein Sitzungs-Mandant existiert dort nicht.
    expect(read(REVISION_SURFACE)).not.toMatch(/from\s+["']@\/hooks\/use-auth["']/)
  })
})
