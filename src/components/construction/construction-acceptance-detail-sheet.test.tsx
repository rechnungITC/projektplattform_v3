/**
 * PROJ-Y-45i — die Abnahme-Detailansicht hat auch im **Ladezustand** einen
 * zugänglichen Namen (QA-Befund F-γ2, Low, WCAG-Hygiene).
 *
 * Der Defekt war strukturell: `SheetHeader`/`SheetTitle` standen im `else`-Zweig
 * der Ladeverzweigung. Solange geladen wurde, existierte im Sheet also kein
 * Titel — ein Screenreader kündigt dann ein Fenster ohne Namen an und der
 * Kontext ist verloren. Nur unter Last sichtbar, deshalb nie aufgefallen.
 *
 * Diese Datei prüft bewusst den **zugänglichen Namen** (`getByRole("dialog",
 * { name })`) und nicht bloss sichtbaren Text: ein `getByText` wäre auch grün,
 * wenn der Text irgendwo im Rumpf stünde, ohne das Fenster zu benennen — und
 * genau das ist der Unterschied, um den es hier geht. Radix verknüpft
 * `aria-labelledby` nur mit einem echten `Dialog.Title`.
 *
 * Der Hook wird gemockt, weil die Ladeverzweigung genau an ihm hängt; alles
 * andere (Radix, Portal, aria-Verdrahtung) läuft echt — das Gemockte ist das
 * I/O, nicht der Prüfling.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const detailMock = vi.fn()

vi.mock("@/hooks/use-construction-acceptances", () => ({
  useConstructionAcceptanceDetail: () => detailMock(),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { ConstructionAcceptanceDetailSheet } from "./construction-acceptance-detail-sheet"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ACCEPTANCE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"

function renderSheet() {
  return render(
    <ConstructionAcceptanceDetailSheet
      projectId={PROJECT}
      acceptanceId={ACCEPTANCE}
      onOpenChange={() => {}}
      canManage={false}
      onChanged={() => {}}
    />,
  )
}

describe("PROJ-Y-45i — zugänglicher Name im Ladezustand", () => {
  beforeEach(() => {
    detailMock.mockReset()
  })

  it("das Sheet trägt einen Namen, während geladen wird", () => {
    detailMock.mockReturnValue({
      detail: null,
      loading: true,
      refresh: vi.fn(),
    })
    renderSheet()

    // Das ist die Zusicherung, die vor dem Fix fehlschlug: ohne SheetTitle im
    // Ladezweig hat der Dialog KEINEN accessible name, die Rollenabfrage mit
    // `name` findet ihn also nicht.
    expect(
      screen.getByRole("dialog", { name: /Abnahme wird geladen/i }),
    ).toBeInTheDocument()
  })

  it("nach dem Laden benennt der Titel die konkrete Abnahme", () => {
    detailMock.mockReturnValue({
      loading: false,
      refresh: vi.fn(),
      detail: {
        acceptance: {
          id: ACCEPTANCE,
          acceptance_number: 7,
          status: "abgenommen",
          title: "Rohbau Nord",
          supersedes_acceptance_id: null,
          trade: null,
          section: null,
        },
        events: [],
        participants: [],
        reservations: [],
      },
    })
    renderSheet()

    // Gegenprobe zum ersten Fall: der Ladetitel darf danach NICHT mehr stehen,
    // sonst wäre der erste Test auch mit einem dauerhaft gerenderten
    // Platzhalter-Titel grün — und die Verzweigung gar nicht geprüft.
    expect(
      screen.getByRole("dialog", { name: /Abnahme Nr\. 7/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Abnahme wird geladen/i)).not.toBeInTheDocument()
  })
})
