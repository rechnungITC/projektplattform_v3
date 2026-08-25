/**
 * PROJ-45-ε — die Rechteweiche der Fotostrecke im DOM.
 *
 * Der tragende Nachweis ist ein **Paar**, keine einzelne Zusicherung: dass dem
 * Betrachter „Foto hinzufügen" angeboten wird UND ihm im selben Zustand die
 * Änder-/Entfernen-Handlungen fehlen. Nur die eine Hälfte zu prüfen belegt
 * „Knopf fehlt", nicht „hier bewusst anders als bei der Abnahme" — genau die
 * Lücke, die der γ-QA-Lauf an seinem eigenen Test gefunden hat.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { photosMock } = vi.hoisted(() => ({ photosMock: vi.fn() }))

vi.mock("@/hooks/use-construction-photos", () => ({
  useConstructionPhotos: photosMock,
}))

import { ConstructionPhotoStrip } from "./construction-photo-strip"
import type { ConstructionPhoto } from "@/types/construction-photo"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

function photo(over: Partial<ConstructionPhoto> = {}): ConstructionPhoto {
  return {
    id: "ph-1",
    project_id: PROJECT,
    document_id: "doc-1",
    defect_id: "def-1",
    acceptance_id: null,
    section_id: null,
    caption: "Riss",
    taken_on: "2026-03-14",
    sort_order: 0,
    created_by: null,
    created_at: "2026-08-25T10:00:00Z",
    original_filename: "riss.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    ...over,
  }
}

function state(over: Record<string, unknown> = {}) {
  return {
    photos: [photo()],
    loading: false,
    moduleInactive: false,
    error: null,
    refresh: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  photosMock.mockReset()
  photosMock.mockReturnValue(state())
})

describe("ConstructionPhotoStrip — Rechte (AC-45ε.16/.17)", () => {
  it("Betrachter darf hinzufügen …", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage={false}
      />,
    )
    expect(
      screen.getByRole("button", { name: /Foto hinzufügen/ }),
    ).toBeInTheDocument()
  })

  it("… und im SELBEN Zustand nicht ändern, umsortieren oder entfernen", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage={false}
      />,
    )
    expect(screen.queryByLabelText("Bildunterschrift")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Nach vorne")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Vom Bezug lösen/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Löschen/ })).not.toBeInTheDocument()
    // Herunterladen bleibt: Betrachter dürfen laden (AC-45ε.16).
    expect(screen.getByRole("link", { name: /Original/ })).toBeInTheDocument()
  })

  it("Bauleitung sieht Ändern und Entfernen", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage
      />,
    )
    expect(screen.getByLabelText("Bildunterschrift")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Vom Bezug lösen/ }),
    ).toBeInTheDocument()
  })

  it("protokollierte Abnahme: ergänzen ja, entfernen nein — und die Fläche sagt es (Q-ε7)", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ acceptance_id: "acc-1" }}
        canManage
        frozen
      />,
    )
    expect(
      screen.getByRole("button", { name: /Foto hinzufügen/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Vom Bezug lösen/ }),
    ).not.toBeInTheDocument()
    // Der klemmende Fall wird BENANNT, nicht stumm ausgelassen.
    expect(
      screen.getByText(/protokolliert.*ergänzen.*nicht mehr entfernen/),
    ).toBeInTheDocument()
  })
})

describe("ConstructionPhotoStrip — Zustände", () => {
  it("Modul aus: die Strecke erscheint gar nicht (AC-45ε.18)", () => {
    photosMock.mockReturnValue(state({ moduleInactive: true, photos: [] }))
    const { container } = render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("die Galerie lädt die Vorschau, nicht das Original (AC-45ε.9)", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage={false}
      />,
    )
    const src = screen.getByRole("img").getAttribute("src") ?? ""
    expect(src).toContain("size=preview")
    // Das Original hängt am Herunterladen-Knopf, nicht am Bild.
    expect(
      screen.getByRole("link", { name: /Original/ }).getAttribute("href"),
    ).toContain("size=original")
  })

  it("leere Strecke erklärt, was zulässig ist, statt nur „keine Fotos“", () => {
    photosMock.mockReturnValue(state({ photos: [] }))
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage
      />,
    )
    expect(screen.getByText(/JPEG und PNG bis 50 MB/)).toBeInTheDocument()
  })

  it("erklärt, was die Quota zählt (AC-45εH-17)", () => {
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage
      />,
    )
    expect(
      screen.getByText(/zählt nur die Originaldatei/),
    ).toBeInTheDocument()
  })

  it("ohne Aufnahmezeit wird gesagt, dass keine erfunden wird (AC-45ε.7)", () => {
    photosMock.mockReturnValue(state({ photos: [photo({ taken_on: null })] }))
    render(
      <ConstructionPhotoStrip
        projectId={PROJECT}
        anchor={{ defect_id: "def-1" }}
        canManage
      />,
    )
    expect(screen.getByText(/es wird kein Datum erfunden/)).toBeInTheDocument()
  })
})
