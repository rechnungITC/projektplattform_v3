import { expect, test } from "@playwright/test"

/**
 * PROJ-45-ε — Auth-Gates der Fotoflächen.
 *
 * Ohne Sitzung muss jeder Endpunkt mit exakt 307 auf /login umleiten und im
 * Rumpf nichts preisgeben. Der EINE Statuswert ist Absicht (β-QA hat die
 * α-Zusicherung von vier erlaubten Werten auf den verschärft, der auftritt).
 *
 * **Die Ausliefer-Route ist der wichtigste Fall dieser Datei** (AC-45εH-6): sie
 * gibt Bilddaten heraus, also darf ohne Sitzung nicht nur der Status stimmen,
 * sondern es dürfen auch keine Bild-Bytes im Rumpf stehen. Ein 307 mit
 * `image/jpeg` wäre ein Leck, das eine reine Statusprüfung nicht sieht.
 *
 * Was hier bewusst NICHT belegt ist: die Modul-Tore (Lese-Absicht → 404) und
 * die β-Rechteregel. Ein unangemeldeter Aufruf kann darüber nichts aussagen,
 * weil die Umleitung VOR dem Tor greift. Beides liegt woanders:
 *  - Modul-Tor und Rechteweiche je Route: Route-Tests unter
 *    src/app/api/projects/[id]/construction-photos/**\/route.test.ts
 *  - Rollen, Löschsperre und Aggregat-Leck: live gegen Prod in
 *    tests/sql/PROJ-45-epsilon-construction-photos-pentest.sql
 *  - Rechteweiche im DOM: construction-photo-strip.test.tsx
 */

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const PHOTO = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const BASE = `/api/projects/${PROJECT}/construction-photos`

const ROUTES: Array<{ name: string; path: string }> = [
  { name: "Liste", path: `${BASE}?defect_id=${PHOTO}` },
  { name: "Zähler", path: `${BASE}/counts` },
  { name: "Vorschau-Bytes", path: `${BASE}/${PHOTO}/file?size=preview` },
  { name: "Druck-Bytes", path: `${BASE}/${PHOTO}/file?size=print` },
  { name: "Original-Bytes", path: `${BASE}/${PHOTO}/file?size=original` },
]

test.describe("PROJ-45-ε — Fotodokumentation: Auth-Gates", () => {
  for (const route of ROUTES) {
    test(`GET ${route.name} ist ohne Sitzung gesperrt`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 })
      expect(res.status()).toBe(307)
      const body = await res.text()
      // Marken, die ausschliesslich in der NUTZLAST auftreten können — der Rumpf
      // spiegelt `?next=<Pfad>` und damit die Eingabe des Aufrufers selbst,
      // Pfadbestandteile sind also keine Preisgabe (Hausform aus β/γ/δ).
      expect(body).not.toContain("taken_on")
      expect(body).not.toContain("original_filename")
      expect(body).not.toContain("storage_path")
      expect(body).not.toContain("by_section")
    })
  }

  test("die Ausliefer-Route gibt ohne Sitzung keine Bild-Bytes heraus", async ({
    request,
  }) => {
    for (const size of ["preview", "print", "original"]) {
      const res = await request.get(`${BASE}/${PHOTO}/file?size=${size}`, {
        maxRedirects: 0,
      })
      expect(res.status()).toBe(307)
      // Der eigentliche Nachweis: kein Bild-Inhaltstyp und kein Bild-Rumpf.
      expect(res.headers()["content-type"] ?? "").not.toContain("image/")
      const body = await res.body()
      // JPEG beginnt mit FF D8, PNG mit 89 50 4E 47 — beides darf hier nicht
      // stehen. Eine reine Statusprüfung würde ein Leck mit 307 nicht sehen.
      expect(body.subarray(0, 2).toString("hex")).not.toBe("ffd8")
      expect(body.subarray(0, 4).toString("hex")).not.toBe("89504e47")
    }
  })

  test("Anlegen ist ohne Sitzung gesperrt", async ({ request }) => {
    const res = await request.post(BASE, {
      multipart: {
        defect_id: PHOTO,
        file: {
          name: "x.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        },
      },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(307)
    expect(await res.text()).not.toContain("results")
  })

  test("Ändern und Entfernen sind ohne Sitzung gesperrt", async ({ request }) => {
    const patch = await request.patch(`${BASE}/${PHOTO}`, {
      data: { caption: "x" },
      maxRedirects: 0,
    })
    expect(patch.status()).toBe(307)

    const del = await request.delete(`${BASE}/${PHOTO}?delete_file=true`, {
      maxRedirects: 0,
    })
    expect(del.status()).toBe(307)
    expect(await del.text()).not.toContain("file_trashed")
  })

  test("das Abnahmeprotokoll verrät ohne Sitzung keine Fotodaten", async ({
    request,
  }) => {
    const res = await request.get(
      `/projects/${PROJECT}/abnahmeprotokoll/print?abnahme=${PHOTO}`,
      { maxRedirects: 0 },
    )
    expect(res.status()).toBe(307)
    const body = await res.text()
    expect(body).not.toContain("Fotodokumentation")
    expect(body).not.toContain("Ohne Bildunterschrift")
    expect(body).not.toContain("aufgenommen am")
  })
})
